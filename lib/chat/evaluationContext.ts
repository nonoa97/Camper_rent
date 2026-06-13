import { CamperResult } from './availability'
import {
  CamperEvaluation,
  CamperEvaluationResult,
  DiscountOpportunity,
  EvaluationPricing,
  HardFailureKey,
  ScoreBreakdownItem,
} from './evaluation'
import {
  createRecommendationExplainability,
  resolveFeatureDisplayName,
  type CapabilityNoResultExplanation,
  type FeatureNoResultExplanation,
  type RecommendationExplainability,
} from './featureExplainability'
import type {
  ConversationState,
  RecommendationAttributeFacts,
  RecommendationAvailabilitySummary,
  RecommendationCapabilityMatchSummary,
} from './state'
import { positivePriceOrNull, positivePriceOrUndefined } from './priceUtils'

export interface BackendSelectedRecommendation {
  slug: string
  name: string
  scoreBreakdown: ScoreBreakdownItem[]
  hardFailures: []
  pricing: EvaluationPricing
  discountOpportunity?: DiscountOpportunity
  branchLabel?: string
  imageUrl: string
  score: number | null
  pricePerDay?: number
  type: string | null
  beds: number | null
  availableSlots: { from: string; to: string; days: number }[]
  featureKeys: string[]
  attributeFacts: RecommendationAttributeFacts
  capabilityMatches: RecommendationCapabilityMatchSummary[]
  availabilitySummary?: RecommendationAvailabilitySummary
  featureExplainability?: RecommendationExplainability
}

export interface NoResultReasonSummary {
  capacityFailCount: number
  availabilityFailCount: number
  durationFailCount: number
  wildCampingFailCount: number
  featureRequirementFailCount: number
  attributeRequirementFailCount: number
  pricingBudgetFailCount: number
  capabilityRequirementFailCount: number
  featureNoResultExplanation?: FeatureNoResultExplanation
  capabilityNoResultExplanation?: CapabilityNoResultExplanation
}

type NoResultReasonCountKey = Exclude<keyof NoResultReasonSummary, 'featureNoResultExplanation' | 'capabilityNoResultExplanation'>

const FAILURE_COUNT_KEYS: Record<HardFailureKey, NoResultReasonCountKey> = {
  capacity: 'capacityFailCount',
  availability: 'availabilityFailCount',
  duration_availability: 'durationFailCount',
  feature_requirement: 'featureRequirementFailCount',
  attribute_requirement: 'attributeRequirementFailCount',
  pricing_budget: 'pricingBudgetFailCount',
  capability_requirement: 'capabilityRequirementFailCount',
}

function branchLabelsFor(result: CamperEvaluationResult, evaluation: CamperEvaluation): string[] {
  return result.branches
    .filter(branch =>
      branch.topRecommendations.some(item => item.camperSlug === evaluation.camperSlug),
    )
    .map(branch => branch.label)
}

function toBackendSelectedRecommendation(
  result: CamperEvaluationResult,
  evaluation: CamperEvaluation,
): BackendSelectedRecommendation {
  const branchLabels = result.branches.length > 1 ? branchLabelsFor(result, evaluation) : []

  return {
    slug: evaluation.camperSlug,
    name: evaluation.camperName,
    scoreBreakdown: evaluation.scoreBreakdown,
    hardFailures: [],
    pricing: evaluation.pricing,
    discountOpportunity: evaluation.discountOpportunity,
    branchLabel: branchLabels.length > 0 ? branchLabels.join(', ') : undefined,
    imageUrl: evaluation.imageUrl,
    score: evaluation.score,
    pricePerDay: positivePriceOrUndefined(evaluation.pricing.pricePerDay),
    type: evaluation.type,
    beds: evaluation.beds,
    availableSlots: evaluation.availableSlots,
    featureKeys: evaluation.featureKeys ?? [],
    attributeFacts: evaluation.attributeFacts ?? {
      beds: evaluation.beds,
      type: evaluation.type,
    },
    capabilityMatches: (evaluation.capabilityMatches ?? []).map(match => ({
      capabilityKey: match.capabilityKey,
      strength: match.strength,
      score: match.score,
      matchedWeight: match.matchedWeight,
      totalWeight: match.totalWeight,
      matchedFeatures: match.matchedFeatures,
      missingFeatures: match.missingFeatures,
      passedThreshold: match.passedThreshold,
    })),
    availabilitySummary: evaluation.availabilitySummary,
    featureExplainability: createRecommendationExplainability({
      camperSlug: evaluation.camperSlug,
      camperName: evaluation.camperName,
      featureExplanations: evaluation.featureExplanations ?? [],
      capabilityExplanations: evaluation.capabilityExplanations ?? [],
      capabilityFeatureExplanations: evaluation.capabilityFeatureExplanations ?? [],
      scoreBreakdown: evaluation.scoreBreakdown ?? [],
    }),
  }
}

export function buildBackendSelectedRecommendations(
  result: CamperEvaluationResult | undefined,
  alreadyShownSlugs: string[] = [],
  state?: ConversationState,
): BackendSelectedRecommendation[] {
  if (!result) return []

  const alreadyShown = new Set(alreadyShownSlugs)
  const seen = new Set<string>()
  const referencePricePerDay = state?.pricingPreference?.intent === 'cheaper'
    ? state.pricingPreference.referencePricePerDay
    : undefined

  return result.topRecommendations
    .filter(evaluation => !alreadyShown.has(evaluation.camperSlug))
    .filter(evaluation => {
      if (typeof referencePricePerDay !== 'number' || !Number.isFinite(referencePricePerDay)) return true
      const pricePerDay = evaluation.pricing.pricePerDay
      return typeof pricePerDay === 'number' && pricePerDay < referencePricePerDay
    })
    .filter(evaluation => {
      if (seen.has(evaluation.camperSlug)) return false
      seen.add(evaluation.camperSlug)
      return true
    })
    .map(evaluation => toBackendSelectedRecommendation(result, evaluation))
}

export function buildNoResultReasonSummary(
  result: CamperEvaluationResult | undefined,
): NoResultReasonSummary | undefined {
  if (!result) return undefined

  const summary: NoResultReasonSummary = {
    capacityFailCount: 0,
    availabilityFailCount: 0,
    durationFailCount: 0,
    wildCampingFailCount: 0,
    featureRequirementFailCount: 0,
    attributeRequirementFailCount: 0,
    pricingBudgetFailCount: 0,
    capabilityRequirementFailCount: 0,
  }
  const missingHardFeatures = new Map<string, {
    featureKey: string
    displayName: string
    sourceText?: string
    camperSlugs: Set<string>
  }>()
  const failedCapabilities = new Map<string, {
    capabilityKey: string
    displayName: string
    threshold: number
    scores: number[]
    camperSlugs: Set<string>
    missingFeatures: Map<string, { featureKey: string; displayName: string; camperSlugs: Set<string> }>
  }>()

  result.evaluations.forEach(evaluation => {
    evaluation.hardFailures.forEach(failure => {
      summary[FAILURE_COUNT_KEYS[failure.key]] += 1
    })
    ;(evaluation.featureExplanations ?? [])
      .filter(explanation => explanation.kind === 'hard_requirement_missing')
      .forEach(explanation => {
        const key = `${explanation.featureKey}|${explanation.sourceText ?? ''}`
        const existing = missingHardFeatures.get(key) ?? {
          featureKey: explanation.featureKey,
          displayName: explanation.displayName,
          sourceText: explanation.sourceText,
          camperSlugs: new Set<string>(),
        }
        existing.camperSlugs.add(evaluation.camperSlug)
        missingHardFeatures.set(key, existing)
      })
    ;(evaluation.capabilityExplanations ?? [])
      .filter(explanation => explanation.explanationType === 'hard_fail')
      .forEach(explanation => {
        const existing = failedCapabilities.get(explanation.capabilityKey) ?? {
          capabilityKey: explanation.capabilityKey,
          displayName: explanation.capabilityDisplayName,
          threshold: explanation.threshold ?? 0,
          scores: [],
          camperSlugs: new Set<string>(),
          missingFeatures: new Map<string, { featureKey: string; displayName: string; camperSlugs: Set<string> }>(),
        }
        existing.scores.push(explanation.score)
        existing.camperSlugs.add(evaluation.camperSlug)
        for (const missingFeature of explanation.missingFeatures) {
          const feature = existing.missingFeatures.get(missingFeature.featureKey) ?? {
            featureKey: missingFeature.featureKey,
            displayName: missingFeature.displayName || resolveFeatureDisplayName(missingFeature.featureKey),
            camperSlugs: new Set<string>(),
          }
          feature.camperSlugs.add(evaluation.camperSlug)
          existing.missingFeatures.set(missingFeature.featureKey, feature)
        }
        failedCapabilities.set(explanation.capabilityKey, existing)
      })
  })

  const missingHardFeatureSummaries = [...missingHardFeatures.values()]
    .map(item => ({
      featureKey: item.featureKey,
      displayName: item.displayName,
      sourceText: item.sourceText,
      affectedCamperCount: item.camperSlugs.size,
    }))
    .sort((a, b) => b.affectedCamperCount - a.affectedCamperCount || a.featureKey.localeCompare(b.featureKey))

  summary.featureNoResultExplanation = {
    featureRequirementFailCount: summary.featureRequirementFailCount,
    missingHardFeatures: missingHardFeatureSummaries,
    mostRestrictiveFeatures: missingHardFeatureSummaries.slice(0, 3),
  }

  const capabilityFailureSummaries = [...failedCapabilities.values()]
    .map(item => ({
      capabilityKey: item.capabilityKey,
      displayName: item.displayName,
      threshold: item.threshold,
      affectedCamperCount: item.camperSlugs.size,
      averageScore: item.scores.length
        ? item.scores.reduce((sum, score) => sum + score, 0) / item.scores.length
        : 0,
      mostCommonMissingFeatures: [...item.missingFeatures.values()]
        .map(feature => ({
          featureKey: feature.featureKey,
          displayName: feature.displayName,
          affectedCamperCount: feature.camperSlugs.size,
        }))
        .sort((a, b) => b.affectedCamperCount - a.affectedCamperCount || a.featureKey.localeCompare(b.featureKey))
        .slice(0, 5),
    }))
    .sort((a, b) => b.affectedCamperCount - a.affectedCamperCount || a.capabilityKey.localeCompare(b.capabilityKey))

  summary.capabilityNoResultExplanation = {
    capabilityRequirementFailCount: summary.capabilityRequirementFailCount,
    failedCapabilities: capabilityFailureSummaries,
    mostRestrictiveCapabilities: capabilityFailureSummaries.slice(0, 3).map(item => ({
      capabilityKey: item.capabilityKey,
      displayName: item.displayName,
      threshold: item.threshold,
      affectedCamperCount: item.affectedCamperCount,
      averageScore: item.averageScore,
    })),
  }

  return summary
}

export function selectedRecommendationsToCamperResults(
  recommendations: BackendSelectedRecommendation[],
): CamperResult[] {
  return recommendations.map(recommendation => ({
    slug: recommendation.slug,
    name: recommendation.name,
    image_url: recommendation.imageUrl,
    price_per_day: positivePriceOrNull(recommendation.pricePerDay),
    type: recommendation.type,
    beds: recommendation.beds,
    availableSlots: recommendation.availableSlots,
  }))
}
