export type ConversationIntent = 'recommendation' | 'availability' | 'faq' | 'booking' | 'catalog'
export type CampingType = 'wild' | 'camping_site'
export type RefinementPreference = 'cheaper' | 'more_expensive' | 'smaller' | 'bigger' | 'different'
export type AvailabilityQuestion = 'longest_duration' | 'remembered_slot_duration'
export type PendingAvailabilityAction = 'find_earliest_availability'
export type ReferenceTarget = 'previousAvailability' | 'lastAvailability' | 'lastRecommendation' | 'firstShownOption' | 'lastShownOption'

export type AvailabilityMemorySource = 'earliest' | 'fallback_earliest' | 'longest'
export type MemoryDecisionType = 'availability_option' | 'camper_recommendation' | 'alternative_search' | 'checklist_question'
export type MemoryConcernType = 'price' | 'size' | 'availability' | 'camping_style' | 'rules' | 'preference' | 'unknown'
export type MemoryNoteType = 'fact' | 'preference' | 'concern' | 'decision' | 'rejection' | 'reference'

export type ActiveFlow = 'recommendation' | 'availability' | 'faq' | 'booking' | 'catalog'
export type ActiveStep = 'checklist' | 'recommendation' | 'availability_check' | 'booking' | 'faq' | 'catalog'

export interface AvailabilityMemorySlot {
  startDate: string
  endDate?: string
  durationDays?: number
  camperSlug?: string
  camperName?: string
  source?: AvailabilityMemorySource
}

export interface MentionedCamperMemory {
  slug: string
  name?: string
  pricePerDay?: number
  type?: string | null
  beds?: number | null
  reason?: string
}

export interface ConstraintMemory {
  field: ChecklistField | 'startDate' | 'endDate' | 'earliestAvailable' | 'softPreferences'
  value: string | number | boolean | string[]
}

export interface MemoryNote {
  type: MemoryNoteType
  text: string
  subject?: string
}

export interface ConversationMemory {
  notes?: MemoryNote[]
  mentionedAvailabilityOptions?: AvailabilityMemorySlot[]
  mentionedCampers?: MentionedCamperMemory[]
  acceptedConstraints?: ConstraintMemory[]
  rejectedConstraints?: ConstraintMemory[]
  pendingDecision?: {
    type: MemoryDecisionType
    label?: string
    availabilityOption?: AvailabilityMemorySlot
    camperSlug?: string
    field?: ConstraintMemory['field']
  }
  lastUserConcern?: {
    type: MemoryConcernType
    text: string
  }
  lastAssistantOffer?: {
    type: MemoryDecisionType
    label?: string
    availabilityOption?: AvailabilityMemorySlot
    camperSlug?: string
  }
}

export interface FlowState {
  activeFlow?: ActiveFlow
  activeStep?: ActiveStep
  pendingQuestionField?: ChecklistField
  pendingQuestionText?: string
  lastSideTopic?: 'faq' | 'catalog' | 'availability' | 'booking'
  canResumePreviousFlow?: boolean
}

export interface SessionAvailabilityResult {
  camperSlug: string
  camperName: string
  from: string
  to: string
  days: number
  pricePerDay?: number
  source: 'availability_search' | 'recommendation' | 'fallback_earliest' | 'longest'
  criteria?: AvailabilityCriteria
  criteriaHash?: string
}

export interface AvailabilityCriteria {
  month?: string
  startDate?: string
  endDate?: string
  durationDays?: number
  passengers?: number
  campingType?: CampingType
  extraRequirements?: string[]
  softPreferences?: string[]
  earliestAvailable?: boolean
}

export interface FlexibleTripCriteria {
  months?: string[]
  durationDays?: {
    min?: number
    max?: number
    preferred?: number
    alternatives?: number[]
  }
  passengers?: {
    min?: number
    max?: number
    alternatives?: number[]
  }
  campingTypes?: CampingType[]
}

export interface SessionRecommendationResult {
  camperSlug: string
  camperName: string
  from?: string
  to?: string
  days?: number
  pricePerDay?: number
}

export interface SessionShownOption {
  index: number
  camperSlug: string
  camperName: string
  from?: string
  to?: string
  days?: number
  pricePerDay?: number
}

export interface SessionMemory {
  lastAvailabilityResult?: SessionAvailabilityResult
  previousAvailabilityResults?: SessionAvailabilityResult[]
  staleAvailabilityResults?: SessionAvailabilityResult[]
  lastRecommendationResult?: SessionRecommendationResult
  shownOptions?: SessionShownOption[]
  lastSpecificCamperAvailability?: SessionAvailabilityResult
  lastComparedCamper?: string
}

export type ChecklistField = 'month' | 'durationDays' | 'passengers' | 'campingType' | 'extraRequirements'

export interface ConversationState {
  intent?: ConversationIntent
  month?: string               // YYYY-MM
  startDate?: string           // YYYY-MM-DD
  endDate?: string             // YYYY-MM-DD
  durationDays?: number
  passengers?: number
  campingType?: CampingType
  extraRequirements?: string[]    // hard requirements — user stated as mandatory
  softPreferences?: string[]      // nice-to-haves — user prefers but not mandatory
  extraRequirementsAsked?: boolean
  skippedChecklist?: ChecklistField[]  // fields the user explicitly said "don't know / doesn't matter"
  positiveAcknowledgement?: boolean   // ephemeral — user expressed satisfaction with last shown camper
  availabilityQuestion?: AvailabilityQuestion  // ephemeral — semantic availability sub-question from latest user message
  referenceTarget?: ReferenceTarget   // ephemeral — latest message refers to an option in SessionMemory
  selectedCamperSlug?: string
  alreadyRecommendedSlugs?: string[]
  earliestAvailable?: boolean  // user wants earliest possible slot, no specific month
  flexibleCriteria?: FlexibleTripCriteria
  lastAskedField?: ChecklistField  // which checklist field the bot just asked about
  lastShownCamperSlug?: string    // first slug from last recommendation response — used for follow-up availability questions
  refinementPreference?: RefinementPreference  // ephemeral — what direction user wants to refine
  lastShownPrice?: number         // price of last recommended camper — used for "closest cheaper/more expensive"
  extrasOffered?: boolean         // true after first successful recommendation — prevents repeat upsell
  pendingAvailabilityAction?: PendingAvailabilityAction
  conversationMemory?: ConversationMemory
  /** Legacy mirror for older UI/tests. New memory lives in conversationMemory. */
  lastAvailabilitySlots?: AvailabilityMemorySlot[]
  pendingAvailabilityConfirmation?: {
    month?: string
    startDate?: string
    endDate?: string
    durationDays?: number
    camperSlug?: string
    camperName?: string
  }
}

// november and december are the same in Hungarian and English — only listed once
const MONTH_MAP: Record<string, string> = {
  január: '01', február: '02', március: '03', április: '04',
  május: '05', június: '06', július: '07', augusztus: '08',
  szeptember: '09', október: '10', november: '11', december: '12',
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10',
}

const PERSON_WORDS: Record<string, number> = {
  egyedül: 1, magam: 1,
  ketten: 2, két: 2,
  hárman: 3, három: 3,
  négyen: 4, négy: 4,
  öten: 5, öt: 5,
  hatan: 6, hat: 6,
}

function normalizeForMatch(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function extractCampingTypeFromMessage(message: string): CampingType | undefined {
  const normalized = normalizeForMatch(message)

  const campingSitePatterns = [
    /\bnem\b.{0,40}\bvadkemp/,
    /\bmegsem\b.{0,40}\bvadkemp/,
    /\binkabb\b.{0,40}\bnem\b.{0,20}\bvadkemp/,
    /\b(?:akkor|legyen|inkabb)\b.{0,40}\bkemping(?:hely|ben)?/,
    /\bkempinghely/,
    /\bkempingben/,
    /\bno\s+wild\s+camping\b/,
    /\bnot\s+wild\s+camping\b/,
    /\b(?:don'?t|do not)\s+want\s+wild\s+camping\b/,
    /\bcampsite\s+instead\b/,
    /\bkein\s+wildcamping\b/,
    /\blieber\s+campingplatz\b/,
  ]

  if (campingSitePatterns.some(pattern => pattern.test(normalized))) {
    return 'camping_site'
  }

  const hasWildSignal = /\b(vadkemp|nem\s+kemping|nem\s+hivatalos\s+kemping|kempingen\s+kivuli|kempingen\s+kivul|kempinghelyen\s+kivuli|szabad terulet|off-?grid|termeszetben)\b/.test(normalized)
  const negatesWild = /\b(nem|megsem|no|not|kein)\b.{0,40}\b(vadkemp|wild\s+camping|wildcamping)\b/.test(normalized)
  if (hasWildSignal && !negatesWild) {
    return 'wild'
  }

  return undefined
}

function detectIntent(message: string, current?: ConversationIntent): ConversationIntent {
  // booking = only explicit reservation of a specific car
  if (/\b(le\s*szeretném\s*foglalni|hogyan\s*foglal|ezt\s*az\s*autót\s*szeretném)\b/i.test(message)) return 'booking'
  if (/\b(jogosítvány|kaució|biztosítás|minimum kor|meghibásodás|átvétel|gyik)\b/i.test(message)) return 'faq'
  if (/\b(katalógus|összes autó|milyen autók|mik.*autók|mit.*bérel|kínálat|választék|kategóri|welche wohnmobil|what camper|what vehicle)\b/i.test(message)) return 'catalog'
  if (/\b(tudok|lehet|van|vannak|can i|is there|are there)\b.{0,60}\b(lakóautó|camper|autó|wohnmobil)\b.{0,60}\b(bérelni|szabad|elérhet|available|rent)\b/i.test(message)) return 'availability'
  if (/\b(mikor szabad|elérhet|szabad-e|mikor elérhető)\b/i.test(message)) return 'availability'
  if (/\b(szeretnék|keresek|választanék|mennék|mennénk|lakóautó|camper|autó|bérelni)\b/i.test(message)) return 'recommendation'
  if (/\bsegíts\b.{0,40}\b(választ|camper|lakóautó|bérlés|bérelni|autó)\b/i.test(message)) return 'recommendation'
  return current ?? 'recommendation'
}

export function extractStateFromMessage(
  message: string,
  history: { role: string; content: string }[],
  current: ConversationState,
): Partial<ConversationState> {
  const all = [...history.map(m => m.content), message].join(' ')
  const update: Partial<ConversationState> = {}

  // Intent
  update.intent = detectIntent(message, current.intent)

  // Passengers — from current message only (more reliable)
  const numPersonMatch = message.match(/\b([1-9]\d?)\s*(fő|főre|ember|személy|személyre|fővel)\b/i)
  if (numPersonMatch) {
    update.passengers = parseInt(numPersonMatch[1])
  } else {
    for (const [word, count] of Object.entries(PERSON_WORDS)) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(message)) {
        update.passengers = count
        break
      }
    }
    // "párommal / barátommal / a feleségemmel" → 2
    if (!update.passengers && /\b(párommal|feleségemmel|férjemmel|barátnőmmel|barátommal|partneremmel)\b/i.test(message)) {
      update.passengers = 2
    }
  }

  // Camping type — current-message corrections must override older history.
  const currentCampingType = extractCampingTypeFromMessage(message)
  if (currentCampingType) {
    update.campingType = currentCampingType
  } else if (!current.campingType) {
    const historicalCampingType = extractCampingTypeFromMessage(all)
    if (historicalCampingType) update.campingType = historicalCampingType
  }

  // Duration — "7 nap", "10 napra", "7-10 nap" (take minimum), "egy hét", "két hét"
  const rangeMatch = message.match(/\b(\d+)[–\-](\d+)\s*nap/i)
  if (rangeMatch) {
    update.durationDays = parseInt(rangeMatch[1]) // minimum of range
  } else {
    const singleMatch = message.match(/\b(\d+)\s*nap/i)
    if (singleMatch) update.durationDays = parseInt(singleMatch[1])
    else if (/\begy\s*hét\b/i.test(message)) update.durationDays = 7
    else if (/\bkét\s*hét\b/i.test(message)) update.durationDays = 14
    else if (/\b(egy-két|1-2)\s*hét\b/i.test(message)) update.durationDays = 7
  }

  // Month — from current message, mapped to YYYY-MM
  const today = new Date()
  const curYear = today.getFullYear()
  const curMonth = today.getMonth() + 1 // 1-12

  const lowerMsg = message.toLowerCase()

  if (/\b(leghamarabb|minél\s*előbb|mindegy\s*mikor|amikor\s*(lehet|van)|asap|earliest|legkorább)\b/i.test(lowerMsg)) {
    update.earliestAvailable = true
  } else if (/(ebben|erre)\s+a?\s*hónap/i.test(lowerMsg)) {
    update.month = `${curYear}-${String(curMonth).padStart(2, '0')}`
  } else if (/jövő\s*hónap/i.test(lowerMsg)) {
    const next = curMonth === 12 ? 1 : curMonth + 1
    const y = curMonth === 12 ? curYear + 1 : curYear
    update.month = `${y}-${String(next).padStart(2, '0')}`
  } else if (/\bnyáron\b/i.test(lowerMsg)) {
    update.month = `${curYear}-07`
  } else if (/\btavasszal\b/i.test(lowerMsg)) {
    update.month = `${curYear}-04`
  } else if (/\bősszel\b/i.test(lowerMsg)) {
    update.month = `${curYear}-09`
  } else {
    for (const [name, num] of Object.entries(MONTH_MAP)) {
      if (lowerMsg.includes(name)) {
        const mNum = parseInt(num)
        // If month already passed this year (and user is clearly planning ahead), use next year
        const year = mNum > curMonth ? curYear : curYear + 1
        update.month = `${year}-${num}`
        break
      }
    }
  }

  // Explicit date range: "2026-07-10 – 2026-07-20" or similar
  const exactRange = message.match(/(\d{4}[-./]\d{2}[-./]\d{2})\s*[-–tól\s]+(\d{4}[-./]\d{2}[-./]\d{2})/i)
  if (exactRange) {
    update.startDate = exactRange[1].replace(/[./]/g, '-')
    update.endDate = exactRange[2].replace(/[./]/g, '-')
  }

  // Extra requirements as free text if late in the flow
  // (capture anything after "Van még" response)
  const extraRequirementsInHistory = all.match(/van még.*szempont/i)
  if (extraRequirementsInHistory && !current.extraRequirementsAsked) {
    update.extraRequirementsAsked = true
  }

  return update
}

export function mergeState(current: ConversationState, update: Partial<ConversationState>): ConversationState {
  const currentMemory = current.conversationMemory
  const updateMemory = update.conversationMemory
  const mergedMemory: ConversationMemory | undefined = currentMemory || updateMemory
    ? {
        ...currentMemory,
        ...updateMemory,
        notes: [
          ...new Map(
            [
              ...(currentMemory?.notes ?? []),
              ...(updateMemory?.notes ?? []),
            ].map(note => [`${note.type}|${note.subject ?? ''}|${note.text}`, note]),
          ).values(),
        ].slice(-20),
        mentionedAvailabilityOptions: [
          ...new Map(
            [
              ...(currentMemory?.mentionedAvailabilityOptions ?? []),
              ...(updateMemory?.mentionedAvailabilityOptions ?? []),
            ].map(slot => [`${slot.startDate}|${slot.endDate ?? ''}|${slot.durationDays ?? ''}|${slot.camperSlug ?? ''}`, slot]),
          ).values(),
        ].slice(-8),
        mentionedCampers: [
          ...new Map(
            [
              ...(currentMemory?.mentionedCampers ?? []),
              ...(updateMemory?.mentionedCampers ?? []),
            ].map(camper => [camper.slug, camper]),
          ).values(),
        ].slice(-8),
        acceptedConstraints: [
          ...new Map(
            [
              ...(currentMemory?.acceptedConstraints ?? []),
              ...(updateMemory?.acceptedConstraints ?? []),
            ].map(constraint => [constraint.field, constraint]),
          ).values(),
        ].slice(-12),
        rejectedConstraints: [
          ...new Map(
            [
              ...(currentMemory?.rejectedConstraints ?? []),
              ...(updateMemory?.rejectedConstraints ?? []),
            ].map(constraint => [`${constraint.field}|${String(constraint.value)}`, constraint]),
          ).values(),
        ].slice(-12),
        pendingDecision: updateMemory?.pendingDecision ?? currentMemory?.pendingDecision,
        lastUserConcern: updateMemory?.lastUserConcern ?? currentMemory?.lastUserConcern,
        lastAssistantOffer: updateMemory?.lastAssistantOffer ?? currentMemory?.lastAssistantOffer,
      }
    : undefined

  return {
    ...current,
    ...update,
    // ephemeral fields — reset each turn unless explicitly extracted
    refinementPreference: 'refinementPreference' in update ? update.refinementPreference : undefined,
    positiveAcknowledgement: update.positiveAcknowledgement ?? undefined,
    availabilityQuestion: update.availabilityQuestion ?? undefined,
    referenceTarget: update.referenceTarget ?? undefined,
    alreadyRecommendedSlugs: [
      ...new Set([
        ...(current.alreadyRecommendedSlugs ?? []),
        ...(update.alreadyRecommendedSlugs ?? []),
      ]),
    ],
    extraRequirements: [
      ...new Set([
        ...(current.extraRequirements ?? []),
        ...(update.extraRequirements ?? []),
      ]),
    ],
    softPreferences: [
      ...new Set([
        ...(current.softPreferences ?? []),
        ...(update.softPreferences ?? []),
      ]),
    ],
    skippedChecklist: [
      ...new Set([
        ...(current.skippedChecklist ?? []),
        ...(update.skippedChecklist ?? []),
      ]),
    ] as ChecklistField[],
    flexibleCriteria: mergeFlexibleCriteria(current.flexibleCriteria, update.flexibleCriteria),
    conversationMemory: mergedMemory,
  }
}

function mergeFlexibleCriteria(
  current?: FlexibleTripCriteria,
  update?: FlexibleTripCriteria,
): FlexibleTripCriteria | undefined {
  if (!current && !update) return undefined
  return {
    ...current,
    ...update,
    months: update?.months ? [...new Set(update.months)].slice(0, 6) : current?.months,
    durationDays: update?.durationDays
      ? {
          ...current?.durationDays,
          ...update.durationDays,
          alternatives: update.durationDays.alternatives
            ? [...new Set(update.durationDays.alternatives)].slice(0, 6)
            : current?.durationDays?.alternatives,
        }
      : current?.durationDays,
    passengers: update?.passengers
      ? {
          ...current?.passengers,
          ...update.passengers,
          alternatives: update.passengers.alternatives
            ? [...new Set(update.passengers.alternatives)].slice(0, 6)
            : current?.passengers?.alternatives,
        }
      : current?.passengers,
    campingTypes: update?.campingTypes
      ? [...new Set(update.campingTypes)].slice(0, 2)
      : current?.campingTypes,
  }
}
