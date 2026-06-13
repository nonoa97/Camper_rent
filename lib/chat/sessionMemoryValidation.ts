import {
  MemoryEvent,
  MemoryEventMetadata,
  MemoryEventType,
  SessionAvailabilityResult,
  SessionMemory,
  SessionRecommendationResult,
  SessionShownOption,
} from './state'

export const SESSION_MEMORY_SCHEMA_VERSION = 1

export const SESSION_MEMORY_LIMITS = {
  previousAvailabilityResults: 8,
  staleAvailabilityResults: 8,
  shownOptions: 12,
  memoryEvents: 50,
} as const

export type SessionMemoryValidationWarning =
  | 'memory_not_object'
  | 'schema_version_invalid'
  | 'availability_result_invalid'
  | 'availability_history_invalid'
  | 'recommendation_result_invalid'
  | 'shown_options_invalid'
  | 'memory_events_invalid'
  | 'last_compared_camper_deprecated'
  | 'last_compared_camper_invalid'

export interface SessionMemoryValidationResult {
  memory: SessionMemory
  warnings: SessionMemoryValidationWarning[]
}

const MEMORY_EVENT_TYPES: MemoryEventType[] = ['shown', 'referenced', 'selected', 'dismissed', 'compared']
const AVAILABILITY_SOURCES: SessionAvailabilityResult['source'][] = [
  'availability_search',
  'recommendation',
  'fallback_earliest',
  'longest',
]
const RECOMMENDATION_SOURCES: NonNullable<SessionRecommendationResult['source']>[] = [
  'evaluation_engine',
  'legacy_fallback',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function optionalString(value: unknown): string | undefined {
  return isString(value) ? value : undefined
}

function optionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined
}

function sanitizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.filter(isString)
  return items.length ? items : undefined
}

function sanitizeMetadataValue(value: unknown): MemoryEventMetadata[string] | undefined {
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null
  ) {
    return value
  }

  if (!Array.isArray(value)) return undefined
  if (value.every(item => typeof item === 'string')) return value
  if (value.every(item => typeof item === 'number')) return value
  if (value.every(item => typeof item === 'boolean')) return value
  return undefined
}

function sanitizeMetadata(value: unknown): MemoryEventMetadata | undefined {
  if (!isRecord(value)) return undefined
  const entries = Object.entries(value)
    .map(([key, item]) => [key, sanitizeMetadataValue(item)] as const)
    .filter((entry): entry is readonly [string, MemoryEventMetadata[string]] => entry[1] !== undefined)

  return entries.length ? Object.fromEntries(entries) as MemoryEventMetadata : undefined
}

function sanitizeAvailabilityResult(value: unknown): SessionAvailabilityResult | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isString(value.camperSlug) ||
    !isString(value.camperName) ||
    !isString(value.from) ||
    !isString(value.to) ||
    !isFiniteNumber(value.days) ||
    !AVAILABILITY_SOURCES.includes(value.source as SessionAvailabilityResult['source'])
  ) {
    return undefined
  }

  return {
    camperSlug: value.camperSlug,
    camperName: value.camperName,
    from: value.from,
    to: value.to,
    days: value.days,
    pricePerDay: optionalNumber(value.pricePerDay),
    source: value.source as SessionAvailabilityResult['source'],
    criteria: isRecord(value.criteria) ? value.criteria as SessionAvailabilityResult['criteria'] : undefined,
    criteriaHash: optionalString(value.criteriaHash),
  }
}

function sanitizeRecommendationResult(value: unknown): SessionRecommendationResult | undefined {
  if (!isRecord(value)) return undefined
  if (!isString(value.camperSlug) || !isString(value.camperName)) return undefined

  return {
    optionId: optionalString(value.optionId),
    camperSlug: value.camperSlug,
    camperName: value.camperName,
    shownIndex: optionalNumber(value.shownIndex),
    shownAt: optionalString(value.shownAt),
    criteria: isRecord(value.criteria) ? value.criteria as SessionRecommendationResult['criteria'] : undefined,
    criteriaHash: optionalString(value.criteriaHash),
    from: optionalString(value.from),
    to: optionalString(value.to),
    days: optionalNumber(value.days),
    pricePerDay: optionalNumber(value.pricePerDay),
    totalPrice: optionalNumber(value.totalPrice),
    score: value.score === null ? null : optionalNumber(value.score),
    source: RECOMMENDATION_SOURCES.includes(value.source as NonNullable<SessionRecommendationResult['source']>)
      ? value.source as SessionRecommendationResult['source']
      : undefined,
    featureKeys: sanitizeStringArray(value.featureKeys),
    attributeFacts: isRecord(value.attributeFacts)
      ? value.attributeFacts as SessionRecommendationResult['attributeFacts']
      : undefined,
    capabilityMatches: Array.isArray(value.capabilityMatches)
      ? value.capabilityMatches as SessionRecommendationResult['capabilityMatches']
      : undefined,
    availabilitySummary: isRecord(value.availabilitySummary)
      ? value.availabilitySummary as SessionRecommendationResult['availabilitySummary']
      : undefined,
  }
}

function sanitizeShownOption(value: unknown): SessionShownOption | undefined {
  if (!isRecord(value)) return undefined
  if (!isFiniteNumber(value.index) || !isString(value.camperSlug) || !isString(value.camperName)) {
    return undefined
  }

  return {
    index: value.index,
    optionId: optionalString(value.optionId),
    camperSlug: value.camperSlug,
    camperName: value.camperName,
    shownAt: optionalString(value.shownAt),
    criteria: isRecord(value.criteria) ? value.criteria as SessionShownOption['criteria'] : undefined,
    criteriaHash: optionalString(value.criteriaHash),
    from: optionalString(value.from),
    to: optionalString(value.to),
    days: optionalNumber(value.days),
    pricePerDay: optionalNumber(value.pricePerDay),
    totalPrice: optionalNumber(value.totalPrice),
    score: value.score === null ? null : optionalNumber(value.score),
    source: RECOMMENDATION_SOURCES.includes(value.source as NonNullable<SessionShownOption['source']>)
      ? value.source as SessionShownOption['source']
      : undefined,
    featureKeys: sanitizeStringArray(value.featureKeys),
    attributeFacts: isRecord(value.attributeFacts) ? value.attributeFacts as SessionShownOption['attributeFacts'] : undefined,
    capabilityMatches: Array.isArray(value.capabilityMatches)
      ? value.capabilityMatches as SessionShownOption['capabilityMatches']
      : undefined,
    availabilitySummary: isRecord(value.availabilitySummary)
      ? value.availabilitySummary as SessionShownOption['availabilitySummary']
      : undefined,
  }
}

function sanitizeMemoryEvent(value: unknown): MemoryEvent | undefined {
  if (!isRecord(value)) return undefined
  if (
    !isString(value.eventId) ||
    !MEMORY_EVENT_TYPES.includes(value.eventType as MemoryEventType) ||
    !isString(value.timestamp) ||
    !isString(value.optionId)
  ) {
    return undefined
  }

  return {
    eventId: value.eventId,
    eventType: value.eventType as MemoryEventType,
    timestamp: value.timestamp,
    optionId: value.optionId,
    camperSlug: optionalString(value.camperSlug),
    metadata: sanitizeMetadata(value.metadata),
  }
}

function sanitizeArray<T>(
  value: unknown,
  sanitizeItem: (item: unknown) => T | undefined,
  limit: number,
): T[] | undefined {
  if (!Array.isArray(value)) return undefined
  const items = value.map(sanitizeItem).filter((item): item is T => item !== undefined)
  return items.length ? items.slice(-limit) : undefined
}

export function validateAndSanitizeSessionMemory(input: unknown): SessionMemoryValidationResult {
  const warnings: SessionMemoryValidationWarning[] = []
  if (!isRecord(input)) {
    return { memory: {}, warnings: ['memory_not_object'] }
  }

  const memory: SessionMemory = {}

  if ('schemaVersion' in input) {
    if (isFiniteNumber(input.schemaVersion) && Number.isInteger(input.schemaVersion) && input.schemaVersion > 0) {
      memory.schemaVersion = input.schemaVersion
    } else {
      warnings.push('schema_version_invalid')
    }
  }

  const lastAvailabilityResult = sanitizeAvailabilityResult(input.lastAvailabilityResult)
  if (lastAvailabilityResult) memory.lastAvailabilityResult = lastAvailabilityResult
  else if ('lastAvailabilityResult' in input) warnings.push('availability_result_invalid')

  const previousAvailabilityResults = sanitizeArray(
    input.previousAvailabilityResults,
    sanitizeAvailabilityResult,
    SESSION_MEMORY_LIMITS.previousAvailabilityResults,
  )
  if (previousAvailabilityResults) memory.previousAvailabilityResults = previousAvailabilityResults
  else if ('previousAvailabilityResults' in input) warnings.push('availability_history_invalid')

  const staleAvailabilityResults = sanitizeArray(
    input.staleAvailabilityResults,
    sanitizeAvailabilityResult,
    SESSION_MEMORY_LIMITS.staleAvailabilityResults,
  )
  if (staleAvailabilityResults) memory.staleAvailabilityResults = staleAvailabilityResults
  else if ('staleAvailabilityResults' in input) warnings.push('availability_history_invalid')

  const lastSpecificCamperAvailability = sanitizeAvailabilityResult(input.lastSpecificCamperAvailability)
  if (lastSpecificCamperAvailability) memory.lastSpecificCamperAvailability = lastSpecificCamperAvailability
  else if ('lastSpecificCamperAvailability' in input) warnings.push('availability_result_invalid')

  const lastRecommendationResult = sanitizeRecommendationResult(input.lastRecommendationResult)
  if (lastRecommendationResult) memory.lastRecommendationResult = lastRecommendationResult
  else if ('lastRecommendationResult' in input) warnings.push('recommendation_result_invalid')

  const shownOptions = sanitizeArray(
    input.shownOptions,
    sanitizeShownOption,
    SESSION_MEMORY_LIMITS.shownOptions,
  )
  if (shownOptions) memory.shownOptions = shownOptions
  else if ('shownOptions' in input) warnings.push('shown_options_invalid')

  const memoryEvents = sanitizeArray(
    input.memoryEvents,
    sanitizeMemoryEvent,
    SESSION_MEMORY_LIMITS.memoryEvents,
  )
  if (memoryEvents) memory.memoryEvents = memoryEvents
  else if ('memoryEvents' in input) warnings.push('memory_events_invalid')

  if ('lastComparedCamper' in input) {
    if (isString(input.lastComparedCamper)) warnings.push('last_compared_camper_deprecated')
    else warnings.push('last_compared_camper_invalid')
  }

  return { memory, warnings: [...new Set(warnings)] }
}

export function sanitizeSessionMemory(input: unknown): SessionMemory {
  return validateAndSanitizeSessionMemory(input).memory
}
