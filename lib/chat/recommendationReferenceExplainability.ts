import type {
  RecommendationReferenceResult,
  RecommendationReferenceTarget,
} from './recommendationReference'

export type RecommendationReferenceCommunicationAction =
  | 'confirm_resolved_reference'
  | 'ask_clarification'
  | 'say_not_found'

export interface RecommendationReferenceTargetSummary {
  optionId?: string
  camperSlug?: string
  camperName?: string
  shownIndex?: number
}

export interface RecommendationReferenceExplanation {
  status: RecommendationReferenceResult['status']
  target?: RecommendationReferenceTargetSummary
  candidates?: RecommendationReferenceTargetSummary[]
  compatibility?: {
    status: string
    reasons: string[]
  }
  reasons: string[]
  communicationAction: RecommendationReferenceCommunicationAction
  safeForGpt: boolean
}

function summarizeTarget(
  target: RecommendationReferenceTarget | undefined,
): RecommendationReferenceTargetSummary | undefined {
  if (!target) return undefined
  const indexedTarget = target as RecommendationReferenceTarget & {
    index?: number
    shownIndex?: number
  }
  return {
    optionId: target.optionId,
    camperSlug: target.camperSlug,
    camperName: target.camperName,
    shownIndex: indexedTarget.shownIndex ?? indexedTarget.index,
  }
}

function communicationAction(
  status: RecommendationReferenceResult['status'],
): RecommendationReferenceCommunicationAction {
  if (status === 'resolved') return 'confirm_resolved_reference'
  if (status === 'ambiguous') return 'ask_clarification'
  return 'say_not_found'
}

export function explainRecommendationReferenceResult(
  result: RecommendationReferenceResult,
): RecommendationReferenceExplanation {
  return {
    status: result.status,
    target: result.status === 'resolved' ? summarizeTarget(result.target) : undefined,
    candidates: result.status === 'ambiguous'
      ? result.candidates?.map(summarizeTarget).filter((item): item is RecommendationReferenceTargetSummary => !!item)
      : undefined,
    compatibility: result.compatibility
      ? {
          status: result.compatibility.status,
          reasons: [...result.compatibility.reasons],
        }
      : undefined,
    reasons: [...result.reasons],
    communicationAction: communicationAction(result.status),
    safeForGpt: true,
  }
}
