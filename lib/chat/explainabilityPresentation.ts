import type { BackendSelectedRecommendation, NoResultReasonSummary } from './evaluationContext'
import type { RefinementContext } from './prompts'
import type { RecommendationReferenceExplanation } from './recommendationReferenceExplainability'

export type ExplainabilitySource =
  | 'evaluation_engine'
  | 'evaluation_context'
  | 'feature_explainability'
  | 'capability_explainability'
  | 'memory'
  | 'reference_resolver'
  | 'refinement_pipeline'

export type ExplainabilityAudience = 'gpt_context' | 'ui' | 'debug'

export type ExplainabilityItemKind =
  | 'recommendation_reason'
  | 'hard_failure'
  | 'no_result_reason'
  | 'feature_match'
  | 'feature_missing'
  | 'capability_match'
  | 'capability_missing'
  | 'reference_resolution'
  | 'refinement_rerun'
  | 'refinement_skipped'

export interface ExplainabilityItem {
  kind: ExplainabilityItemKind
  source: ExplainabilitySource
  safeForGpt: boolean
  audience: ExplainabilityAudience[]
  message: string
  evidence?: Record<string, unknown>
}

export interface RecommendationExplanationSummary {
  slug: string
  name: string
  score: number | null
  items: ExplainabilityItem[]
}

export interface NoResultExplanationSummary {
  items: ExplainabilityItem[]
  failCounts: {
    capacity: number
    availability: number
    duration: number
    wildCamping: number
    featureRequirement: number
    attributeRequirement: number
    pricingBudget: number
    capabilityRequirement: number
  }
}

export interface ExplainabilityPresentationBundle {
  schemaVersion: 1
  recommendations: RecommendationExplanationSummary[]
  noResult?: NoResultExplanationSummary
  reference?: ExplainabilityItem
  refinement?: ExplainabilityItem
  invariants: {
    recommendationTruthSource: 'evaluation_engine'
    gptMayChooseCamper: false
    memoryMayChooseCamper: false
  }
}

function item(input: Omit<ExplainabilityItem, 'safeForGpt' | 'audience'> & {
  safeForGpt?: boolean
  audience?: ExplainabilityAudience[]
}): ExplainabilityItem {
  return {
    safeForGpt: input.safeForGpt ?? true,
    audience: input.audience ?? ['gpt_context', 'ui', 'debug'],
    ...input,
  }
}

export function buildRecommendationExplanationSummary(
  recommendation: BackendSelectedRecommendation,
): RecommendationExplanationSummary {
  const items: ExplainabilityItem[] = []

  for (const score of recommendation.scoreBreakdown ?? []) {
    items.push(item({
      kind: 'recommendation_reason',
      source: 'evaluation_engine',
      message: score.label,
      evidence: {
        key: score.key,
        points: score.points,
        capabilityKey: score.capabilityKey,
        attributeKey: score.attributeKey,
        budgetAmount: score.budgetAmount,
        actualPrice: score.actualPrice,
      },
    }))
  }

  const featureExplainability = recommendation.featureExplainability
  for (const feature of featureExplainability?.featureExplanations ?? []) {
    if (feature.kind === 'soft_preference_matched' || feature.kind === 'hard_requirement_met') {
      items.push(item({
        kind: 'feature_match',
        source: 'feature_explainability',
        message: `${feature.displayName}: teljesül`,
        evidence: {
          featureKey: feature.featureKey,
          strength: feature.strength,
          sourceText: feature.sourceText,
          points: feature.points,
        },
      }))
    }
    if (feature.kind === 'hard_requirement_missing') {
      items.push(item({
        kind: 'feature_missing',
        source: 'feature_explainability',
        message: `${feature.displayName}: hiányzik`,
        evidence: {
          featureKey: feature.featureKey,
          strength: feature.strength,
          sourceText: feature.sourceText,
        },
      }))
    }
  }

  for (const capability of featureExplainability?.capabilityExplanations ?? []) {
    items.push(item({
      kind: capability.explanationType === 'hard_fail' ? 'capability_missing' : 'capability_match',
      source: 'capability_explainability',
      message: `${capability.capabilityDisplayName}: ${Math.round(capability.score * 100)}% megfelelés`,
      evidence: {
        capabilityKey: capability.capabilityKey,
        strength: capability.strength,
        score: capability.score,
        threshold: capability.threshold,
        matchedWeight: capability.matchedWeight,
        totalWeight: capability.totalWeight,
        matchedFeatureCount: capability.matchedFeatures.length,
        missingFeatureCount: capability.missingFeatures.length,
      },
    }))
  }

  if (recommendation.pricing.status === 'priced') {
    items.push(item({
      kind: 'recommendation_reason',
      source: 'evaluation_context',
      message: 'Van számolható ár ehhez az ajánláshoz',
      evidence: {
        pricePerDay: recommendation.pricing.pricePerDay,
        total: recommendation.pricing.total,
        discountPercent: recommendation.pricing.discountPercent,
      },
    }))
  }

  return {
    slug: recommendation.slug,
    name: recommendation.name,
    score: recommendation.score,
    items,
  }
}

export function buildNoResultExplanationSummary(
  summary: NoResultReasonSummary,
): NoResultExplanationSummary {
  const items: ExplainabilityItem[] = []
  const failCounts = {
    capacity: summary.capacityFailCount,
    availability: summary.availabilityFailCount,
    duration: summary.durationFailCount,
    wildCamping: summary.wildCampingFailCount,
    featureRequirement: summary.featureRequirementFailCount,
    attributeRequirement: summary.attributeRequirementFailCount,
    pricingBudget: summary.pricingBudgetFailCount,
    capabilityRequirement: summary.capabilityRequirementFailCount,
  }

  if (summary.capacityFailCount > 0) {
    items.push(item({
      kind: 'no_result_reason',
      source: 'evaluation_context',
      message: 'Több camper kapacitás miatt kiesett',
      evidence: { count: summary.capacityFailCount },
    }))
  }
  if (summary.availabilityFailCount > 0 || summary.durationFailCount > 0) {
    items.push(item({
      kind: 'no_result_reason',
      source: 'evaluation_context',
      message: 'Elérhetőségi feltétel miatt nincs elég találat',
      evidence: {
        availabilityFailCount: summary.availabilityFailCount,
        durationFailCount: summary.durationFailCount,
      },
    }))
  }
  for (const feature of summary.featureNoResultExplanation?.mostRestrictiveFeatures ?? []) {
    items.push(item({
      kind: 'feature_missing',
      source: 'feature_explainability',
      message: `${feature.displayName}: kötelező feltételként több campert kizárt`,
      evidence: {
        featureKey: feature.featureKey,
        affectedCamperCount: feature.affectedCamperCount,
        sourceText: feature.sourceText,
      },
    }))
  }
  if (summary.attributeRequirementFailCount > 0) {
    items.push(item({
      kind: 'no_result_reason',
      source: 'evaluation_context',
      message: 'Kötelező járműattribútum miatt több camper kiesett',
      evidence: { count: summary.attributeRequirementFailCount },
    }))
  }
  if (summary.pricingBudgetFailCount > 0) {
    items.push(item({
      kind: 'no_result_reason',
      source: 'evaluation_context',
      message: 'A megadott árkeret miatt nincs elég találat',
      evidence: { count: summary.pricingBudgetFailCount },
    }))
  }
  for (const capability of summary.capabilityNoResultExplanation?.mostRestrictiveCapabilities ?? []) {
    items.push(item({
      kind: 'capability_missing',
      source: 'capability_explainability',
      message: `${capability.displayName}: több camper nem érte el a szükséges megfelelési szintet`,
      evidence: {
        capabilityKey: capability.capabilityKey,
        threshold: capability.threshold,
        affectedCamperCount: capability.affectedCamperCount,
        averageScore: capability.averageScore,
      },
    }))
  }

  return { items, failCounts }
}

export function buildReferenceExplanationItem(
  explanation: RecommendationReferenceExplanation | undefined,
): ExplainabilityItem | undefined {
  if (!explanation) return undefined
  return item({
    kind: 'reference_resolution',
    source: 'reference_resolver',
    message: explanation.status,
    evidence: {
      status: explanation.status,
      target: explanation.target,
      candidates: explanation.candidates,
      compatibility: explanation.compatibility,
      reasons: explanation.reasons,
      communicationAction: explanation.communicationAction,
    },
  })
}

export function buildRefinementExplanationItem(
  refinementContext: RefinementContext | undefined,
): ExplainabilityItem | undefined {
  if (!refinementContext) return undefined
  return item({
    kind: refinementContext.rerunTriggered ? 'refinement_rerun' : 'refinement_skipped',
    source: 'refinement_pipeline',
    message: refinementContext.rerunTriggered
      ? 'A refinement alapján új Evaluation Engine futás történt'
      : 'A refinement alapján nem futott új Evaluation Engine értékelés',
    evidence: {
      refinementIntent: refinementContext.refinementIntent,
      referencedTarget: refinementContext.referencedTarget,
      referenceResolution: refinementContext.referenceResolution,
      compatibility: refinementContext.compatibility,
      stateDeltaSummary: refinementContext.stateDeltaSummary,
      rerunTriggered: refinementContext.rerunTriggered,
      rerunSkippedReason: refinementContext.rerunSkippedReason,
      newBackendSelectedRecommendations: refinementContext.newBackendSelectedRecommendations,
    },
  })
}

export function buildExplainabilityPresentationBundle(input: {
  backendSelectedRecommendations?: BackendSelectedRecommendation[]
  noResultReasonSummary?: NoResultReasonSummary
  recommendationReferenceExplanation?: RecommendationReferenceExplanation
  refinementContext?: RefinementContext
}): ExplainabilityPresentationBundle {
  return {
    schemaVersion: 1,
    recommendations: (input.backendSelectedRecommendations ?? []).map(buildRecommendationExplanationSummary),
    noResult: input.noResultReasonSummary
      ? buildNoResultExplanationSummary(input.noResultReasonSummary)
      : undefined,
    reference: buildReferenceExplanationItem(input.recommendationReferenceExplanation),
    refinement: buildRefinementExplanationItem(input.refinementContext),
    invariants: {
      recommendationTruthSource: 'evaluation_engine',
      gptMayChooseCamper: false,
      memoryMayChooseCamper: false,
    },
  }
}
