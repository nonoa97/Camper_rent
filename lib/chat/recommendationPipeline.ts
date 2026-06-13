import type { CamperResult } from './availability'
import type { ConversationState } from './state'
import type { CamperEvaluationResult } from './evaluation'
import { evaluateCampers } from './evaluation'
import {
  buildBackendSelectedRecommendations,
  buildNoResultReasonSummary,
  selectedRecommendationsToCamperResults,
  type BackendSelectedRecommendation,
  type NoResultReasonSummary,
} from './evaluationContext'
import {
  applyLegacyRefinement,
  buildLegacyRefinementNote,
  legacyRefinementPreferenceFromUpdate,
} from './refinementPipeline'
import type { GptContext } from './prompts'
import type { EvaluationStatus } from './prompts'

export interface RecommendationEvaluationInput {
  effectiveMode: GptContext['mode']
  state: ConversationState
  refinementReferenceBlocked: boolean
  onError?: (error: unknown) => void
}

export interface RecommendationEvaluationResult {
  evaluationResult?: CamperEvaluationResult
  evaluationStatus?: EvaluationStatus
}

export async function runRecommendationEvaluation(
  input: RecommendationEvaluationInput,
): Promise<RecommendationEvaluationResult> {
  if (input.effectiveMode !== 'recommend' || input.refinementReferenceBlocked) {
    return {}
  }

  try {
    const evaluationResult = await evaluateCampers(input.state)
    return {
      evaluationResult,
      evaluationStatus: evaluationResult.topRecommendations.length > 0 ? 'success' : 'no_results',
    }
  } catch (error) {
    input.onError?.(error)
    return {
      evaluationStatus: 'failed_fallback_used',
    }
  }
}

export interface RecommendationProjectionInput {
  effectiveMode: GptContext['mode']
  state: ConversationState
  stateUpdate: Partial<ConversationState>
  evaluationResult?: CamperEvaluationResult
  camperResults: CamperResult[]
  stateDrivenRefinementNote?: string
}

export interface RecommendationProjectionResult {
  backendSelectedRecommendations?: BackendSelectedRecommendation[]
  noResultReasonSummary?: NoResultReasonSummary
  enginePrimaryRecommendations: boolean
  displayResults: CamperResult[]
  allowedSlugs: Set<string>
  refinementNote?: string
}

export function buildRecommendationProjection(
  input: RecommendationProjectionInput,
): RecommendationProjectionResult {
  const backendSelectedRecommendations = input.effectiveMode === 'recommend' && input.evaluationResult
    ? buildBackendSelectedRecommendations(input.evaluationResult, input.state.alreadyRecommendedSlugs ?? [], input.state)
    : undefined
  const noResultReasonSummary = input.effectiveMode === 'recommend' && input.evaluationResult
    ? buildNoResultReasonSummary(input.evaluationResult)
    : undefined
  const enginePrimaryRecommendations = input.effectiveMode === 'recommend' && !!input.evaluationResult
  const alreadyShown = new Set(input.state.alreadyRecommendedSlugs ?? [])
  let displayResults = input.camperResults
  let refinementNote = input.stateDrivenRefinementNote

  if (enginePrimaryRecommendations) {
    displayResults = selectedRecommendationsToCamperResults(backendSelectedRecommendations ?? [])
    if (displayResults.length === 0 && alreadyShown.size > 0) {
      refinementNote = 'NINCS TÖBB OPCIÓ: a jelenlegi feltételek mellett minden megfelelő lakóautót megmutattam már. Ajánlj feltételmódosítást.'
    }
  } else if (input.effectiveMode === 'recommend') {
    const freshResults = input.camperResults.filter(c => !alreadyShown.has(c.slug))
    const currentRefinement = legacyRefinementPreferenceFromUpdate(input.stateUpdate) ?? null

    if (freshResults.length === 0 && alreadyShown.size > 0 && !currentRefinement) {
      displayResults = []
      refinementNote = 'NINCS TÖBB OPCIÓ: a jelenlegi feltételek mellett minden megfelelő lakóautót megmutattam már. Ajánlj feltételmódosítást.'
    } else if (currentRefinement) {
      const { refined, boundaryReached } = applyLegacyRefinement(freshResults, currentRefinement, input.state.lastShownPrice)
      displayResults = refined
      refinementNote = buildLegacyRefinementNote(currentRefinement, {
        boundaryReached,
        lastPrice: input.state.lastShownPrice,
      })
    } else {
      displayResults = freshResults
    }
  }

  return {
    backendSelectedRecommendations,
    noResultReasonSummary,
    enginePrimaryRecommendations,
    displayResults,
    allowedSlugs: new Set(displayResults.map(c => c.slug)),
    refinementNote,
  }
}
