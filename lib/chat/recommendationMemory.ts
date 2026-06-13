import type {
  ConversationState,
  MemoryEvent,
  MemoryEventMetadata,
  MemoryEventType,
  RecommendationCriteria,
  RecommendationAttributeFacts,
  RecommendationAvailabilitySummary,
  RecommendationCapabilityMatchSummary,
  SessionMemory,
  SessionRecommendationResult,
  SessionShownOption,
} from './state'
import type { PreferenceStrength, PricingPreference } from './preferences'

export const MAX_MEMORY_EVENTS = 50

export type RecommendationCompatibilityStatus =
  | 'compatible'
  | 'compatible_relaxed'
  | 'needs_recheck'
  | 'stale'

export interface RecommendationCompatibilityResult {
  status: RecommendationCompatibilityStatus
  reasons: string[]
}

export interface RecommendationMemoryInput {
  camperSlug: string
  camperName: string
  pricePerDay?: number
  totalPrice?: number
  score?: number | null
  source?: SessionRecommendationResult['source']
  featureKeys?: string[]
  attributeFacts?: RecommendationAttributeFacts
  capabilityMatches?: RecommendationCapabilityMatchSummary[]
  availabilitySummary?: RecommendationAvailabilitySummary
}

export interface MemoryEventInput {
  eventType: MemoryEventType
  optionId: string
  camperSlug?: string
  metadata?: MemoryEventMetadata
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(stableValue)
      .filter(item => item !== undefined)
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined && item !== null)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, stableValue(item)]),
    )
  }
  return value
}

function stableStringify(value: unknown): string {
  return JSON.stringify(stableValue(value))
}

function hashString(value: string): string {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

function compactMetadata(metadata: MemoryEventMetadata | undefined): MemoryEventMetadata | undefined {
  if (!metadata) return undefined
  const compacted = Object.fromEntries(
    Object.entries(metadata).filter(([, value]) => {
      if (value == null) return false
      if (Array.isArray(value)) return value.length > 0
      return true
    }),
  ) as MemoryEventMetadata
  return Object.keys(compacted).length > 0 ? compacted : undefined
}

export function createMemoryEvent(input: MemoryEventInput, timestamp = new Date().toISOString()): MemoryEvent {
  const metadata = compactMetadata(input.metadata)
  const eventSeed = stableStringify({
    eventType: input.eventType,
    optionId: input.optionId,
    camperSlug: input.camperSlug,
    timestamp,
    metadata,
  })
  return {
    eventId: `evt_${hashString(eventSeed)}`,
    eventType: input.eventType,
    timestamp,
    optionId: input.optionId,
    camperSlug: input.camperSlug,
    metadata,
  }
}

export function appendMemoryEvents(
  sessionMemory: SessionMemory,
  events: MemoryEvent[],
  limit = MAX_MEMORY_EVENTS,
): SessionMemory {
  if (events.length === 0) return sessionMemory
  const merged = [
    ...(sessionMemory.memoryEvents ?? []),
    ...events,
  ]
  const deduped = [
    ...new Map(merged.map(event => [event.eventId, event])).values(),
  ]
  return {
    ...sessionMemory,
    memoryEvents: deduped.slice(-limit),
  }
}

function compactCriteria(criteria: RecommendationCriteria): RecommendationCriteria {
  return Object.fromEntries(
    Object.entries(criteria).filter(([, value]) => {
      if (value == null) return false
      if (Array.isArray(value)) return value.length > 0
      return true
    }),
  ) as RecommendationCriteria
}

export function createRecommendationCriteria(state: ConversationState): RecommendationCriteria {
  return compactCriteria({
    month: state.month,
    startDate: state.startDate,
    endDate: state.endDate,
    durationDays: state.durationDays,
    passengers: state.passengers,
    campingType: state.campingType,
    featurePreferences: state.featurePreferences,
    attributePreferences: state.attributePreferences,
    capabilityPreferences: state.capabilityPreferences,
    pricingPreference: state.pricingPreference,
  })
}

export function createRecommendationCriteriaHash(criteria: RecommendationCriteria): string {
  return hashString(stableStringify(criteria))
}

function promoteStatus(
  current: RecommendationCompatibilityStatus,
  next: RecommendationCompatibilityStatus,
): RecommendationCompatibilityStatus {
  const rank: Record<RecommendationCompatibilityStatus, number> = {
    compatible: 0,
    compatible_relaxed: 1,
    needs_recheck: 2,
    stale: 3,
  }
  return rank[next] > rank[current] ? next : current
}

function compareNumber(
  oldValue: number | undefined,
  newValue: number | undefined,
  reducedReason: string,
  increasedReason: string,
): RecommendationCompatibilityResult {
  if (oldValue == null || newValue == null || oldValue === newValue) {
    return { status: 'compatible', reasons: [] }
  }
  return newValue < oldValue
    ? { status: 'compatible_relaxed', reasons: [reducedReason] }
    : { status: 'needs_recheck', reasons: [increasedReason] }
}

function preferenceKeysByStrength<T extends { key: string; strength: PreferenceStrength }>(
  items: T[] | undefined,
  strength: PreferenceStrength,
  getIdentity: (item: T) => string = item => item.key,
): Set<string> {
  return new Set((items ?? [])
    .filter(item => item.strength === strength)
    .map(getIdentity))
}

function appendSetDifferenceReasons(
  oldKeys: Set<string>,
  newKeys: Set<string>,
  addedReason: string,
  removedReason: string,
): RecommendationCompatibilityResult {
  const reasons: string[] = []
  let status: RecommendationCompatibilityStatus = 'compatible'

  for (const key of newKeys) {
    if (!oldKeys.has(key)) {
      reasons.push(addedReason)
      status = promoteStatus(status, 'needs_recheck')
      break
    }
  }

  for (const key of oldKeys) {
    if (!newKeys.has(key)) {
      reasons.push(removedReason)
      status = promoteStatus(status, 'compatible_relaxed')
      break
    }
  }

  return { status, reasons }
}

function hasSoftPreferenceChange<T extends { key: string; strength: PreferenceStrength }>(
  oldItems: T[] | undefined,
  newItems: T[] | undefined,
): boolean {
  const oldKeys = preferenceKeysByStrength(oldItems, 'soft')
  const newKeys = preferenceKeysByStrength(newItems, 'soft')
  if (oldKeys.size !== newKeys.size) return true
  return [...oldKeys].some(key => !newKeys.has(key))
}

function pricingBudgetAmount(preference?: PricingPreference): number | undefined {
  return preference?.intent === 'budget_limit' ? preference.amount : undefined
}

function evaluatePricingCompatibility(
  oldPreference: PricingPreference | undefined,
  newPreference: PricingPreference | undefined,
): RecommendationCompatibilityResult {
  if (!oldPreference && !newPreference) return { status: 'compatible', reasons: [] }
  if (oldPreference?.intent === newPreference?.intent && oldPreference?.amount === newPreference?.amount) {
    return { status: 'compatible', reasons: [] }
  }

  const reasons: string[] = []
  let status: RecommendationCompatibilityStatus = 'compatible'
  const oldBudget = pricingBudgetAmount(oldPreference)
  const newBudget = pricingBudgetAmount(newPreference)

  if (newPreference?.intent === 'cheaper') {
    reasons.push('pricing_tightened')
    status = promoteStatus(status, 'needs_recheck')
  }

  if (newPreference?.intent === 'premium_ok') {
    reasons.push('pricing_relaxed')
    status = promoteStatus(status, 'compatible_relaxed')
  }

  if (newBudget != null && oldBudget != null) {
    if (newBudget < oldBudget) {
      reasons.push('pricing_tightened')
      status = promoteStatus(status, 'needs_recheck')
    } else if (newBudget > oldBudget) {
      reasons.push('pricing_relaxed')
      status = promoteStatus(status, 'compatible_relaxed')
    }
  } else if (newBudget != null) {
    reasons.push('pricing_tightened')
    status = promoteStatus(status, 'needs_recheck')
  } else if (oldBudget != null && !newPreference) {
    reasons.push('pricing_relaxed')
    status = promoteStatus(status, 'compatible_relaxed')
  }

  if (reasons.length === 0) {
    reasons.push('pricing_changed')
  }

  return { status, reasons: [...new Set(reasons)] }
}

function mergeCompatibilityResults(
  results: RecommendationCompatibilityResult[],
): RecommendationCompatibilityResult {
  return results.reduce<RecommendationCompatibilityResult>((acc, result) => ({
    status: promoteStatus(acc.status, result.status),
    reasons: [...new Set([...acc.reasons, ...result.reasons])],
  }), { status: 'compatible', reasons: [] })
}

export function evaluateRecommendationCriteriaCompatibility(
  oldCriteria: RecommendationCriteria | undefined,
  currentState: ConversationState,
): RecommendationCompatibilityResult {
  if (!oldCriteria) {
    return { status: 'needs_recheck', reasons: ['missing_criteria'] }
  }

  const currentCriteria = createRecommendationCriteria(currentState)
  const results: RecommendationCompatibilityResult[] = []

  if (oldCriteria.month && currentCriteria.month && oldCriteria.month !== currentCriteria.month) {
    results.push({ status: 'stale', reasons: ['month_changed'] })
  }
  if (oldCriteria.startDate && currentCriteria.startDate && oldCriteria.startDate !== currentCriteria.startDate) {
    results.push({ status: 'stale', reasons: ['start_date_changed'] })
  }
  if (oldCriteria.endDate && currentCriteria.endDate && oldCriteria.endDate !== currentCriteria.endDate) {
    results.push({ status: 'stale', reasons: ['end_date_changed'] })
  }

  results.push(compareNumber(
    oldCriteria.durationDays,
    currentCriteria.durationDays,
    'duration_reduced',
    'duration_increased',
  ))
  results.push(compareNumber(
    oldCriteria.passengers,
    currentCriteria.passengers,
    'passengers_reduced',
    'passengers_increased',
  ))

  if (oldCriteria.campingType === 'wild' || currentCriteria.campingType === 'wild') {
    results.push({ status: 'stale', reasons: ['legacy_wild_camping_type'] })
  }

  results.push(appendSetDifferenceReasons(
    preferenceKeysByStrength(oldCriteria.featurePreferences, 'hard'),
    preferenceKeysByStrength(currentCriteria.featurePreferences, 'hard'),
    'hard_feature_added',
    'hard_feature_removed',
  ))
  if (hasSoftPreferenceChange(oldCriteria.featurePreferences, currentCriteria.featurePreferences)) {
    results.push({ status: 'compatible', reasons: ['soft_feature_changed'] })
  }

  results.push(appendSetDifferenceReasons(
    preferenceKeysByStrength(
      oldCriteria.attributePreferences,
      'hard',
      preference => `${preference.key}|${preference.operator ?? ''}|${String(preference.value)}`,
    ),
    preferenceKeysByStrength(
      currentCriteria.attributePreferences,
      'hard',
      preference => `${preference.key}|${preference.operator ?? ''}|${String(preference.value)}`,
    ),
    'hard_attribute_added',
    'hard_attribute_removed',
  ))
  if (hasSoftPreferenceChange(oldCriteria.attributePreferences, currentCriteria.attributePreferences)) {
    results.push({ status: 'compatible', reasons: ['soft_attribute_changed'] })
  }

  results.push(appendSetDifferenceReasons(
    preferenceKeysByStrength(oldCriteria.capabilityPreferences, 'hard'),
    preferenceKeysByStrength(currentCriteria.capabilityPreferences, 'hard'),
    'hard_capability_added',
    'hard_capability_removed',
  ))
  if (hasSoftPreferenceChange(oldCriteria.capabilityPreferences, currentCriteria.capabilityPreferences)) {
    results.push({ status: 'compatible', reasons: ['soft_capability_changed'] })
  }

  results.push(evaluatePricingCompatibility(oldCriteria.pricingPreference, currentCriteria.pricingPreference))

  return mergeCompatibilityResults(results)
}

export function createRecommendationOptionId(
  shownIndex: number,
  input: Pick<RecommendationMemoryInput, 'camperSlug' | 'availabilitySummary'>,
  criteriaHash: string,
): string {
  const availabilityKey = [
    input.availabilitySummary?.from ?? '',
    input.availabilitySummary?.to ?? '',
    input.availabilitySummary?.days ?? '',
  ].join('|')
  return `rec_${shownIndex}_${input.camperSlug}_${hashString(`${criteriaHash}|${input.camperSlug}|${availabilityKey}`)}`
}

export function createRecommendationMemorySnapshots(
  existingOptions: SessionShownOption[],
  inputs: RecommendationMemoryInput[],
  state: ConversationState,
  shownAt = new Date().toISOString(),
): { options: SessionShownOption[]; lastRecommendationResult?: SessionRecommendationResult } {
  const criteria = createRecommendationCriteria(state)
  const criteriaHash = createRecommendationCriteriaHash(criteria)

  const options = inputs.map((input, index): SessionShownOption => {
    const shownIndex = existingOptions.length + index + 1
    const optionId = createRecommendationOptionId(shownIndex, input, criteriaHash)
    return {
      index: shownIndex,
      optionId,
      camperSlug: input.camperSlug,
      camperName: input.camperName,
      shownAt,
      criteria,
      criteriaHash,
      from: input.availabilitySummary?.from,
      to: input.availabilitySummary?.to,
      days: input.availabilitySummary?.days,
      pricePerDay: input.pricePerDay,
      totalPrice: input.totalPrice,
      score: input.score,
      source: input.source,
      featureKeys: input.featureKeys,
      attributeFacts: input.attributeFacts,
      capabilityMatches: input.capabilityMatches,
      availabilitySummary: input.availabilitySummary,
    }
  })

  const first = options[0]
  if (!first) return { options }

  return {
    options,
    lastRecommendationResult: {
      optionId: first.optionId,
      camperSlug: first.camperSlug,
      camperName: first.camperName,
      shownIndex: first.index,
      shownAt: first.shownAt,
      criteria,
      criteriaHash,
      from: first.from,
      to: first.to,
      days: first.days,
      pricePerDay: first.pricePerDay,
      totalPrice: first.totalPrice,
      score: first.score,
      source: first.source,
      featureKeys: first.featureKeys,
      attributeFacts: first.attributeFacts,
      capabilityMatches: first.capabilityMatches,
      availabilitySummary: first.availabilitySummary,
    },
  }
}

export function rememberRecommendationSnapshots(
  sessionMemory: SessionMemory,
  inputs: RecommendationMemoryInput[],
  state: ConversationState,
): SessionMemory {
  if (inputs.length === 0) return sessionMemory
  const existing = sessionMemory.shownOptions ?? []
  const shownAt = new Date().toISOString()
  const snapshots = createRecommendationMemorySnapshots(existing, inputs, state, shownAt)
  const nextMemory: SessionMemory = {
    ...sessionMemory,
    lastRecommendationResult: snapshots.lastRecommendationResult,
    shownOptions: [...existing, ...snapshots.options].slice(-12),
  }
  return appendMemoryEvents(
    nextMemory,
    snapshots.options
      .filter(option => !!option.optionId)
      .map(option => createMemoryEvent({
        eventType: 'shown',
        optionId: option.optionId!,
        camperSlug: option.camperSlug,
        metadata: {
          shownIndex: option.index,
          source: option.source ?? null,
        },
      }, option.shownAt ?? shownAt)),
  )
}
