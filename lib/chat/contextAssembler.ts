import { ConversationState, FlowState, SessionMemory } from './state'
import { CamperResult } from './availability'
import { BackendSelectedRecommendation, NoResultReasonSummary } from './evaluationContext'
import { RecommendationReferenceResult } from './recommendationReference'
import { RecommendationReferenceExplanation } from './recommendationReferenceExplainability'
import { CatalogEntry } from './catalog'
import { ExtraItem } from './extras'
import { FaqItem } from './faq'
import { EvaluationStatus, GptContext, RefinementContext, SearchType } from './prompts'
import { buildExplainabilityPresentationBundle } from './explainabilityPresentation'

export interface AssembleGptContextInput {
  state: ConversationState
  flowState: FlowState
  sessionMemory: SessionMemory
  nextQuestion: string | null
  camperResults: CamperResult[]
  allowedCamperSlugs: string[]
  mode: GptContext['mode']
  effectiveMode: GptContext['mode']
  searchType?: SearchType
  requestedMonth?: string
  isSpecificCamperQuery?: boolean
  specificCamperSlug?: string | null
  enginePrimaryRecommendations?: boolean
  refinementNote?: string
  offerExtras?: boolean
  extrasItems?: ExtraItem[]
  catalogSummary?: CatalogEntry[]
  faqItems?: FaqItem[]
  justSkippedField?: string
  shouldSummarize?: boolean
  branchSummaries?: GptContext['branchSummaries']
  evaluationStatus?: EvaluationStatus
  backendSelectedRecommendations?: BackendSelectedRecommendation[]
  noResultReasonSummary?: NoResultReasonSummary
  recommendationReferenceResult?: RecommendationReferenceResult
  recommendationReferenceExplanation?: RecommendationReferenceExplanation
  refinementContext?: RefinementContext
}

export function assembleGptContext(input: AssembleGptContextInput): GptContext {
  return {
    state: input.state,
    flowState: input.flowState,
    sessionMemory: input.sessionMemory,
    nextQuestion: input.effectiveMode === 'faq' ? null : input.nextQuestion,
    camperResults: input.enginePrimaryRecommendations ? [] : input.camperResults,
    allowedCamperSlugs: input.allowedCamperSlugs,
    mode: input.effectiveMode,
    searchType: input.searchType,
    requestedMonth: input.requestedMonth,
    specificCamperSlug: input.isSpecificCamperQuery ? input.specificCamperSlug ?? undefined : undefined,
    refinementNote: input.refinementNote,
    offerExtras: input.offerExtras,
    extrasItems: input.extrasItems,
    catalogSummary: input.catalogSummary,
    faqItems: input.faqItems,
    skipNote: input.justSkippedField
      ? `A user nem tudott/akart válaszolni a "${input.justSkippedField}" kérdésre — fogadd el természetesen, ne kérdezd újra.`
      : undefined,
    positiveAcknowledgement: input.state.positiveAcknowledgement,
    shouldSummarize: input.shouldSummarize,
    branchSummaries: input.branchSummaries,
    evaluationStatus: input.evaluationStatus,
    backendSelectedRecommendations: input.backendSelectedRecommendations,
    noResultReasonSummary: input.noResultReasonSummary,
    recommendationReferenceResult: input.recommendationReferenceResult,
    recommendationReferenceExplanation: input.recommendationReferenceExplanation,
    refinementContext: input.refinementContext,
    explainabilityPresentation: buildExplainabilityPresentationBundle({
      backendSelectedRecommendations: input.backendSelectedRecommendations,
      noResultReasonSummary: input.noResultReasonSummary,
      recommendationReferenceExplanation: input.recommendationReferenceExplanation,
      refinementContext: input.refinementContext,
    }),
  }
}
