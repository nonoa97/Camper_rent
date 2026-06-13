import type { CamperResult } from './availability'
import type { AvailabilityCriteriaCompatibilityResult } from './availabilityMemory'
import type { NextQuestion } from './nextQuestion'
import type {
  AvailabilityMemorySlot,
  AvailabilityMemorySource,
  ConversationState,
  SessionAvailabilityResult,
} from './state'
import {
  dedupeBy,
  ensureConversationMemory,
} from './stateLifecycle'

const HU_MONTH_NAMES = [
  'január',
  'február',
  'március',
  'április',
  'május',
  'június',
  'július',
  'augusztus',
  'szeptember',
  'október',
  'november',
  'december',
]

const HU_MONTH_SUFFIXES: Record<string, { inMonth: string; forMonth: string }> = {
  január: { inMonth: 'januárban', forMonth: 'januárra' },
  február: { inMonth: 'februárban', forMonth: 'februárra' },
  március: { inMonth: 'márciusban', forMonth: 'márciusra' },
  április: { inMonth: 'áprilisban', forMonth: 'áprilisra' },
  május: { inMonth: 'májusban', forMonth: 'májusra' },
  június: { inMonth: 'júniusban', forMonth: 'júniusra' },
  július: { inMonth: 'júliusban', forMonth: 'júliusra' },
  augusztus: { inMonth: 'augusztusban', forMonth: 'augusztusra' },
  szeptember: { inMonth: 'szeptemberben', forMonth: 'szeptemberre' },
  október: { inMonth: 'októberben', forMonth: 'októberre' },
  november: { inMonth: 'novemberben', forMonth: 'novemberre' },
  december: { inMonth: 'decemberben', forMonth: 'decemberre' },
}

type MonthLabelCase = 'plain' | 'inMonth' | 'forMonth'

export type AvailabilitySearchBranch = {
  label: string
  state: ConversationState
}

const MAX_RECOMMENDATION_BRANCHES = 3

function formatMonthLabel(month?: string, labelCase: MonthLabelCase = 'plain'): string {
  if (!month) return 'a megadott hónapra'
  const [year, monthNumber] = month.split('-').map(Number)
  const monthName = HU_MONTH_NAMES[monthNumber - 1]
  if (!monthName) return `${month.replace('-', '.')}.`

  const casedMonthName = labelCase === 'plain'
    ? monthName
    : HU_MONTH_SUFFIXES[monthName][labelCase]
  return `${year}. ${casedMonthName}`
}

function formatDateLabel(date?: string): string {
  if (!date) return ''
  const [year, month, day] = date.split('-').map(Number)
  const monthName = HU_MONTH_NAMES[month - 1]
  return monthName ? `${year}. ${monthName} ${day}.` : `${date.replaceAll('-', '.')}.`
}

function formatDateRangeLabel(from: string, to: string, emphasize = false): string {
  const label = `${formatDateLabel(from)} és ${formatDateLabel(to)} között`
  return emphasize ? `**${label}**` : label
}

function formatAvailabilityWindowLabel(
  state: ConversationState,
  emphasize = false,
  monthCase: MonthLabelCase = 'plain',
): string {
  if (state.startDate && state.endDate) {
    return formatDateRangeLabel(state.startDate, state.endDate, emphasize)
  }
  return formatMonthLabel(state.month, monthCase)
}

export function buildProgressiveAvailabilityReply(
  state: ConversationState,
  nextQuestionData: NextQuestion | null,
  hasMatches: boolean,
): string | null {
  if (!state.month && !(state.startDate && state.endDate)) return null

  const durationPart = state.durationDays ? ` ${state.durationDays} napra` : ''

  if (!hasMatches) {
    const unavailableWindowLabel = formatAvailabilityWindowLabel(state, false, 'forMonth')
    if (state.durationDays) {
      return `Sajnos ${unavailableWindowLabel} ${state.durationDays} napra nem találok szabad lakóautót. Megnézhetem, melyik a legkorábbi időszak, amikor ennyi napra van szabad autó, vagy kereshetünk rövidebb útra ebben az időszakban.`
    }
    return `Sajnos ${unavailableWindowLabel} nem találok szabad lakóautót. Megnézhetem, melyik a legkorábbi hónap, amikor van szabad autó.`
  }

  if (!nextQuestionData) return null

  if (state.startDate && state.endDate) {
    return nextQuestionData.question
  }

  const prefix = state.durationDays
    ? `Találtam szabad opciót ${formatAvailabilityWindowLabel(state, false, 'inMonth')}${durationPart}.`
    : `Találtam szabad opciót ${formatAvailabilityWindowLabel(state, false, 'inMonth')}.`

  return `${prefix} ${nextQuestionData.question}`
}

function uniqueNumbers(values: Array<number | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0))]
}

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).filter(Boolean))]
}

function getDurationBranchValues(state: ConversationState): number[] {
  const flexible = state.flexibleCriteria?.durationDays
  if (!flexible) return state.durationDays ? [state.durationDays] : []

  const alternatives = uniqueNumbers(flexible.alternatives ?? [])
  if (alternatives.length > 1) return alternatives
  if (flexible.min && flexible.max && flexible.min !== flexible.max && !flexible.preferred && !state.durationDays) {
    return uniqueNumbers([flexible.min, flexible.max])
  }
  return uniqueNumbers([state.durationDays, flexible.preferred, flexible.min, alternatives[0]])
}

export function createFlexibleSearchBranches(state: ConversationState): AvailabilitySearchBranch[] | null {
  const flexible = state.flexibleCriteria
  if (!flexible) return null

  const preferredStartWindows = !state.startDate
    ? (flexible.preferredStartWindows ?? []).filter(window => window.startDate <= window.endDate)
    : []
  const months = !state.startDate && preferredStartWindows.length === 0 ? uniqueStrings(flexible.months) : []
  const durations = getDurationBranchValues(state)
  const campingTypes = !state.campingType
    ? [...new Set(flexible.campingTypes ?? [])].filter(value => value !== 'wild')
    : []

  const dimensions = [
    preferredStartWindows.length > 1 ? preferredStartWindows.map(window => ({ kind: 'preferredStartWindow' as const, value: window })) : [null],
    months.length > 1 ? months.map(month => ({ kind: 'month' as const, value: month })) : [null],
    durations.length > 1 ? durations.map(duration => ({ kind: 'duration' as const, value: duration })) : [null],
    campingTypes.length > 1 ? campingTypes.map(campingType => ({ kind: 'campingType' as const, value: campingType })) : [null],
  ]

  const branchCount = dimensions.reduce((count, values) => count * values.length, 1)
  if (branchCount <= 1) return null
  if (branchCount > MAX_RECOMMENDATION_BRANCHES) return null

  const branches: AvailabilitySearchBranch[] = []
  for (const preferredStartChoice of dimensions[0]) {
    for (const monthChoice of dimensions[1]) {
      for (const durationChoice of dimensions[2]) {
        for (const campingChoice of dimensions[3]) {
        const branchState: ConversationState = { ...state }
        const labels: string[] = []
        if (preferredStartChoice?.kind === 'preferredStartWindow') {
          branchState.flexibleCriteria = {
            ...(branchState.flexibleCriteria ?? {}),
            preferredStartWindows: [preferredStartChoice.value],
            months: undefined,
          }
          branchState.month = undefined
          branchState.startDate = undefined
          branchState.endDate = undefined
          branchState.earliestAvailable = undefined
          labels.push(preferredStartChoice.value.label ?? `${preferredStartChoice.value.startDate} - ${preferredStartChoice.value.endDate}`)
        }
        if (monthChoice?.kind === 'month') {
          branchState.month = monthChoice.value
          branchState.startDate = undefined
          branchState.endDate = undefined
          branchState.earliestAvailable = undefined
          labels.push(monthChoice.value)
        }
        if (durationChoice?.kind === 'duration') {
          branchState.durationDays = durationChoice.value
          labels.push(`${durationChoice.value} nap`)
        }
        if (campingChoice?.kind === 'campingType') {
          branchState.campingType = campingChoice.value
          labels.push('kempinghely')
        }
        branches.push({ label: labels.join(' + '), state: branchState })
      }
    }
  }
  }

  return branches.slice(0, MAX_RECOMMENDATION_BRANCHES)
}

export function sessionAvailabilityToMemorySlot(result: SessionAvailabilityResult): AvailabilityMemorySlot {
  return {
    startDate: result.from,
    endDate: result.to,
    durationDays: result.days,
    camperSlug: result.camperSlug,
    camperName: result.camperName,
    source: result.source === 'fallback_earliest' ? 'fallback_earliest' : result.source === 'longest' ? 'longest' : 'earliest',
  }
}

export function getFirstAvailableResult(results: CamperResult[]): { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null {
  for (const camper of results) {
    const slot = camper.availableSlots[0]
    if (slot) return { camper, slot }
  }
  return null
}

function rememberAvailabilitySlot(
  state: ConversationState,
  candidate: { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null,
  source: AvailabilityMemorySource,
) {
  if (!candidate) return

  const nextSlot: AvailabilityMemorySlot = {
    startDate: candidate.slot.from,
    endDate: candidate.slot.to,
    durationDays: candidate.slot.days,
    camperSlug: candidate.camper.slug,
    camperName: candidate.camper.name,
    source,
  }
  const memory = ensureConversationMemory(state)
  memory.mentionedAvailabilityOptions = dedupeBy(
    [...(memory.mentionedAvailabilityOptions ?? []), nextSlot],
    slot => `${slot.startDate}|${slot.endDate ?? ''}|${slot.durationDays ?? ''}|${slot.camperSlug ?? ''}`,
  ).slice(-8)
  memory.lastAssistantOffer = {
    type: 'availability_option',
    label: nextSlot.endDate
      ? `${nextSlot.startDate} - ${nextSlot.endDate}`
      : `${nextSlot.startDate}-tól`,
    availabilityOption: nextSlot,
    camperSlug: nextSlot.camperSlug,
  }
  memory.pendingDecision = {
    type: 'availability_option',
    label: memory.lastAssistantOffer.label,
    availabilityOption: nextSlot,
    camperSlug: nextSlot.camperSlug,
  }
}

export function getReferencedAvailabilitySlot(state: ConversationState): AvailabilityMemorySlot | null {
  const slots = state.conversationMemory?.mentionedAvailabilityOptions ?? state.lastAvailabilitySlots ?? []
  if (slots.length === 0) return null

  const currentReferenceDate = state.pendingAvailabilityConfirmation?.startDate ?? state.startDate
  if (!currentReferenceDate) return slots[slots.length - 1]

  const earlierSlots = slots
    .filter(slot => slot.startDate < currentReferenceDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  return earlierSlots[earlierSlots.length - 1] ?? slots[slots.length - 1]
}

export function applyAvailabilitySlotConfirmation(state: ConversationState, slot: AvailabilityMemorySlot) {
  state.pendingAvailabilityConfirmation = {
    month: slot.startDate.slice(0, 7),
    startDate: slot.startDate,
    endDate: slot.endDate,
    durationDays: slot.durationDays,
    camperSlug: slot.camperSlug,
    camperName: slot.camperName,
  }
  ensureConversationMemory(state).pendingDecision = {
    type: 'availability_option',
    label: slot.endDate ? `${slot.startDate} - ${slot.endDate}` : `${slot.startDate}-tól`,
    availabilityOption: slot,
    camperSlug: slot.camperSlug,
  }
}

export function buildRememberedSlotDurationReply(
  slot: AvailabilityMemorySlot | null,
  compatibility: AvailabilityCriteriaCompatibilityResult = { status: 'compatible', reasons: [] },
): string {
  if (!slot) {
    return 'Az előbb említett elérhetőségi opció részlete már nincs meg ebben a beszélgetésben. Megnézhetem újra a szabad időszakokat.'
  }

  const start = formatDateLabel(slot.startDate)
  const isRelaxed = compatibility.status === 'compatible_relaxed'
  const needsRecheck = compatibility.status === 'needs_recheck'
  const isStale = compatibility.status === 'stale'

  if (slot.endDate && slot.durationDays) {
    const range = formatDateRangeLabel(slot.startDate, slot.endDate, true)
    if (isStale) {
      return `Ez a korábbi opció még az előző feltételek mellett volt: ${range}, legfeljebb ${slot.durationDays} napra. Az új feltételekkel érdemes újrakeresni, hogy ne mondjak félrevezető elérhetőséget.`
    }
    if (needsRecheck) {
      return `A korábbi opciót látom: ${range}, akkor legfeljebb ${slot.durationDays} napra volt értelmezhető. Az aktuális feltételek szigorúbbak, ezért ezt újra kell ellenőriznem, mielőtt ajánlatként kezelnénk.`
    }
    if (isRelaxed) {
      return `A korábbi ${start} kezdés az új, lazább feltételekkel is használható kiindulópont: legfeljebb ${slot.durationDays} napra látok szabad időszakot: ${range}. Megfelel ez az időszak?`
    }
    return `A korábbi ${start} kezdésnél legfeljebb ${slot.durationDays} napra látok szabad időszakot: ${range}. Megfelel ez az időszak?`
  }

  if (isStale) {
    return `Ez a korábbi ${start} kezdés még az előző feltételek mellett volt. Az új feltételekkel érdemes újrakeresni, hogy biztosan aktuális elérhetőséget nézzünk.`
  }
  if (needsRecheck) {
    return `A korábbi ${start} kezdést látom, de az aktuális feltételek szigorúbbak, ezért ezt újra kell ellenőriznem.`
  }

  return `A korábbi ${start} kezdést látom. Ha ezt szeretnéd, megnézem hozzá a foglalható időtartamot.`
}

export function buildEarliestAvailabilityConfirmation(
  state: ConversationState,
  results: CamperResult[],
): string {
  const first = getFirstAvailableResult(results)
  if (!first) {
    return state.durationDays
      ? `Sajnos a következő időszakban sem találok szabad lakóautót ${state.durationDays} napra. Megpróbálhatunk rövidebb időtartamot vagy későbbi hónapot.`
      : 'Sajnos a következő időszakban sem találok szabad lakóautót. Megpróbálhatunk későbbi hónapot vagy rugalmasabb időszakot.'
  }

  if (state.durationDays) {
    const range = formatDateRangeLabel(first.slot.from, first.slot.to, true)
    return `Leghamarabb ${range} találok szabad autót ${state.durationDays} napra. Megfelel ez az időszak?`
  }

  const from = formatDateLabel(first.slot.from)
  return `Leghamarabb ${from}-tól találok szabad autót. Megfelel ez a kezdés? Ha igen, utána megbeszéljük, hány napra mennél.`
}

export function buildFallbackAvailabilityShiftConfirmation(
  state: ConversationState,
  results: CamperResult[],
): string {
  const first = getFirstAvailableResult(results)
  const previousRange = state.startDate && state.endDate
    ? formatDateRangeLabel(state.startDate, state.endDate, true)
    : formatAvailabilityWindowLabel(state, true, 'forMonth')

  const hasHardWildCampingCapability = state.capabilityPreferences?.some(
    preference => preference.key === 'wild_camping' && preference.strength === 'hard',
  )
  const condition = hasHardWildCampingCapability
    ? 'a vadkempinges feltétellel'
    : state.campingType === 'camping_site'
      ? 'kempinghelyes megállással'
      : 'ezekkel a feltételekkel'

  if (!first) {
    return `Az elfogadott ${previousRange} időszakra ${condition} nem látok szabad lakóautót. Megpróbálhatunk rövidebb időtartamot vagy másik időszakot.`
  }

  const nextRange = formatDateRangeLabel(first.slot.from, first.slot.to, true)
  const durationPart = state.durationDays ? ` ${state.durationDays} napra` : ''
  return `Az elfogadott ${previousRange} időszakra ${condition} nem látok szabad lakóautót. Legközelebb ${nextRange} találok megfelelő opciót${durationPart}. Megfelel ez az időszak?`
}

export function applyEarliestPendingAvailability(
  state: ConversationState,
  results: CamperResult[],
  source: AvailabilityMemorySource = 'earliest',
) {
  const first = getFirstAvailableResult(results)
  if (!first) {
    state.pendingAvailabilityConfirmation = undefined
    return
  }

  rememberAvailabilitySlot(state, first, source)
  state.pendingAvailabilityConfirmation = {
    month: first.slot.from.slice(0, 7),
    startDate: first.slot.from,
    endDate: state.durationDays ? first.slot.to : undefined,
    durationDays: state.durationDays,
    camperSlug: first.camper.slug,
    camperName: first.camper.name,
  }
}

export function getLongestAvailableSlot(results: CamperResult[]): { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null {
  let longest: { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null = null
  for (const camper of results) {
    for (const slot of camper.availableSlots) {
      if (!longest || slot.days > longest.slot.days) {
        longest = { camper, slot }
      }
    }
  }
  return longest
}

export function buildLongestAvailableDurationReply(state: ConversationState, results: CamperResult[]): string {
  const longest = getLongestAvailableSlot(results)
  const monthLabel = formatMonthLabel(state.month, 'inMonth')
  if (!longest) {
    return `${monthLabel} nem találok foglalható szabad időszakot. Megnézhetem, melyik a legkorábbi hónap, amikor van szabad autó.`
  }

  const range = formatDateRangeLabel(longest.slot.from, longest.slot.to, true)
  const requestedPart = state.durationDays
    ? ` A korábban kért ${state.durationDays} nap helyett`
    : ''

  return `${monthLabel}${requestedPart} a leghosszabb foglalható szabad idő ${longest.slot.days} nap: ${range}. Megfelel ez az időszak?`
}

export function applyLongestPendingAvailability(state: ConversationState, results: CamperResult[]) {
  const longest = getLongestAvailableSlot(results)
  if (!longest) {
    state.pendingAvailabilityConfirmation = undefined
    return
  }

  rememberAvailabilitySlot(state, longest, 'longest')
  state.pendingAvailabilityConfirmation = {
    month: longest.slot.from.slice(0, 7),
    startDate: longest.slot.from,
    endDate: longest.slot.to,
    durationDays: longest.slot.days,
    camperSlug: longest.camper.slug,
    camperName: longest.camper.name,
  }
}
