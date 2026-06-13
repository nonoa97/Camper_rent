import type {
  ConversationState,
  MemoryEvent,
  MemoryEventType,
  SessionAvailabilityResult,
  SessionMemory,
  SessionRecommendationResult,
  SessionShownOption,
} from './state'
import { evaluateAvailabilityCriteriaCompatibility } from './availabilityMemory'
import {
  evaluateRecommendationCriteriaCompatibility,
  MAX_MEMORY_EVENTS,
} from './recommendationMemory'
import { SESSION_MEMORY_LIMITS } from './sessionMemoryValidation'

export type MemoryExplainabilityWarning =
  | 'session_memory_missing'
  | 'schema_version_missing'
  | 'schema_version_unknown'
  | 'availability_criteria_missing'
  | 'recommendation_criteria_missing'
  | 'legacy_mirror_present'
  | 'deprecated_field_present'
  | 'memory_event_limit_reached'
  | 'shown_options_limit_reached'
  | 'stale_availability_present'
  | 'recommendation_needs_recheck'
  | 'availability_needs_recheck'

export interface AvailabilityResultSummary {
  camperSlug: string
  camperName: string
  from: string
  to: string
  days: number
  source: SessionAvailabilityResult['source']
  criteriaHash?: string
  pricePerDay?: number
}

export interface RecommendationResultSummary {
  optionId?: string
  camperSlug: string
  camperName: string
  shownIndex?: number
  criteriaHash?: string
  pricePerDay?: number
  totalPrice?: number
  score?: number | null
  source?: SessionRecommendationResult['source']
  featureKeys: string[]
  attributeKeys: string[]
  capabilityKeys: string[]
}

export interface RecommendationOptionSummary extends RecommendationResultSummary {
  index: number
}

export interface MemoryEventSummary {
  eventId: string
  eventType: MemoryEventType
  timestamp: string
  optionId: string
  camperSlug?: string
  metadataKeys: string[]
}

export interface AvailabilityMemoryExplanation {
  lastAvailabilityResult?: AvailabilityResultSummary
  previousAvailabilityCount: number
  staleAvailabilityCount: number
  lastSpecificCamperAvailability?: AvailabilityResultSummary
  criteriaFieldsPresent: string[]
  criteriaHashPresent: boolean
  compatibility?: {
    status: 'compatible' | 'compatible_relaxed' | 'needs_recheck' | 'stale'
    reasons: string[]
    safeForReference: boolean
    safeForCurrentDecision: false
  }
}

export interface RecommendationMemoryExplanation {
  lastRecommendationResult?: RecommendationResultSummary
  shownOptionsCount: number
  shownOptionsPreview: RecommendationOptionSummary[]
  criteriaFieldsPresent: string[]
  criteriaHashPresent: boolean
  compatibility?: {
    status: 'compatible' | 'compatible_relaxed' | 'needs_recheck' | 'stale'
    reasons: string[]
    safeForReference: boolean
    safeForCurrentDecision: false
  }
}

export interface MemoryEventsExplanation {
  totalCount: number
  limit: number
  countsByType: Record<MemoryEventType, number>
  latestEvents: MemoryEventSummary[]
}

export interface MemoryCompatibilityExplanation {
  availability?: AvailabilityMemoryExplanation['compatibility']
  recommendation?: RecommendationMemoryExplanation['compatibility']
}

export interface LegacyMirrorFieldExplanation {
  field: string
  layer: 'ConversationState' | 'SessionMemory'
  status: 'deprecated' | 'legacy_mirror' | 'compatibility' | 'prompt_context'
  canonicalSource: string
  safeUse: string[]
  unsafeUse: string[]
}

export interface LegacyMemoryMirrorExplanation {
  fields: LegacyMirrorFieldExplanation[]
}

export interface MemoryCurrentFocusExplanation {
  lastShownCamperSlug?: string
  lastShownPrice?: number
  selectedCamperSlug?: string
  alreadyRecommendedSlugs?: string[]
  notes: string[]
}

export interface MemoryExplainabilitySnapshot {
  schemaVersion: 1
  availabilityMemory: AvailabilityMemoryExplanation
  recommendationMemory: RecommendationMemoryExplanation
  memoryEvents: MemoryEventsExplanation
  compatibility: MemoryCompatibilityExplanation
  legacyMirrors: LegacyMemoryMirrorExplanation
  currentFocus: MemoryCurrentFocusExplanation
  warnings: MemoryExplainabilityWarning[]
}

function criteriaFields(criteria: object | undefined): string[] {
  if (!criteria) return []
  return Object.entries(criteria)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([key]) => key)
    .sort()
}

function safeForReference(status: 'compatible' | 'compatible_relaxed' | 'needs_recheck' | 'stale'): boolean {
  return status === 'compatible' || status === 'compatible_relaxed'
}

function summarizeAvailability(result: SessionAvailabilityResult | undefined): AvailabilityResultSummary | undefined {
  if (!result) return undefined
  return {
    camperSlug: result.camperSlug,
    camperName: result.camperName,
    from: result.from,
    to: result.to,
    days: result.days,
    source: result.source,
    criteriaHash: result.criteriaHash,
    pricePerDay: result.pricePerDay,
  }
}

function summarizeRecommendation(result: SessionRecommendationResult | undefined): RecommendationResultSummary | undefined {
  if (!result) return undefined
  return {
    optionId: result.optionId,
    camperSlug: result.camperSlug,
    camperName: result.camperName,
    shownIndex: result.shownIndex,
    criteriaHash: result.criteriaHash,
    pricePerDay: result.pricePerDay,
    totalPrice: result.totalPrice,
    score: result.score,
    source: result.source,
    featureKeys: result.featureKeys ?? [],
    attributeKeys: Object.keys(result.attributeFacts ?? {}).sort(),
    capabilityKeys: (result.capabilityMatches ?? []).map(match => match.capabilityKey).sort(),
  }
}

function summarizeShownOption(option: SessionShownOption): RecommendationOptionSummary {
  return {
    index: option.index,
    optionId: option.optionId,
    camperSlug: option.camperSlug,
    camperName: option.camperName,
    shownIndex: option.index,
    criteriaHash: option.criteriaHash,
    pricePerDay: option.pricePerDay,
    totalPrice: option.totalPrice,
    score: option.score,
    source: option.source,
    featureKeys: option.featureKeys ?? [],
    attributeKeys: Object.keys(option.attributeFacts ?? {}).sort(),
    capabilityKeys: (option.capabilityMatches ?? []).map(match => match.capabilityKey).sort(),
  }
}

function summarizeMemoryEvent(event: MemoryEvent): MemoryEventSummary {
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    timestamp: event.timestamp,
    optionId: event.optionId,
    camperSlug: event.camperSlug,
    metadataKeys: Object.keys(event.metadata ?? {}).sort(),
  }
}

function buildLegacyMirrors(state: ConversationState, memory: SessionMemory): LegacyMemoryMirrorExplanation {
  const fields: LegacyMirrorFieldExplanation[] = []

  if (memory.lastComparedCamper) {
    fields.push({
      field: 'SessionMemory.lastComparedCamper',
      layer: 'SessionMemory',
      status: 'deprecated',
      canonicalSource: 'SessionMemory.memoryEvents(compared)',
      safeUse: ['legacy compatibility display'],
      unsafeUse: ['comparison truth source', 'recommendation ranking input'],
    })
  }

  if (state.lastAvailabilitySlots?.length) {
    fields.push({
      field: 'ConversationState.lastAvailabilitySlots',
      layer: 'ConversationState',
      status: 'legacy_mirror',
      canonicalSource: 'SessionMemory.lastAvailabilityResult / previousAvailabilityResults',
      safeUse: ['legacy UI compatibility'],
      unsafeUse: ['criteria-aware availability history', 'availability truth source'],
    })
  }

  if (state.conversationMemory) {
    fields.push({
      field: 'ConversationState.conversationMemory',
      layer: 'ConversationState',
      status: 'prompt_context',
      canonicalSource: 'Canonical state fields and SessionMemory history, depending on subfield',
      safeUse: ['short prompt context', 'non-authoritative conversation hints'],
      unsafeUse: ['recommendation truth source', 'stable reference registry'],
    })
  }

  if (state.selectedCamperSlug) {
    fields.push({
      field: 'ConversationState.selectedCamperSlug',
      layer: 'ConversationState',
      status: 'compatibility',
      canonicalSource: 'current focus in ConversationState; historical selection in SessionMemory.memoryEvents(selected)',
      safeUse: ['current focus hint'],
      unsafeUse: ['booking confirmation', 'historical selected event replacement'],
    })
  }

  if (state.lastShownCamperSlug) {
    fields.push({
      field: 'ConversationState.lastShownCamperSlug',
      layer: 'ConversationState',
      status: 'compatibility',
      canonicalSource: 'SessionMemory.shownOptions for stable history',
      safeUse: ['proximal follow-up focus'],
      unsafeUse: ['stable option reference', 'recommendation history'],
    })
  }

  if (state.lastShownPrice !== undefined) {
    fields.push({
      field: 'ConversationState.lastShownPrice',
      layer: 'ConversationState',
      status: 'compatibility',
      canonicalSource: 'SessionMemory.shownOptions price summary for historical option price',
      safeUse: ['current refinement anchor'],
      unsafeUse: ['historical price source', 'pricing truth source'],
    })
  }

  if (state.alreadyRecommendedSlugs?.length) {
    fields.push({
      field: 'ConversationState.alreadyRecommendedSlugs',
      layer: 'ConversationState',
      status: 'compatibility',
      canonicalSource: 'current Evaluation Engine control input',
      safeUse: ['current exclusion input'],
      unsafeUse: ['recommendation history', 'memory event replacement'],
    })
  }

  return { fields }
}

function buildCurrentFocus(state: ConversationState): MemoryCurrentFocusExplanation {
  const notes = [
    'Current focus fields help short follow-up interpretation.',
    'They are not stable history and not a recommendation truth source.',
  ]

  return {
    lastShownCamperSlug: state.lastShownCamperSlug,
    lastShownPrice: state.lastShownPrice,
    selectedCamperSlug: state.selectedCamperSlug,
    alreadyRecommendedSlugs: state.alreadyRecommendedSlugs,
    notes,
  }
}

export function buildMemoryExplainabilitySnapshot(
  sessionMemory: SessionMemory | undefined,
  state: ConversationState = {},
): MemoryExplainabilitySnapshot {
  const memory = sessionMemory ?? {}
  const warnings: MemoryExplainabilityWarning[] = []

  if (!sessionMemory) warnings.push('session_memory_missing')
  if (memory.schemaVersion === undefined) warnings.push('schema_version_missing')
  if (memory.schemaVersion !== undefined && memory.schemaVersion !== 1) warnings.push('schema_version_unknown')

  const availabilityCompatibility = memory.lastAvailabilityResult
    ? evaluateAvailabilityCriteriaCompatibility(memory.lastAvailabilityResult.criteria, state)
    : undefined
  const recommendationCompatibility = memory.lastRecommendationResult
    ? evaluateRecommendationCriteriaCompatibility(memory.lastRecommendationResult.criteria, state)
    : undefined

  if (memory.lastAvailabilityResult && !memory.lastAvailabilityResult.criteria) warnings.push('availability_criteria_missing')
  if (memory.lastRecommendationResult && !memory.lastRecommendationResult.criteria) warnings.push('recommendation_criteria_missing')
  if (memory.staleAvailabilityResults?.length) warnings.push('stale_availability_present')
  if (memory.lastComparedCamper) warnings.push('deprecated_field_present')
  if (
    state.lastAvailabilitySlots?.length ||
    state.conversationMemory ||
    state.lastShownCamperSlug ||
    state.lastShownPrice !== undefined ||
    state.selectedCamperSlug ||
    state.alreadyRecommendedSlugs?.length
  ) {
    warnings.push('legacy_mirror_present')
  }
  if ((memory.memoryEvents?.length ?? 0) >= MAX_MEMORY_EVENTS) warnings.push('memory_event_limit_reached')
  if ((memory.shownOptions?.length ?? 0) >= SESSION_MEMORY_LIMITS.shownOptions) warnings.push('shown_options_limit_reached')
  if (availabilityCompatibility?.status === 'needs_recheck' || availabilityCompatibility?.status === 'stale') {
    warnings.push('availability_needs_recheck')
  }
  if (recommendationCompatibility?.status === 'needs_recheck' || recommendationCompatibility?.status === 'stale') {
    warnings.push('recommendation_needs_recheck')
  }

  const availabilityMemory: AvailabilityMemoryExplanation = {
    lastAvailabilityResult: summarizeAvailability(memory.lastAvailabilityResult),
    previousAvailabilityCount: memory.previousAvailabilityResults?.length ?? 0,
    staleAvailabilityCount: memory.staleAvailabilityResults?.length ?? 0,
    lastSpecificCamperAvailability: summarizeAvailability(memory.lastSpecificCamperAvailability),
    criteriaFieldsPresent: criteriaFields(memory.lastAvailabilityResult?.criteria),
    criteriaHashPresent: !!memory.lastAvailabilityResult?.criteriaHash,
    compatibility: availabilityCompatibility
      ? {
          status: availabilityCompatibility.status,
          reasons: availabilityCompatibility.reasons,
          safeForReference: safeForReference(availabilityCompatibility.status),
          safeForCurrentDecision: false,
        }
      : undefined,
  }

  const recommendationMemory: RecommendationMemoryExplanation = {
    lastRecommendationResult: summarizeRecommendation(memory.lastRecommendationResult),
    shownOptionsCount: memory.shownOptions?.length ?? 0,
    shownOptionsPreview: (memory.shownOptions ?? []).slice(-3).map(summarizeShownOption),
    criteriaFieldsPresent: criteriaFields(memory.lastRecommendationResult?.criteria),
    criteriaHashPresent: !!memory.lastRecommendationResult?.criteriaHash,
    compatibility: recommendationCompatibility
      ? {
          status: recommendationCompatibility.status,
          reasons: recommendationCompatibility.reasons,
          safeForReference: safeForReference(recommendationCompatibility.status),
          safeForCurrentDecision: false,
        }
      : undefined,
  }

  const countsByType: Record<MemoryEventType, number> = {
    shown: 0,
    referenced: 0,
    selected: 0,
    dismissed: 0,
    compared: 0,
  }
  for (const event of memory.memoryEvents ?? []) {
    countsByType[event.eventType] += 1
  }

  return {
    schemaVersion: 1,
    availabilityMemory,
    recommendationMemory,
    memoryEvents: {
      totalCount: memory.memoryEvents?.length ?? 0,
      limit: MAX_MEMORY_EVENTS,
      countsByType,
      latestEvents: (memory.memoryEvents ?? []).slice(-5).map(summarizeMemoryEvent),
    },
    compatibility: {
      availability: availabilityMemory.compatibility,
      recommendation: recommendationMemory.compatibility,
    },
    legacyMirrors: buildLegacyMirrors(state, memory),
    currentFocus: buildCurrentFocus(state),
    warnings: [...new Set(warnings)],
  }
}
