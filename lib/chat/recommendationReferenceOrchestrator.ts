import type {
  ConversationState,
  ReferenceTarget,
  SessionMemory,
} from './state'
import {
  RecommendationReferenceResult,
  resolveRecommendationFactReference,
  resolveRecommendationReference,
} from './recommendationReference'

export interface ResolveRecommendationReferencesInput {
  state: ConversationState
  sessionMemory: SessionMemory
}

export interface ResolveRecommendationReferencesResult {
  recommendationReferenceResult?: RecommendationReferenceResult
  primaryInteractionResult?: RecommendationReferenceResult
  secondaryInteractionResult?: RecommendationReferenceResult
}

export function isRecommendationReferenceTarget(
  referenceTarget: ReferenceTarget | undefined,
): referenceTarget is Extract<ReferenceTarget, 'lastRecommendation' | 'firstShownOption' | 'lastShownOption'> {
  return (
    referenceTarget === 'lastRecommendation' ||
    referenceTarget === 'firstShownOption' ||
    referenceTarget === 'lastShownOption'
  )
}

function resolvePrimaryReference(
  state: ConversationState,
  sessionMemory: SessionMemory,
): RecommendationReferenceResult | undefined {
  if (state.recommendationReference) {
    return resolveRecommendationFactReference(
      state.recommendationReference,
      sessionMemory,
      state,
    )
  }

  if (isRecommendationReferenceTarget(state.referenceTarget)) {
    return resolveRecommendationReference(
      state.referenceTarget,
      sessionMemory,
      state,
    )
  }

  return undefined
}

function resolveInteractionTarget(
  state: ConversationState,
  sessionMemory: SessionMemory,
  targetReference: NonNullable<ConversationState['recommendationInteraction']>['targetReference'] | undefined,
  targetRecommendationReference: NonNullable<ConversationState['recommendationInteraction']>['targetRecommendationReference'] | undefined,
  fallbackResult: RecommendationReferenceResult | undefined,
): RecommendationReferenceResult | undefined {
  if (targetRecommendationReference) {
    return resolveRecommendationFactReference(targetRecommendationReference, sessionMemory, state)
  }

  if (isRecommendationReferenceTarget(targetReference)) {
    return resolveRecommendationReference(targetReference, sessionMemory, state)
  }

  return fallbackResult
}

export function resolveRecommendationReferencesForTurn(
  input: ResolveRecommendationReferencesInput,
): ResolveRecommendationReferencesResult {
  const { state, sessionMemory } = input
  const recommendationReferenceResult = resolvePrimaryReference(state, sessionMemory)

  const primaryInteractionResult = state.recommendationInteraction
    ? resolveInteractionTarget(
        state,
        sessionMemory,
        state.recommendationInteraction.targetReference,
        state.recommendationInteraction.targetRecommendationReference,
        recommendationReferenceResult,
      )
    : undefined

  const secondaryInteractionResult = state.recommendationInteraction?.type === 'compared'
    ? resolveInteractionTarget(
        state,
        sessionMemory,
        state.recommendationInteraction.secondaryTargetReference,
        state.recommendationInteraction.secondaryRecommendationReference,
        undefined,
      )
    : undefined

  return {
    recommendationReferenceResult,
    primaryInteractionResult,
    secondaryInteractionResult,
  }
}
