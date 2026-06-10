import { NextRequest, NextResponse } from 'next/server'
import OpenAI from 'openai'
import {
  AvailabilityCriteria,
  AvailabilityMemorySlot,
  AvailabilityMemorySource,
  ConstraintMemory,
  ConversationState,
  FlowState,
  MentionedCamperMemory,
  MemoryConcernType,
  RefinementPreference,
  SessionAvailabilityResult,
  SessionMemory,
  SessionRecommendationResult,
  SessionShownOption,
  mergeState,
} from '@/lib/chat/state'
import { extractStateUpdate } from '@/lib/chat/extractState'
import { getNextMissingQuestion, NextQuestion } from '@/lib/chat/nextQuestion'
import { searchAvailableCampers, findEarliestAvailableCamper, getSpecificCamperAvailability, CamperResult } from '@/lib/chat/availability'
import { loadFaqItems, FaqItem } from '@/lib/chat/faq'
import { loadExtras, ExtraItem } from '@/lib/chat/extras'
import { loadCatalogSummary, CatalogEntry } from '@/lib/chat/catalog'
import { validateGptOutput, FALLBACK_OUTPUT } from '@/lib/chat/validateOutput'
import { SYSTEM_PROMPT, buildContextBlock, GptContext, SearchType } from '@/lib/chat/prompts'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

type HistoryItem = { role: 'user' | 'assistant'; content: string }

type ApiRequest = {
  message: string
  history?: HistoryItem[]
  state?: ConversationState
  flowState?: FlowState
  sessionMemory?: SessionMemory
}

type EnrichedRecommendation = {
  slug: string
  text: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  beds: number | null
}

type AvailabilitySlot = {
  slug: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  beds: number | null
  from: string
  to: string
  days: number
}

function countKnownFields(s: ConversationState): number {
  let n = 0
  if (s.month || s.startDate || s.earliestAvailable) n++
  if (s.durationDays) n++
  if (s.passengers) n++
  if (s.campingType) n++
  if (s.extraRequirements?.length) n++
  if (s.softPreferences?.length) n++
  return n
}

function applyRefinement(
  results: CamperResult[],
  preference: RefinementPreference | null | undefined,
  lastPrice?: number,
): { refined: CamperResult[]; boundaryReached: boolean } {
  if (!preference) return { refined: results, boundaryReached: false }
  const sorted = [...results]

  switch (preference) {
    case 'cheaper': {
      const filtered = lastPrice !== undefined
        ? sorted.filter(c => c.price_per_day < lastPrice).sort((a, b) => b.price_per_day - a.price_per_day)
        : sorted.sort((a, b) => a.price_per_day - b.price_per_day)
      return { refined: filtered, boundaryReached: filtered.length === 0 && results.length > 0 }
    }
    case 'more_expensive': {
      const filtered = lastPrice !== undefined
        ? sorted.filter(c => c.price_per_day > lastPrice).sort((a, b) => a.price_per_day - b.price_per_day)
        : sorted.sort((a, b) => b.price_per_day - a.price_per_day)
      return { refined: filtered, boundaryReached: filtered.length === 0 && results.length > 0 }
    }
    case 'smaller':
      return { refined: sorted.sort((a, b) => (a.beds ?? 4) - (b.beds ?? 4)), boundaryReached: false }
    case 'bigger':
      return { refined: sorted.sort((a, b) => (b.beds ?? 4) - (a.beds ?? 4)), boundaryReached: false }
    case 'different':
    default:
      return { refined: results, boundaryReached: results.length === 0 }
  }
}

const BOUNDARY_NOTES: Record<string, string> = {
  cheaper: 'HATÁRESET: nincs olcsóbb megfelelő opció. Mondd el röviden, és ajánlj feltételmódosítást.',
  more_expensive: 'HATÁRESET: nincs drágább megfelelő opció. Mondd el röviden.',
  smaller: 'HATÁRESET: nincs kisebb megfelelő opció. Mondd el röviden.',
  bigger: 'HATÁRESET: nincs nagyobb megfelelő opció. Mondd el röviden.',
  different: 'HATÁRESET: nincs több meg nem mutatott megfelelő opció. Mondd el röviden, és ajánlj feltételmódosítást.',
}

function resolveMode(
  state: ConversationState,
  nextQuestion: string | null,
  refinementPreference?: string | null,
): GptContext['mode'] {
  if (nextQuestion && state.intent !== 'faq' && state.intent !== 'booking' && state.intent !== 'catalog') {
    return 'ask_next_question'
  }
  // Task 3: refinement after availability/any mode → recommend (refinement is a recommendation concept)
  if (refinementPreference && !nextQuestion) {
    return 'recommend'
  }
  switch (state.intent) {
    case 'faq':             return 'faq'
    case 'booking':         return 'booking'
    case 'catalog':         return 'catalog'
    case 'availability':    return 'availability'
    case 'recommendation':  return 'recommend'
    default: {
      // Task 1: only recommend when recommendation context exists — bare undefined intent defaults to catalog
      const hasRecommendationContext = !!(
        state.month || state.startDate || state.durationDays || state.passengers ||
        state.campingType || state.extraRequirements?.length || state.softPreferences?.length ||
        state.earliestAvailable || state.alreadyRecommendedSlugs?.length
      )
      return hasRecommendationContext ? 'recommend' : 'catalog'
    }
  }
}

function isChecklistIntent(intent: ConversationState['intent']): boolean {
  return intent === 'recommendation' || intent === 'availability' || !intent
}

function hasChecklistAnswerUpdate(update: Partial<ConversationState>): boolean {
  return !!(
    update.month ||
    update.startDate ||
    update.endDate ||
    update.durationDays ||
    update.passengers ||
    update.campingType ||
    update.extraRequirementsAsked ||
    (update.extraRequirements?.length ?? 0) > 0 ||
    (update.softPreferences?.length ?? 0) > 0 ||
    (update.skippedChecklist?.length ?? 0) > 0
  )
}

function answersCurrentChecklistField(
  field: ConversationState['lastAskedField'],
  update: Partial<ConversationState>,
): boolean {
  switch (field) {
    case 'month':
      return !!(update.month || update.startDate || update.earliestAvailable)
    case 'durationDays':
      return !!update.durationDays
    case 'passengers':
      return !!update.passengers
    case 'campingType':
      return !!update.campingType || !!update.skippedChecklist?.includes('campingType')
    case 'extraRequirements':
      return !!(
        update.extraRequirementsAsked ||
        update.extraRequirements?.length ||
        update.softPreferences?.length ||
        update.skippedChecklist?.includes('extraRequirements')
      )
    default:
      return false
  }
}

function answersNonTimingChecklistField(
  field: ConversationState['lastAskedField'],
  update: Partial<ConversationState>,
): boolean {
  return (
    field === 'passengers' ||
    field === 'campingType' ||
    field === 'extraRequirements'
  ) && answersCurrentChecklistField(field, update)
}

function hasSpecificUserUpdate(update: Partial<ConversationState>): boolean {
  return !!(
    update.month ||
    update.startDate ||
    update.endDate ||
    update.durationDays ||
    update.passengers ||
    update.campingType ||
    update.extraRequirementsAsked ||
    update.extraRequirements?.length ||
    update.softPreferences?.length ||
    update.refinementPreference ||
    update.availabilityQuestion ||
    update.skippedChecklist?.length ||
    update.intent === 'faq' ||
    update.intent === 'booking' ||
    update.intent === 'catalog'
  )
}

function ensureQuestionOnce(reply: string, question: string): string {
  const trimmedReply = reply.trim()
  if (!trimmedReply) return question

  const firstIndex = trimmedReply.indexOf(question)
  if (firstIndex === -1) return `${trimmedReply} ${question}`

  let deduped = trimmedReply.slice(0, firstIndex + question.length)
  let rest = trimmedReply.slice(firstIndex + question.length)
  while (rest.includes(question)) {
    const duplicateIndex = rest.indexOf(question)
    rest = rest.slice(0, duplicateIndex) + rest.slice(duplicateIndex + question.length)
  }
  deduped += rest
  return deduped.replace(/\s+/g, ' ').trim()
}

function keepOnlyOneChecklistQuestion(reply: string, question: string): string {
  const ensured = ensureQuestionOnce(reply, question)
  const questionIndex = ensured.indexOf(question)
  if (questionIndex <= 0) return ensured

  const prefix = ensured.slice(0, questionIndex).trim()
  if (prefix.includes('?')) return question

  return ensured
}

const CHECKLIST_QUESTIONS: Record<NextQuestion['field'], string[]> = {
  month: ['Mikor mennél?', 'Mikor szeretnétek menni?'],
  durationDays: ['Hány napra tervezed?', 'Hány napra terveztek?'],
  passengers: ['Hány fővel utaznál?', 'Hányan utaznátok?'],
  campingType: [
    'Inkább vadkempingeznél, vagy kempinghelyen állnál meg?',
    'Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?',
  ],
  extraRequirements: ['Van még valami szempont vagy igény, amit figyelembe vegyek?'],
}

function removeQuestion(reply: string, question: string): string {
  let cleaned = reply
  while (cleaned.includes(question)) {
    cleaned = cleaned.replace(question, '')
  }
  return cleaned.replace(/\s+([?.!,])/g, '$1').replace(/\s+/g, ' ').trim()
}

function isChecklistFieldResolved(state: ConversationState, field: NextQuestion['field']): boolean {
  const skipped = new Set(state.skippedChecklist ?? [])
  if (skipped.has(field)) return true

  switch (field) {
    case 'month':
      return !!(state.month || state.startDate || state.earliestAvailable)
    case 'durationDays':
      return !!(state.durationDays || (state.startDate && state.endDate))
    case 'passengers':
      return !!state.passengers
    case 'campingType':
      return !!state.campingType
    case 'extraRequirements':
      return !!state.extraRequirementsAsked
    default:
      return false
  }
}

function removeResolvedChecklistQuestions(
  reply: string,
  state: ConversationState,
  currentQuestionField?: NextQuestion['field'],
): string {
  const cleaned = (Object.entries(CHECKLIST_QUESTIONS) as Array<[NextQuestion['field'], string[]]>)
    .reduce((currentReply, [field, questions]) => {
      if (field === currentQuestionField || !isChecklistFieldResolved(state, field)) {
        return currentReply
      }
      return questions.reduce(
        (replyWithoutQuestion, question) => removeQuestion(replyWithoutQuestion, question),
        currentReply,
      )
    }, reply)
  return currentQuestionField ? cleaned.trim() : (cleaned.trim() ? cleaned : reply)
}

function removeAllChecklistQuestions(reply: string): string {
  const cleaned = Object.values(CHECKLIST_QUESTIONS)
    .flat()
    .reduce((currentReply, question) => removeQuestion(currentReply, question), reply)
  return cleaned.trim() ? cleaned : reply
}

function removeMisleadingNoInfoForChecklist(reply: string): string {
  const cleaned = reply
    .replace(/\bErről jelenleg nincs pontos információm\.?\s*/gi, '')
    .replace(/\bEzt nem látom a rendszerben\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || reply
}

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

function buildProgressiveAvailabilityReply(
  state: ConversationState,
  nextQuestionData: NextQuestion | null,
  hasMatches: boolean,
): string | null {
  if (!state.month && !(state.startDate && state.endDate)) return null

  const windowLabel = formatAvailabilityWindowLabel(state)
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

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().split('T')[0]
}

function normalizeFlowFromIntent(intent: ConversationState['intent']): FlowState['activeFlow'] {
  if (intent === 'faq' || intent === 'booking' || intent === 'catalog' || intent === 'availability' || intent === 'recommendation') {
    return intent
  }
  return 'recommendation'
}

function normalizeCriteriaList(items?: string[]): string[] | undefined {
  const normalized = [...new Set((items ?? []).map(item => item.trim()).filter(Boolean))].sort()
  return normalized.length ? normalized : undefined
}

function createAvailabilityCriteria(state: ConversationState): AvailabilityCriteria {
  const criteria: AvailabilityCriteria = {}
  if (state.month) criteria.month = state.month
  if (state.startDate) criteria.startDate = state.startDate
  if (state.endDate) criteria.endDate = state.endDate
  if (state.durationDays !== undefined) criteria.durationDays = state.durationDays
  if (state.passengers !== undefined) criteria.passengers = state.passengers
  if (state.campingType) criteria.campingType = state.campingType
  const extraRequirements = normalizeCriteriaList(state.extraRequirements)
  if (extraRequirements) criteria.extraRequirements = extraRequirements
  const softPreferences = normalizeCriteriaList(state.softPreferences)
  if (softPreferences) criteria.softPreferences = softPreferences
  if (state.earliestAvailable !== undefined) criteria.earliestAvailable = state.earliestAvailable
  return criteria
}

function createCriteriaHash(criteria: AvailabilityCriteria): string {
  const normalized: AvailabilityCriteria = {
    month: criteria.month,
    startDate: criteria.startDate,
    endDate: criteria.endDate,
    durationDays: criteria.durationDays,
    passengers: criteria.passengers,
    campingType: criteria.campingType,
    extraRequirements: normalizeCriteriaList(criteria.extraRequirements),
    softPreferences: normalizeCriteriaList(criteria.softPreferences),
    earliestAvailable: criteria.earliestAvailable,
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined),
    ),
  )
}

function criteriaValueMatches(
  savedValue: string | number | boolean | string[] | undefined,
  currentValue: string | number | boolean | string[] | undefined,
): boolean {
  if (savedValue === undefined && currentValue === undefined) return true
  if (savedValue === undefined || currentValue === undefined) return false
  if (Array.isArray(savedValue) || Array.isArray(currentValue)) {
    if (!Array.isArray(savedValue) || !Array.isArray(currentValue)) return false
    return JSON.stringify(normalizeCriteriaList(savedValue) ?? []) === JSON.stringify(normalizeCriteriaList(currentValue) ?? [])
  }
  return savedValue === currentValue
}

type CriteriaCompatibilityStatus = 'compatible' | 'compatible_relaxed' | 'needs_recheck' | 'stale'

type CriteriaCompatibilityResult = {
  status: CriteriaCompatibilityStatus
  reasons: string[]
}

type SearchBranch = {
  label: string
  state: ConversationState
}

type BranchSearchSummary = {
  label: string
  criteria: AvailabilityCriteria
  resultCount: number
}

const MAX_RECOMMENDATION_BRANCHES = 3

function uniqueNumbers(values: Array<number | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0))]
}

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).filter(Boolean))]
}

function applyFlexibleCriteriaDefaults(state: ConversationState): void {
  const flexible = state.flexibleCriteria
  if (!flexible) return

  const months = uniqueStrings(flexible.months)
  if (!state.month && !state.startDate && months.length === 1) {
    state.month = months[0]
  }

  const duration = flexible.durationDays
  if (!state.durationDays && duration) {
    const alternatives = uniqueNumbers(duration.alternatives ?? [])
    state.durationDays = duration.preferred ?? (duration.min && duration.max ? Math.min(duration.max, Math.max(duration.min, duration.preferred ?? duration.min)) : undefined)
    if (!state.durationDays && alternatives.length === 1) state.durationDays = alternatives[0]
  }

  const passengers = flexible.passengers
  if (!state.passengers && passengers) {
    const alternatives = uniqueNumbers(passengers.alternatives ?? [])
    state.passengers = passengers.max ?? (alternatives.length > 0 ? Math.max(...alternatives) : passengers.min)
  }

  const campingTypes = flexible.campingTypes ?? []
  if (!state.campingType && campingTypes.length === 1) {
    state.campingType = campingTypes[0]
  }
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

function createFlexibleSearchBranches(state: ConversationState): SearchBranch[] | null {
  const flexible = state.flexibleCriteria
  if (!flexible) return null

  const months = !state.startDate ? uniqueStrings(flexible.months) : []
  const durations = getDurationBranchValues(state)
  const campingTypes = !state.campingType ? [...new Set(flexible.campingTypes ?? [])] : []

  const dimensions = [
    months.length > 1 ? months.map(month => ({ kind: 'month' as const, value: month })) : [null],
    durations.length > 1 ? durations.map(duration => ({ kind: 'duration' as const, value: duration })) : [null],
    campingTypes.length > 1 ? campingTypes.map(campingType => ({ kind: 'campingType' as const, value: campingType })) : [null],
  ]

  const branchCount = dimensions.reduce((count, values) => count * values.length, 1)
  if (branchCount <= 1) return null
  if (branchCount > MAX_RECOMMENDATION_BRANCHES) return null

  const branches: SearchBranch[] = []
  for (const monthChoice of dimensions[0]) {
    for (const durationChoice of dimensions[1]) {
      for (const campingChoice of dimensions[2]) {
        const branchState: ConversationState = { ...state }
        const labels: string[] = []
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
          labels.push(campingChoice.value === 'wild' ? 'vadkemping' : 'kempinghely')
        }
        branches.push({ label: labels.join(' + '), state: branchState })
      }
    }
  }

  return branches.slice(0, MAX_RECOMMENDATION_BRANCHES)
}

function includesAllValues(base?: string[], candidate?: string[]): boolean {
  const baseSet = new Set(normalizeCriteriaList(base) ?? [])
  const candidateSet = new Set(normalizeCriteriaList(candidate) ?? [])
  for (const value of candidateSet) {
    if (!baseSet.has(value)) return false
  }
  return true
}

function evaluateCriteriaCompatibility(
  criteria: AvailabilityCriteria | undefined,
  currentState: ConversationState,
): CriteriaCompatibilityResult {
  if (!criteria) {
    return { status: 'stale', reasons: ['missing_saved_criteria'] }
  }

  const currentCriteria = createAvailabilityCriteria(currentState)
  const reasons: string[] = []
  let status: CriteriaCompatibilityStatus = 'compatible'

  const setStatus = (next: CriteriaCompatibilityStatus, reason: string) => {
    reasons.push(reason)
    const rank: Record<CriteriaCompatibilityStatus, number> = {
      compatible: 0,
      compatible_relaxed: 1,
      needs_recheck: 2,
      stale: 3,
    }
    if (rank[next] > rank[status]) status = next
  }

  const savedHasConcreteWindow = !!(criteria.startDate || criteria.endDate || criteria.month)
  const currentHasConcreteWindow = !!(currentCriteria.startDate || currentCriteria.endDate || currentCriteria.month)

  if (
    criteria.startDate !== currentCriteria.startDate ||
    criteria.endDate !== currentCriteria.endDate ||
    criteria.month !== currentCriteria.month
  ) {
    setStatus('stale', 'time_window_changed')
  }

  if (criteria.earliestAvailable !== currentCriteria.earliestAvailable) {
    if (savedHasConcreteWindow && currentHasConcreteWindow) {
      setStatus('needs_recheck', 'earliest_mode_changed_for_same_window')
    } else {
      setStatus('stale', 'earliest_mode_changed')
    }
  }

  if (criteria.durationDays !== undefined && currentCriteria.durationDays !== undefined) {
    if (currentCriteria.durationDays < criteria.durationDays) {
      setStatus('compatible_relaxed', 'duration_decreased')
    } else if (currentCriteria.durationDays > criteria.durationDays) {
      setStatus('needs_recheck', 'duration_increased')
    }
  } else if (criteria.durationDays !== currentCriteria.durationDays) {
    setStatus('needs_recheck', 'duration_specificity_changed')
  }

  if (criteria.passengers !== undefined && currentCriteria.passengers !== undefined) {
    if (currentCriteria.passengers < criteria.passengers) {
      setStatus('compatible_relaxed', 'passengers_decreased')
    } else if (currentCriteria.passengers > criteria.passengers) {
      setStatus('needs_recheck', 'passengers_increased')
    }
  } else if (criteria.passengers !== currentCriteria.passengers) {
    setStatus('needs_recheck', 'passenger_specificity_changed')
  }

  if (criteria.campingType && currentCriteria.campingType && criteria.campingType !== currentCriteria.campingType) {
    if (criteria.campingType === 'wild' && currentCriteria.campingType === 'camping_site') {
      setStatus('compatible_relaxed', 'camping_type_relaxed')
    } else {
      setStatus('needs_recheck', 'camping_type_stricter')
    }
  } else if (criteria.campingType !== currentCriteria.campingType) {
    setStatus('needs_recheck', 'camping_type_specificity_changed')
  }

  const savedExtras = normalizeCriteriaList(criteria.extraRequirements) ?? []
  const currentExtras = normalizeCriteriaList(currentCriteria.extraRequirements) ?? []
  if (!includesAllValues(savedExtras, currentExtras)) {
    setStatus('needs_recheck', 'hard_requirements_added')
  } else if (!includesAllValues(currentExtras, savedExtras)) {
    setStatus('compatible_relaxed', 'hard_requirements_removed')
  }

  // Soft preferences may affect ranking, but not whether a remembered availability slot existed.
  if (!criteriaValueMatches(criteria.softPreferences, currentCriteria.softPreferences)) {
    reasons.push('soft_preferences_changed')
  }

  return { status, reasons }
}

function isCriteriaUsableWithoutRecheck(criteria: AvailabilityCriteria | undefined, currentState: ConversationState): boolean {
  const status = evaluateCriteriaCompatibility(criteria, currentState).status
  return status === 'compatible' || status === 'compatible_relaxed'
}

function dedupeAvailabilityResults(results: SessionAvailabilityResult[]): SessionAvailabilityResult[] {
  return dedupeBy(
    results,
    item => `${item.camperSlug}|${item.from}|${item.to}|${item.days}|${item.source}|${item.criteriaHash ?? ''}`,
  )
}

function rememberSessionAvailability(
  sessionMemory: SessionMemory,
  candidate: { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null,
  source: SessionAvailabilityResult['source'],
  state: ConversationState,
): SessionMemory {
  if (!candidate) return sessionMemory
  const criteria = createAvailabilityCriteria(state)
  const next: SessionAvailabilityResult = {
    camperSlug: candidate.camper.slug,
    camperName: candidate.camper.name,
    from: candidate.slot.from,
    to: candidate.slot.to,
    days: candidate.slot.days,
    pricePerDay: candidate.camper.price_per_day,
    source,
    criteria,
    criteriaHash: createCriteriaHash(criteria),
  }
  return {
    ...sessionMemory,
    lastAvailabilityResult: next,
    previousAvailabilityResults: dedupeAvailabilityResults([
      ...(sessionMemory.previousAvailabilityResults ?? []),
      next,
    ]).slice(-8),
  }
}

function markStaleAvailabilityResults(sessionMemory: SessionMemory, state: ConversationState): SessionMemory {
  const candidates = dedupeAvailabilityResults([
    ...(sessionMemory.previousAvailabilityResults ?? []),
    ...(sessionMemory.lastAvailabilityResult ? [sessionMemory.lastAvailabilityResult] : []),
    ...(sessionMemory.lastSpecificCamperAvailability ? [sessionMemory.lastSpecificCamperAvailability] : []),
  ])
  const stale = candidates.filter(result => !isCriteriaUsableWithoutRecheck(result.criteria, state))
  return {
    ...sessionMemory,
    staleAvailabilityResults: dedupeAvailabilityResults([
      ...(sessionMemory.staleAvailabilityResults ?? []),
      ...stale,
    ]).slice(-8),
  }
}

function rememberSessionRecommendation(
  sessionMemory: SessionMemory,
  campers: CamperResult[],
): SessionMemory {
  if (campers.length === 0) return sessionMemory
  const existing = sessionMemory.shownOptions ?? []
  const nextOptions: SessionShownOption[] = campers.map((camper, index) => {
    const slot = camper.availableSlots[0]
    return {
      index: existing.length + index + 1,
      camperSlug: camper.slug,
      camperName: camper.name,
      from: slot?.from,
      to: slot?.to,
      days: slot?.days,
      pricePerDay: camper.price_per_day,
    }
  })
  const first = nextOptions[0]
  const lastRecommendationResult: SessionRecommendationResult = {
    camperSlug: first.camperSlug,
    camperName: first.camperName,
    from: first.from,
    to: first.to,
    days: first.days,
    pricePerDay: first.pricePerDay,
  }
  return {
    ...sessionMemory,
    lastRecommendationResult,
    shownOptions: dedupeBy(
      [...existing, ...nextOptions],
      option => `${option.camperSlug}|${option.from ?? ''}|${option.to ?? ''}|${option.index}`,
    ).slice(-12),
  }
}

type ResolvedSessionAvailabilityReference = {
  result: SessionAvailabilityResult
  compatibility: CriteriaCompatibilityResult
}

function choosePreferredAvailabilityResult(
  results: SessionAvailabilityResult[],
  state: ConversationState,
): ResolvedSessionAvailabilityReference | null {
  if (results.length === 0) return null
  const evaluated = results.map(result => ({
    result,
    compatibility: evaluateCriteriaCompatibility(result.criteria, state),
  }))
  const compatible = evaluated.filter(item =>
    item.compatibility.status === 'compatible' ||
    item.compatibility.status === 'compatible_relaxed',
  )
  const selected = compatible[compatible.length - 1] ?? evaluated[evaluated.length - 1]
  return {
    result: selected.result,
    compatibility: selected.compatibility,
  }
}

function resolveSessionAvailabilityReference(
  state: ConversationState,
  sessionMemory: SessionMemory,
): ResolvedSessionAvailabilityReference | null {
  if (state.referenceTarget === 'lastAvailability') {
    const result = sessionMemory.lastAvailabilityResult
    return result ? { result, compatibility: evaluateCriteriaCompatibility(result.criteria, state) } : null
  }

  if (state.referenceTarget === 'previousAvailability') {
    const results = sessionMemory.previousAvailabilityResults ?? []
    const currentStart = state.pendingAvailabilityConfirmation?.startDate ?? state.startDate
    if (currentStart) {
      const earlier = results
        .filter(result => result.from < currentStart)
        .sort((a, b) => a.from.localeCompare(b.from))
      return choosePreferredAvailabilityResult(earlier, state)
        ?? choosePreferredAvailabilityResult(results.slice(0, -1), state)
        ?? (sessionMemory.lastAvailabilityResult
          ? {
              result: sessionMemory.lastAvailabilityResult,
              compatibility: evaluateCriteriaCompatibility(sessionMemory.lastAvailabilityResult.criteria, state),
            }
          : null)
    }
    return choosePreferredAvailabilityResult(results.slice(0, -1), state)
      ?? (sessionMemory.lastAvailabilityResult
        ? {
            result: sessionMemory.lastAvailabilityResult,
            compatibility: evaluateCriteriaCompatibility(sessionMemory.lastAvailabilityResult.criteria, state),
          }
        : null)
  }

  return null
}

function sessionAvailabilityToMemorySlot(result: SessionAvailabilityResult): AvailabilityMemorySlot {
  return {
    startDate: result.from,
    endDate: result.to,
    durationDays: result.days,
    camperSlug: result.camperSlug,
    camperName: result.camperName,
    source: result.source === 'fallback_earliest' ? 'fallback_earliest' : result.source === 'longest' ? 'longest' : 'earliest',
  }
}

function updateFlowForResponse(
  flowState: FlowState,
  state: ConversationState,
  effectiveMode: GptContext['mode'],
  nextQuestionData: NextQuestion | null,
  isFaqInterruption: boolean,
): FlowState {
  if (nextQuestionData) {
    return {
      ...flowState,
      activeFlow: normalizeFlowFromIntent(state.intent),
      activeStep: 'checklist',
      pendingQuestionField: nextQuestionData.field,
      pendingQuestionText: nextQuestionData.question,
      canResumePreviousFlow: false,
    }
  }

  if (isFaqInterruption) {
    return {
      ...flowState,
      activeFlow: flowState.activeFlow ?? normalizeFlowFromIntent(state.intent),
      activeStep: flowState.activeStep ?? 'checklist',
      lastSideTopic: 'faq',
      canResumePreviousFlow: true,
    }
  }

  const activeStep: FlowState['activeStep'] =
    effectiveMode === 'ask_next_question' ? 'checklist'
      : effectiveMode === 'recommend' ? 'recommendation'
        : effectiveMode === 'availability' ? 'availability_check'
          : effectiveMode === 'booking' ? 'booking'
            : effectiveMode === 'catalog' ? 'catalog'
              : effectiveMode === 'faq' ? 'faq'
                : undefined

  return {
    ...flowState,
    activeFlow: normalizeFlowFromIntent(state.intent),
    activeStep,
    pendingQuestionField: undefined,
    pendingQuestionText: undefined,
    canResumePreviousFlow: false,
  }
}

function ensureConversationMemory(state: ConversationState) {
  state.conversationMemory = state.conversationMemory ?? {}
  return state.conversationMemory
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of [...items].reverse()) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.unshift(item)
  }
  return result
}

function rememberAcceptedConstraint(state: ConversationState, constraint: ConstraintMemory) {
  const memory = ensureConversationMemory(state)
  memory.acceptedConstraints = dedupeBy(
    [...(memory.acceptedConstraints ?? []), constraint],
    item => item.field,
  ).slice(-12)
}

function rememberAcceptedConstraintsFromUpdate(
  state: ConversationState,
  update: Partial<ConversationState>,
) {
  const fieldMap: Array<[ConstraintMemory['field'], keyof ConversationState]> = [
    ['month', 'month'],
    ['startDate', 'startDate'],
    ['endDate', 'endDate'],
    ['durationDays', 'durationDays'],
    ['passengers', 'passengers'],
    ['campingType', 'campingType'],
    ['extraRequirements', 'extraRequirements'],
    ['earliestAvailable', 'earliestAvailable'],
    ['softPreferences', 'softPreferences'],
  ]

  for (const [field, key] of fieldMap) {
    const value = update[key]
    if (value !== undefined && value !== null) {
      rememberAcceptedConstraint(state, { field, value: value as ConstraintMemory['value'] })
    }
  }
}

function inferConcernType(update: Partial<ConversationState>): MemoryConcernType | null {
  switch (update.refinementPreference) {
    case 'cheaper':
    case 'more_expensive':
      return 'price'
    case 'smaller':
    case 'bigger':
      return 'size'
    case 'different':
      return 'preference'
    default:
      break
  }
  if (update.availabilityQuestion || update.earliestAvailable || update.month || update.startDate || update.endDate || update.durationDays) {
    return 'availability'
  }
  if (update.campingType) return 'camping_style'
  if (update.softPreferences?.length || update.extraRequirements?.length) return 'preference'
  return null
}

function rememberUserConcern(state: ConversationState, message: string, update: Partial<ConversationState>) {
  const concernType = inferConcernType(update)
  if (!concernType) return
  ensureConversationMemory(state).lastUserConcern = {
    type: concernType,
    text: message,
  }
}

function getFirstAvailableResult(results: CamperResult[]): { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null {
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
  const previousSlots = state.lastAvailabilitySlots ?? []
  const withoutDuplicate = previousSlots.filter(slot =>
    !(
      slot.startDate === nextSlot.startDate &&
      slot.endDate === nextSlot.endDate &&
      slot.durationDays === nextSlot.durationDays &&
      slot.camperSlug === nextSlot.camperSlug
    ),
  )
  state.lastAvailabilitySlots = [...withoutDuplicate, nextSlot].slice(-5)

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

function getReferencedAvailabilitySlot(state: ConversationState): AvailabilityMemorySlot | null {
  const slots = state.conversationMemory?.mentionedAvailabilityOptions ?? state.lastAvailabilitySlots ?? []
  if (slots.length === 0) return null

  const currentReferenceDate = state.pendingAvailabilityConfirmation?.startDate ?? state.startDate
  if (!currentReferenceDate) return slots[slots.length - 1]

  const earlierSlots = slots
    .filter(slot => slot.startDate < currentReferenceDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  return earlierSlots[earlierSlots.length - 1] ?? slots[slots.length - 1]
}

function applyAvailabilitySlotConfirmation(state: ConversationState, slot: AvailabilityMemorySlot) {
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

function rememberMentionedCampers(
  state: ConversationState,
  campers: CamperResult[],
  reasons: Record<string, string> = {},
) {
  if (campers.length === 0) return
  const nextCampers: MentionedCamperMemory[] = campers.map(camper => ({
    slug: camper.slug,
    name: camper.name,
    pricePerDay: camper.price_per_day,
    type: camper.type,
    beds: camper.beds,
    reason: reasons[camper.slug],
  }))
  const memory = ensureConversationMemory(state)
  memory.mentionedCampers = dedupeBy(
    [...(memory.mentionedCampers ?? []), ...nextCampers],
    camper => camper.slug,
  ).slice(-8)
  const first = nextCampers[0]
  memory.lastAssistantOffer = {
    type: 'camper_recommendation',
    label: first.name ?? first.slug,
    camperSlug: first.slug,
  }
}

function buildRememberedSlotDurationReply(
  slot: AvailabilityMemorySlot | null,
  compatibility: CriteriaCompatibilityResult = { status: 'compatible', reasons: [] },
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

function buildEarliestAvailabilityConfirmation(
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

function buildFallbackAvailabilityShiftConfirmation(
  state: ConversationState,
  results: CamperResult[],
): string {
  const first = getFirstAvailableResult(results)
  const previousRange = state.startDate && state.endDate
    ? formatDateRangeLabel(state.startDate, state.endDate, true)
    : formatAvailabilityWindowLabel(state, true, 'forMonth')

  const condition = state.campingType === 'wild'
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

function applyEarliestPendingAvailability(
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

function getLongestAvailableSlot(results: CamperResult[]): { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null {
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

function buildLongestAvailableDurationReply(state: ConversationState, results: CamperResult[]): string {
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

function applyLongestPendingAvailability(state: ConversationState, results: CamperResult[]) {
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

export async function POST(req: NextRequest) {
  try {
    const body: ApiRequest = await req.json()
    const {
      message,
      history = [],
      state: incomingState = {},
      flowState: incomingFlowState = {},
      sessionMemory: incomingSessionMemory = {},
    } = body
    let flowState: FlowState = { ...incomingFlowState }
    let sessionMemory: SessionMemory = { ...incomingSessionMemory }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'Hiányzó üzenet' }, { status: 400 })
    }

    // 1. Update conversation state from new message (GPT-4o-mini extraction, regex fallback)
    const stateUpdate = await extractStateUpdate(message, history, incomingState)
    const state = mergeState(incomingState, stateUpdate)
    applyFlexibleCriteriaDefaults(state)
    rememberAcceptedConstraintsFromUpdate(state, stateUpdate)
    rememberUserConcern(state, message, stateUpdate)
    const hasChecklistAnswer = hasChecklistAnswerUpdate(stateUpdate)
    const answeredCurrentField = answersCurrentChecklistField(incomingState.lastAskedField, stateUpdate)
    const answeredNonTimingField = answersNonTimingChecklistField(incomingState.lastAskedField, stateUpdate)
    const isFaqInterruption = stateUpdate.intent === 'faq' &&
      isChecklistIntent(incomingState.intent) &&
      !!incomingState.lastAskedField &&
      !hasChecklistAnswer

    if (isFaqInterruption) {
      state.intent = incomingState.intent ?? 'recommendation'
      state.lastAskedField = incomingState.lastAskedField
    } else if (hasChecklistAnswer && !!incomingState.intent && isChecklistIntent(incomingState.intent)) {
      state.intent = incomingState.intent ?? 'recommendation'
    }

    const pendingConfirmation = incomingState.pendingAvailabilityConfirmation
    const confirmedPendingAvailability = !!pendingConfirmation &&
      !!stateUpdate.positiveAcknowledgement &&
      !answeredCurrentField
    if (pendingConfirmation && confirmedPendingAvailability) {
      const pending = pendingConfirmation
      state.month = undefined
      if (pending.startDate) {
        state.startDate = pending.startDate
      }
      if (pending.durationDays && pending.startDate && pending.endDate) {
        state.endDate = pending.endDate
        state.durationDays = pending.durationDays
      } else {
        state.endDate = undefined
      }
      if (pending.startDate) rememberAcceptedConstraint(state, { field: 'startDate', value: pending.startDate })
      if (pending.endDate) rememberAcceptedConstraint(state, { field: 'endDate', value: pending.endDate })
      if (pending.durationDays) rememberAcceptedConstraint(state, { field: 'durationDays', value: pending.durationDays })
      if (state.conversationMemory) {
        state.conversationMemory.pendingDecision = undefined
      }
      state.earliestAvailable = undefined
      state.pendingAvailabilityConfirmation = undefined
      state.pendingAvailabilityAction = undefined
    }
    if (pendingConfirmation && answeredCurrentField && !confirmedPendingAvailability) {
      state.pendingAvailabilityConfirmation = undefined
      state.pendingAvailabilityAction = undefined
      if (state.conversationMemory) {
        state.conversationMemory.pendingDecision = undefined
      }
    }

    // 1b. If user corrected an availability-affecting field → reset recommendation history
    // so they get fresh results based on the new parameters
    const AVAILABILITY_FIELDS = ['month', 'passengers', 'durationDays', 'campingType', 'startDate', 'endDate', 'earliestAvailable'] as const
    const changedAvailabilityFields = AVAILABILITY_FIELDS.filter(f => {
      const updated = (stateUpdate as Record<string, unknown>)[f]
      const previous = (incomingState as Record<string, unknown>)[f]
      return updated !== undefined && updated !== null && updated !== previous
    })
    const hasAvailabilityChange = changedAvailabilityFields.length > 0
    if (hasAvailabilityChange) {
      if ((incomingState.alreadyRecommendedSlugs?.length ?? 0) > 0) {
        state.alreadyRecommendedSlugs = []
        state.lastShownPrice = undefined
        state.extrasOffered = undefined
      }
      state.lastShownCamperSlug = undefined
      state.selectedCamperSlug = undefined
      sessionMemory = markStaleAvailabilityResults(sessionMemory, state)
    }

    // 1c. If user specified a concrete month/date, clear earliestAvailable and vice versa
    if (stateUpdate.month) {
      state.earliestAvailable = undefined
      state.startDate = undefined
      state.endDate = undefined
      state.pendingAvailabilityConfirmation = undefined
      state.pendingAvailabilityAction = undefined
      if (state.conversationMemory) {
        state.conversationMemory.pendingDecision = undefined
      }
    }

    if (stateUpdate.startDate) {
      state.earliestAvailable = undefined
      state.month = undefined
    }

    if (state.startDate && state.durationDays && (stateUpdate.durationDays || !state.endDate) && !stateUpdate.endDate) {
      state.endDate = addDays(state.startDate, state.durationDays - 1)
      state.month = undefined
    }

    const shouldFindEarliestAvailability =
      !confirmedPendingAvailability &&
      !answeredNonTimingField &&
      !!(
        stateUpdate.earliestAvailable ||
        (
          incomingState.pendingAvailabilityAction === 'find_earliest_availability' &&
          !hasSpecificUserUpdate(stateUpdate)
        ) ||
        (
          incomingState.pendingAvailabilityAction === 'find_earliest_availability' &&
          stateUpdate.durationDays &&
          stateUpdate.availabilityQuestion === 'longest_duration'
        )
      )

    if (shouldFindEarliestAvailability) {
      state.month = undefined
      state.startDate = undefined
      state.endDate = undefined
    }

    if (shouldFindEarliestAvailability) {
      const earliestResults = await findEarliestAvailableCamper(state)
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getFirstAvailableResult(earliestResults),
        'fallback_earliest',
        state,
      )
      applyEarliestPendingAvailability(state, earliestResults)
      state.earliestAvailable = undefined
      state.lastAskedField = incomingState.lastAskedField
      state.pendingAvailabilityAction = undefined
      flowState = updateFlowForResponse(flowState, state, 'availability', null, false)

      return NextResponse.json({
        reply: buildEarliestAvailabilityConfirmation(state, earliestResults),
        recommendations: [],
        availability: [],
        links: [],
        updatedState: state,
        updatedFlowState: flowState,
        updatedSessionMemory: sessionMemory,
      })
    }

    if (
      (stateUpdate.availabilityQuestion === 'remembered_slot_duration' ||
        stateUpdate.referenceTarget === 'previousAvailability' ||
        stateUpdate.referenceTarget === 'lastAvailability') &&
      !confirmedPendingAvailability
    ) {
      const sessionReference = resolveSessionAvailabilityReference(state, sessionMemory)
      const referencedSlot = sessionReference
        ? sessionAvailabilityToMemorySlot(sessionReference.result)
        : getReferencedAvailabilitySlot(state)
      const compatibility = sessionReference?.compatibility ?? { status: 'compatible' as const, reasons: [] }
      const usableReference = compatibility.status === 'compatible' || compatibility.status === 'compatible_relaxed'
      if (referencedSlot && usableReference) {
        applyAvailabilitySlotConfirmation(state, referencedSlot)
      } else if (sessionReference) {
        sessionMemory = {
          ...sessionMemory,
          staleAvailabilityResults: dedupeAvailabilityResults([
            ...(sessionMemory.staleAvailabilityResults ?? []),
            sessionReference.result,
          ]).slice(-8),
        }
      }
      state.lastAskedField = incomingState.lastAskedField
      state.pendingAvailabilityAction = undefined
      flowState = updateFlowForResponse(flowState, state, 'availability', null, false)

      return NextResponse.json({
        reply: buildRememberedSlotDurationReply(referencedSlot, compatibility),
        recommendations: [],
        availability: [],
        links: [],
        updatedState: state,
        updatedFlowState: flowState,
        updatedSessionMemory: sessionMemory,
      })
    }

    if (
      stateUpdate.availabilityQuestion === 'longest_duration' &&
      !confirmedPendingAvailability &&
      (state.month || (state.startDate && state.endDate))
    ) {
      const longestResults = await searchAvailableCampers({
        ...state,
        durationDays: undefined,
        startDate: state.month ? undefined : state.startDate,
        endDate: state.month ? undefined : state.endDate,
      })
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getLongestAvailableSlot(longestResults),
        'longest',
        state,
      )
      applyLongestPendingAvailability(state, longestResults)
      state.lastAskedField = incomingState.lastAskedField
      state.pendingAvailabilityAction = undefined
      flowState = updateFlowForResponse(flowState, state, 'availability', null, false)

      return NextResponse.json({
        reply: buildLongestAvailableDurationReply(state, longestResults),
        recommendations: [],
        availability: [],
        links: [],
        updatedState: state,
        updatedFlowState: flowState,
        updatedSessionMemory: sessionMemory,
      })
    }

    // 2. Detect specific camper availability query ("ez mikor elérhető?" after seeing a card)
    const targetSlug = state.selectedCamperSlug
      ?? (state.intent === 'availability' ? (state.lastShownCamperSlug ?? null) : null)
    // Refinement overrides specific camper path — user is asking for a different recommendation
    const isSpecificCamperQuery = !!targetSlug && state.intent === 'availability' && !stateUpdate.refinementPreference

    // 3. Determine next required question — skip checklist for specific camper queries
    const hasRecommendationData = !!(
      state.month || state.startDate || state.durationDays || state.passengers ||
      state.campingType || state.extraRequirements?.length || state.softPreferences?.length ||
      state.earliestAvailable
    )
    const isChecklistFlow = !isSpecificCamperQuery && (
      state.intent === 'recommendation' ||
      state.intent === 'availability' ||
      (!state.intent && hasRecommendationData)
    )
    const nextQuestionData: NextQuestion | null = isChecklistFlow ? getNextMissingQuestion(state) : null
    const nextQuestion = nextQuestionData?.question ?? null

    // Save which field we just asked about so extraction can interpret the next bare answer
    if (nextQuestionData && resolveMode(state, nextQuestion, stateUpdate.refinementPreference) === 'ask_next_question') {
      state.lastAskedField = nextQuestionData.field
      if (nextQuestionData.field === 'extraRequirements') {
        state.extraRequirementsAsked = true
      }
      ensureConversationMemory(state).pendingDecision = {
        type: 'checklist_question',
        field: nextQuestionData.field,
        label: nextQuestionData.question,
      }
      ensureConversationMemory(state).lastAssistantOffer = {
        type: 'checklist_question',
        label: nextQuestionData.question,
      }
    } else if (!nextQuestionData && answeredCurrentField) {
      state.lastAskedField = undefined
    }

    const shouldProgressivelyCheckAvailability =
      !isSpecificCamperQuery &&
      isChecklistFlow &&
      !!nextQuestionData &&
      !!(state.month || (state.startDate && state.endDate)) &&
      (nextQuestionData.field === 'durationDays' || nextQuestionData.field === 'passengers')

    if (shouldProgressivelyCheckAvailability) {
      const progressiveResults = (state.earliestAvailable
        ? await findEarliestAvailableCamper(state)
        : await searchAvailableCampers(state)) ?? []
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getFirstAvailableResult(progressiveResults),
        state.earliestAvailable ? 'fallback_earliest' : 'availability_search',
        state,
      )
      const progressiveReply = buildProgressiveAvailabilityReply(
        state,
        nextQuestionData,
        progressiveResults.length > 0,
      )

      if (progressiveReply) {
        if (progressiveResults.length === 0) {
          state.lastAskedField = incomingState.lastAskedField
          state.pendingAvailabilityAction = 'find_earliest_availability'
          ensureConversationMemory(state).pendingDecision = {
            type: 'alternative_search',
            label: 'find earliest alternative availability',
          }
          ensureConversationMemory(state).lastAssistantOffer = {
            type: 'alternative_search',
            label: 'find earliest alternative availability',
          }
        } else {
          state.pendingAvailabilityAction = undefined
        }
        return NextResponse.json({
          reply: progressiveReply,
          recommendations: [],
          availability: [],
          links: [],
          updatedState: state,
          updatedFlowState: updateFlowForResponse(flowState, state, 'ask_next_question', nextQuestionData, false),
          updatedSessionMemory: sessionMemory,
        })
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('\n=== CHAT PIPELINE ===')
      console.log('LAST ASKED:    ', incomingState.lastAskedField ?? 'none')
      console.log('EXTRACTED:     ', JSON.stringify(stateUpdate))
      console.log('UPDATED STATE: ', JSON.stringify({ ...state, alreadyRecommendedSlugs: state.alreadyRecommendedSlugs }))
      console.log('NEXT MISSING:  ', nextQuestionData?.field ?? 'none')
      console.log('NEXT QUESTION: ', nextQuestion ?? 'none')
      console.log('SPECIFIC SLUG: ', targetSlug ?? 'none')
      console.log('MODE:          ', isSpecificCamperQuery ? 'availability(specific)' : resolveMode(state, nextQuestion, stateUpdate.refinementPreference))
      console.log('=====================\n')
    }

    // 3b. Detect if a field was just skipped this turn (for GPT acknowledgement)
    const justSkippedField = stateUpdate.skippedChecklist?.[0]

    // 4. Determine mode
    const mode = isSpecificCamperQuery ? 'availability' : resolveMode(state, nextQuestion, stateUpdate.refinementPreference)
    const effectiveMode = isFaqInterruption ? 'faq' : mode

    // 4b. Load FAQ items from Supabase when mode is faq
    let faqItems: FaqItem[] | undefined
    if (effectiveMode === 'faq') {
      faqItems = await loadFaqItems()
    }

    // 4c. Load catalog summary (prices per type) when mode is catalog
    let catalogSummary: CatalogEntry[] | undefined
    if (effectiveMode === 'catalog') {
      catalogSummary = await loadCatalogSummary()
    }

    // 5. Fetch available campers
    let camperResults: CamperResult[] = []
    let searchType: SearchType = 'specific'
    let requestedMonth: string | undefined
    let branchSummaries: BranchSearchSummary[] | undefined

    if (isSpecificCamperQuery && targetSlug) {
      // Specific camper availability: search only for that one slug
      camperResults = await getSpecificCamperAvailability(targetSlug, state)

      // If month was given but returned empty → fall back to full 6-month window
      if (camperResults.length === 0 && state.month) {
        requestedMonth = state.month
        camperResults = await getSpecificCamperAvailability(targetSlug, { ...state, month: undefined })
        searchType = 'fallback_earliest'
      }
    } else if (effectiveMode === 'recommend' || effectiveMode === 'availability') {
      const hasExactRange = !!(state.startDate && state.endDate)
      const flexibleBranches = !state.earliestAvailable && !hasExactRange
        ? createFlexibleSearchBranches(state)
        : null

      if (flexibleBranches) {
        searchType = 'branch'
        branchSummaries = []
        const mergedResults: CamperResult[] = []
        for (const branch of flexibleBranches) {
          const branchResults = await searchAvailableCampers(branch.state)
          branchSummaries.push({
            label: branch.label,
            criteria: createAvailabilityCriteria(branch.state),
            resultCount: branchResults.length,
          })
          sessionMemory = rememberSessionAvailability(
            sessionMemory,
            getFirstAvailableResult(branchResults),
            'availability_search',
            branch.state,
          )
          mergedResults.push(...branchResults)
        }
        camperResults = mergedResults
      } else if (state.earliestAvailable) {
        camperResults = await findEarliestAvailableCamper(state)
        searchType = 'earliest'
      } else {
        camperResults = await searchAvailableCampers(state)

        if (camperResults.length === 0 && hasExactRange && !nextQuestion) {
          const fallbackResults = await findEarliestAvailableCamper(state)
          sessionMemory = rememberSessionAvailability(
            sessionMemory,
            getFirstAvailableResult(fallbackResults),
            'fallback_earliest',
            state,
          )
          applyEarliestPendingAvailability(state, fallbackResults, 'fallback_earliest')
          searchType = 'fallback_earliest'

          return NextResponse.json({
            reply: buildFallbackAvailabilityShiftConfirmation(state, fallbackResults),
            recommendations: [],
            availability: [],
            links: [],
            updatedState: state,
            updatedFlowState: updateFlowForResponse(flowState, state, 'availability', null, false),
            updatedSessionMemory: sessionMemory,
          })
        }

        if (camperResults.length === 0 && !hasExactRange) {
          requestedMonth = state.month  // undefined if no month → no "requested month full" note
          camperResults = await findEarliestAvailableCamper(state)
          sessionMemory = rememberSessionAvailability(
            sessionMemory,
            getFirstAvailableResult(camperResults),
            'fallback_earliest',
            state,
          )
          searchType = 'fallback_earliest'
        }
      }
    }

    if (effectiveMode === 'availability' && camperResults.length > 0 && !branchSummaries?.length) {
      sessionMemory = rememberSessionAvailability(
        sessionMemory,
        getFirstAvailableResult(camperResults),
        isSpecificCamperQuery ? 'availability_search' : searchType === 'fallback_earliest' ? 'fallback_earliest' : 'availability_search',
        state,
      )
      if (isSpecificCamperQuery && sessionMemory.lastAvailabilityResult) {
        sessionMemory.lastSpecificCamperAvailability = sessionMemory.lastAvailabilityResult
      }
    }

    // 5b. Exclude already-shown + apply refinement for recommendation mode
    const alreadyShown = new Set(state.alreadyRecommendedSlugs ?? [])
    let displayResults = camperResults
    let refinementNote: string | undefined

    if (effectiveMode === 'recommend') {
      const freshResults = camperResults.filter(c => !alreadyShown.has(c.slug))
      const currentRefinement = stateUpdate.refinementPreference ?? null

      if (freshResults.length === 0 && alreadyShown.size > 0 && !currentRefinement) {
        displayResults = []
        refinementNote = 'NINCS TÖBB OPCIÓ: a jelenlegi feltételek mellett minden megfelelő lakóautót megmutattam már. Ajánlj feltételmódosítást.'
      } else if (currentRefinement) {
        const { refined, boundaryReached } = applyRefinement(freshResults, currentRefinement, state.lastShownPrice)
        displayResults = refined
        if (boundaryReached) {
          refinementNote = BOUNDARY_NOTES[currentRefinement] ?? 'HATÁRESET: nincs más megfelelő alternatíva a jelenlegi feltételek alapján.'
        } else {
          const priceStr = state.lastShownPrice ? `${state.lastShownPrice.toLocaleString('hu-HU')} Ft/nap` : '?'
          const REFINEMENT_NOTES: Record<string, string> = {
            cheaper: `User olcsóbbat kért (előző ár: ${priceStr}). Válassz az allowedCamperSlugs-ból.`,
            more_expensive: `User drágábbat kért (előző ár: ${priceStr}). Válassz az allowedCamperSlugs-ból.`,
            smaller: 'User kisebbet / kompaktabbat kért. Válassz az allowedCamperSlugs-ból.',
            bigger: 'User nagyobbat / tágasabbat kért. Válassz az allowedCamperSlugs-ból.',
            different: 'User mást kért. Válassz eddig nem mutatott opciót az allowedCamperSlugs-ból.',
          }
          refinementNote = REFINEMENT_NOTES[currentRefinement]
        }
      } else {
        displayResults = freshResults
      }
    }

    const allowedSlugs = new Set(displayResults.map(c => c.slug))

    // Offer extras only on the first successful recommendation (when there are results and not yet offered)
    const offerExtras = effectiveMode === 'recommend' && displayResults.length > 0 && !state.extrasOffered

    // 5d. Load extras from Supabase when offering them
    let extrasItems: ExtraItem[] | undefined
    if (offerExtras) {
      extrasItems = await loadExtras()
    }

    // 5c. Decide if a summary before the recommendation is warranted
    const isFirstRecommendation = (state.alreadyRecommendedSlugs?.length ?? 0) === 0
    const shouldSummarize = effectiveMode === 'recommend' && (
      (isFirstRecommendation && countKnownFields(state) >= 3) ||
      changedAvailabilityFields.length >= 2
    )

    // 6. Build GPT context
    const ctx: GptContext = {
      state,
      flowState,
      sessionMemory,
      nextQuestion: effectiveMode === 'faq' ? null : nextQuestion,
      camperResults: displayResults,
      allowedCamperSlugs: [...allowedSlugs],
      mode: effectiveMode,
      searchType,
      requestedMonth,
      specificCamperSlug: isSpecificCamperQuery ? targetSlug : undefined,
      refinementNote,
      offerExtras,
      extrasItems,
      catalogSummary,
      faqItems,
      skipNote: justSkippedField
        ? `A user nem tudott/akart válaszolni a "${justSkippedField}" kérdésre — fogadd el természetesen, ne kérdezd újra.`
        : undefined,
      positiveAcknowledgement: state.positiveAcknowledgement,
      shouldSummarize,
      branchSummaries,
    }

    // 7. Call GPT
    const contextBlock = buildContextBlock(ctx)
    const completion = await getOpenAI().chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: `${SYSTEM_PROMPT}\n\n${contextBlock}` },
        ...history,
        { role: 'user', content: message },
      ],
      response_format: { type: 'json_object' },
      max_tokens: 400,
      temperature: 0.5,
    })

    const raw = completion.choices[0]?.message?.content ?? '{}'
    const output = validateGptOutput(raw, allowedSlugs, effectiveMode)

    output.reply = effectiveMode === 'faq'
      ? removeAllChecklistQuestions(output.reply)
      : removeResolvedChecklistQuestions(output.reply, state, nextQuestionData?.field)

    if (effectiveMode === 'ask_next_question') {
      output.reply = removeMisleadingNoInfoForChecklist(output.reply)
    }

    // Guarantee the nextQuestion appears in the reply — GPT mini sometimes drops it.
    // Only append if the reply doesn't already contain the question (30-char prefix check).
    if (effectiveMode === 'ask_next_question' && nextQuestion) {
      output.reply = keepOnlyOneChecklistQuestion(output.reply, nextQuestion)
    }

    // Specific camper queries never show recommendation chips
    if (isSpecificCamperQuery) {
      output.recommendations = []
    }
    if (effectiveMode === 'availability') {
      output.recommendations = []
    }

    // 8. Track newly recommended slugs + last shown slug + price + extras flag in state
    const newSlugs = output.recommendations.map(r => r.slug)
    if (newSlugs.length > 0) {
      state.alreadyRecommendedSlugs = [
        ...new Set([...(state.alreadyRecommendedSlugs ?? []), ...newSlugs]),
      ]
      state.lastShownCamperSlug = newSlugs[0]
      const lastShownCamper = displayResults.find(c => c.slug === newSlugs[0])
        ?? camperResults.find(c => c.slug === newSlugs[0])
      if (lastShownCamper) {
        state.lastShownPrice = lastShownCamper.price_per_day
      }
      if (offerExtras) {
        state.extrasOffered = true
      }
      const reasonBySlug = Object.fromEntries(output.recommendations.map(r => [r.slug, r.reason]))
      const shownCampers = newSlugs
        .map(slug => displayResults.find(c => c.slug === slug) ?? camperResults.find(c => c.slug === slug))
        .filter((camper): camper is CamperResult => !!camper)
      rememberMentionedCampers(state, shownCampers, reasonBySlug)
      sessionMemory = rememberSessionRecommendation(sessionMemory, shownCampers)
    }

    // 9. Enrich recommendations with camper data
    const camperMap = Object.fromEntries(camperResults.map(c => [c.slug, c]))
    const recommendations: EnrichedRecommendation[] = output.recommendations
      .filter(r => camperMap[r.slug])
      .map(r => ({
        slug: r.slug,
        text: r.reason,
        name: camperMap[r.slug].name,
        image_url: camperMap[r.slug].image_url,
        price_per_day: camperMap[r.slug].price_per_day,
        type: camperMap[r.slug].type,
        beds: camperMap[r.slug].beds,
      }))

    // 10. Build availability slots for UI (mode = availability)
    const availability: AvailabilitySlot[] = effectiveMode === 'availability'
      ? camperResults.flatMap(c =>
          c.availableSlots.map(slot => ({
            slug: c.slug,
            name: c.name,
            image_url: c.image_url,
            price_per_day: c.price_per_day,
            type: c.type,
            beds: c.beds,
            from: slot.from,
            to: slot.to,
            days: slot.days,
          })),
        )
      : []

    flowState = updateFlowForResponse(flowState, state, effectiveMode, nextQuestionData, isFaqInterruption)

    return NextResponse.json({
      reply: output.reply,
      recommendations,
      availability,
      links: output.links,
      updatedState: state,
      updatedFlowState: flowState,
      updatedSessionMemory: sessionMemory,
    })
  } catch (err) {
    console.error('[chat/route]', err)
    return NextResponse.json({
      reply: FALLBACK_OUTPUT.reply,
      recommendations: [],
      availability: [],
      links: [],
    })
  }
}
