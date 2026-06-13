import type { ConversationState } from './state'
import type { CamperEvaluationResult } from './evaluation'
import type { BackendSelectedRecommendation } from './evaluationContext'
import type { GptContext, RefinementContext } from './prompts'
import type { RecommendationReferenceResult } from './recommendationReference'

export type RefinementDeltaSummary = {
  stateDeltaSummary: string[]
}

export function summarizeReferencedRecommendationTarget(
  result: RecommendationReferenceResult | undefined,
): RefinementContext['referencedTarget'] | undefined {
  if (result?.status !== 'resolved' || !result.target) return undefined
  const target = result.target
  return {
    optionId: target.optionId,
    camperSlug: target.camperSlug,
    camperName: target.camperName,
    shownIndex: 'shownIndex' in target ? target.shownIndex : 'index' in target ? target.index : undefined,
  }
}

export function summarizeRecommendationReferenceResolution(
  result: RecommendationReferenceResult | undefined,
): RefinementContext['referenceResolution'] | undefined {
  if (!result) return undefined
  return {
    status: result.status,
    reasons: result.reasons,
    candidateCount: result.status === 'ambiguous' ? (result.candidates?.length ?? 0) : undefined,
  }
}

export function summarizeRecommendationCompatibility(
  result: RecommendationReferenceResult | undefined,
): RefinementContext['compatibility'] | undefined {
  if (result?.status !== 'resolved' || !result.compatibility) return undefined
  return {
    status: result.compatibility.status,
    reasons: result.compatibility.reasons,
  }
}

export function summarizeRefinementStateDelta(
  refinementDelta: RefinementDeltaSummary | undefined,
): string[] {
  return refinementDelta?.stateDeltaSummary ?? []
}

export function getRefinementRerunSkippedReason(
  refinementIntent: ConversationState['refinementIntent'],
  referenceResult: RecommendationReferenceResult | undefined,
  effectiveMode: GptContext['mode'],
): RefinementContext['rerunSkippedReason'] | undefined {
  if (!refinementIntent) return undefined
  if (referenceResult?.status === 'ambiguous') return 'ambiguous_reference'
  if (referenceResult?.status === 'not_found') return 'reference_not_found'
  if (effectiveMode !== 'recommend') return 'not_recommend_mode'
  return undefined
}

export function buildRefinementContext(
  state: ConversationState,
  recommendationReferenceResult: RecommendationReferenceResult | undefined,
  refinementDelta: RefinementDeltaSummary | undefined,
  effectiveMode: GptContext['mode'],
  backendSelectedRecommendations: BackendSelectedRecommendation[] | undefined,
  evaluationResult: CamperEvaluationResult | undefined,
): RefinementContext | undefined {
  if (!state.refinementIntent) return undefined
  const rerunTriggered = effectiveMode === 'recommend' && !!evaluationResult && !getRefinementRerunSkippedReason(
    state.refinementIntent,
    recommendationReferenceResult,
    effectiveMode,
  )
  return {
    refinementIntent: state.refinementIntent,
    sourceText: state.refinementIntent.sourceText,
    referencedTarget: summarizeReferencedRecommendationTarget(recommendationReferenceResult),
    referenceResolution: summarizeRecommendationReferenceResolution(recommendationReferenceResult),
    compatibility: summarizeRecommendationCompatibility(recommendationReferenceResult),
    stateDeltaSummary: summarizeRefinementStateDelta(refinementDelta),
    rerunTriggered,
    rerunSkippedReason: rerunTriggered
      ? undefined
      : getRefinementRerunSkippedReason(state.refinementIntent, recommendationReferenceResult, effectiveMode),
    newBackendSelectedRecommendations: (backendSelectedRecommendations ?? []).map(item => item.slug),
  }
}
