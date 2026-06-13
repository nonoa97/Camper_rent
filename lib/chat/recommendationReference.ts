import type {
  ConversationState,
  MemoryEvent,
  RecommendationReferenceHint,
  ReferenceTarget,
  SessionMemory,
  SessionRecommendationResult,
  SessionShownOption,
} from './state'
import {
  createMemoryEvent,
  evaluateRecommendationCriteriaCompatibility,
  type RecommendationCompatibilityResult,
} from './recommendationMemory'

export type RecommendationReferenceStatus = 'resolved' | 'ambiguous' | 'not_found'
export type SupportedRecommendationReferenceTarget =
  | 'lastRecommendation'
  | 'firstShownOption'
  | 'lastShownOption'

export type RecommendationReferenceTarget = SessionRecommendationResult | SessionShownOption
export type RecommendationFactReferenceQuery = RecommendationReferenceHint

export interface RecommendationReferenceResult {
  status: RecommendationReferenceStatus
  target?: RecommendationReferenceTarget
  candidates?: RecommendationReferenceTarget[]
  compatibility?: RecommendationCompatibilityResult
  reasons: string[]
}

function isSupportedRecommendationReferenceTarget(
  referenceTarget: ReferenceTarget | undefined,
): referenceTarget is SupportedRecommendationReferenceTarget {
  return (
    referenceTarget === 'lastRecommendation' ||
    referenceTarget === 'firstShownOption' ||
    referenceTarget === 'lastShownOption'
  )
}

function notFound(reason: string): RecommendationReferenceResult {
  return {
    status: 'not_found',
    reasons: [reason],
  }
}

function ambiguous(
  candidates: RecommendationReferenceTarget[],
  reason: string,
): RecommendationReferenceResult {
  return {
    status: 'ambiguous',
    candidates,
    reasons: [reason],
  }
}

function resolveCandidateList(
  candidates: SessionShownOption[],
  currentState: ConversationState,
  resolvedReason: string,
  ambiguousReason: string,
  notFoundReason: string,
): RecommendationReferenceResult {
  if (candidates.length === 0) return notFound(notFoundReason)
  if (candidates.length > 1) return ambiguous(candidates, ambiguousReason)
  return resolved(candidates[0], currentState, resolvedReason)
}

function resolved(
  target: RecommendationReferenceTarget,
  currentState: ConversationState,
  reason: string,
): RecommendationReferenceResult {
  return {
    status: 'resolved',
    target,
    compatibility: evaluateRecommendationCriteriaCompatibility(target.criteria, currentState),
    reasons: [reason],
  }
}

function resolveFirstShownOption(
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  const options = sessionMemory.shownOptions ?? []
  if (options.length === 0) return notFound('no_shown_options')

  const minIndex = Math.min(...options.map(option => option.index))
  const candidates = options.filter(option => option.index === minIndex)
  if (candidates.length > 1) return ambiguous(candidates, 'multiple_first_shown_options')

  return resolved(candidates[0], currentState, 'first_shown_option_resolved')
}

function resolveLastShownOption(
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  const options = sessionMemory.shownOptions ?? []
  if (options.length === 0) return notFound('no_shown_options')

  const maxIndex = Math.max(...options.map(option => option.index))
  const candidates = options.filter(option => option.index === maxIndex)
  if (candidates.length > 1) return ambiguous(candidates, 'multiple_last_shown_options')

  return resolved(candidates[0], currentState, 'last_shown_option_resolved')
}

function resolveLastRecommendation(
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  if (!sessionMemory.lastRecommendationResult) return notFound('no_last_recommendation')

  return resolved(
    sessionMemory.lastRecommendationResult,
    currentState,
    'last_recommendation_resolved',
  )
}

export function resolveRecommendationReference(
  referenceTarget: ReferenceTarget | undefined,
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  if (!isSupportedRecommendationReferenceTarget(referenceTarget)) {
    return notFound('unsupported_recommendation_reference_target')
  }

  if (referenceTarget === 'lastRecommendation') {
    return resolveLastRecommendation(sessionMemory, currentState)
  }

  if (referenceTarget === 'firstShownOption') {
    return resolveFirstShownOption(sessionMemory, currentState)
  }

  return resolveLastShownOption(sessionMemory, currentState)
}

function shownOptions(sessionMemory: SessionMemory): SessionShownOption[] {
  return sessionMemory.shownOptions ?? []
}

function resolveFeatureReference(
  featureKey: string,
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  return resolveCandidateList(
    shownOptions(sessionMemory).filter(option => option.featureKeys?.includes(featureKey)),
    currentState,
    'feature_reference_resolved',
    'multiple_feature_reference_matches',
    'no_feature_reference_match',
  )
}

function resolveCapabilityReference(
  capabilityKey: string,
  minScore: number | undefined,
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  const threshold = minScore ?? 0
  return resolveCandidateList(
    shownOptions(sessionMemory).filter(option =>
      option.capabilityMatches?.some(match =>
        match.capabilityKey === capabilityKey &&
        match.score > threshold,
      ),
    ),
    currentState,
    'capability_reference_resolved',
    'multiple_capability_reference_matches',
    'no_capability_reference_match',
  )
}

function attributeValue(option: SessionShownOption, key: RecommendationFactReferenceQuery & { kind: 'attribute' }): string | number | boolean | null | undefined {
  return option.attributeFacts?.[key.attributeKey]
}

function resolveAttributeReference(
  query: RecommendationFactReferenceQuery & { kind: 'attribute' },
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  const options = shownOptions(sessionMemory)
  if (options.length === 0) return notFound('no_shown_options')

  if (query.relation === 'max' || query.relation === 'min') {
    const numericOptions = options
      .map(option => ({ option, value: attributeValue(option, query) }))
      .filter((item): item is { option: SessionShownOption; value: number } => typeof item.value === 'number')
    if (numericOptions.length === 0) return notFound('missing_attribute_data')

    const targetValue = query.relation === 'max'
      ? Math.max(...numericOptions.map(item => item.value))
      : Math.min(...numericOptions.map(item => item.value))
    return resolveCandidateList(
      numericOptions
        .filter(item => item.value === targetValue)
        .map(item => item.option),
      currentState,
      'attribute_reference_resolved',
      'multiple_attribute_reference_matches',
      'no_attribute_reference_match',
    )
  }

  if (query.value == null) return notFound('missing_attribute_reference_value')

  return resolveCandidateList(
    options.filter(option => attributeValue(option, query) === query.value),
    currentState,
    'attribute_reference_resolved',
    'multiple_attribute_reference_matches',
    'no_attribute_reference_match',
  )
}

function priceValue(option: SessionShownOption, field: 'pricePerDay' | 'totalPrice'): number | undefined {
  return field === 'totalPrice' ? option.totalPrice : option.pricePerDay
}

function resolvePriceReference(
  query: RecommendationFactReferenceQuery & { kind: 'price' },
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  const options = shownOptions(sessionMemory)
  if (options.length === 0) return notFound('no_shown_options')

  const field = query.priceField ?? 'pricePerDay'
  const pricedOptions = options
    .map(option => ({ option, value: priceValue(option, field) }))
    .filter((item): item is { option: SessionShownOption; value: number } => typeof item.value === 'number')
  if (pricedOptions.length !== options.length || pricedOptions.length < 2) {
    return notFound('insufficient_price_data')
  }

  const targetValue = query.relation === 'cheapest'
    ? Math.min(...pricedOptions.map(item => item.value))
    : Math.max(...pricedOptions.map(item => item.value))
  return resolveCandidateList(
    pricedOptions
      .filter(item => item.value === targetValue)
      .map(item => item.option),
    currentState,
    'price_reference_resolved',
    'multiple_price_reference_matches',
    'no_price_reference_match',
  )
}

export function resolveRecommendationFactReference(
  query: RecommendationFactReferenceQuery,
  sessionMemory: SessionMemory,
  currentState: ConversationState,
): RecommendationReferenceResult {
  if (query.kind === 'feature') {
    return resolveFeatureReference(query.featureKey, sessionMemory, currentState)
  }
  if (query.kind === 'attribute') {
    return resolveAttributeReference(query, sessionMemory, currentState)
  }
  if (query.kind === 'capability') {
    return resolveCapabilityReference(query.capabilityKey, query.minScore, sessionMemory, currentState)
  }
  return resolvePriceReference(query, sessionMemory, currentState)
}

export function createReferencedRecommendationEvent(
  result: RecommendationReferenceResult,
  metadata?: Record<string, string | number | boolean | null | string[] | number[] | boolean[]>,
  timestamp?: string,
): MemoryEvent | undefined {
  if (result.status !== 'resolved' || !result.target?.optionId) return undefined
  return createMemoryEvent({
    eventType: 'referenced',
    optionId: result.target.optionId,
    camperSlug: result.target.camperSlug,
    metadata,
  }, timestamp)
}
