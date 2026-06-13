import type {
  CamperEvaluation,
  CamperEvaluationResult,
  HardFailure,
  HardFailureKey,
  ScoreBreakdownItem,
} from './evaluation'
import { HARD_FAILURE_LABELS } from './evaluationPolicy'

export type EvaluationExplanationSource = 'evaluation_engine'

export interface EvaluationHardFailureExplanation {
  key: HardFailureKey
  label: string
  capabilityKey?: string
  attributeKey?: string
  operator?: string
  expectedValue?: string | number | boolean
  actualValue?: string | number | boolean | null
  budgetAmount?: number
  actualPrice?: number | null
  score?: number
  threshold?: number
  matchedWeight?: number
  totalWeight?: number
  missingFeatures?: string[]
}

export interface EvaluationScoreExplanation {
  key: string
  label: string
  points: number
  capabilityKey?: string
  attributeKey?: string
  operator?: string
  expectedValue?: string | number | boolean
  actualValue?: string | number | boolean | null
  budgetAmount?: number
  actualPrice?: number | null
  score?: number
  matchedWeight?: number
  totalWeight?: number
}

export interface EvaluationPricingExplanation {
  status: CamperEvaluation['pricing']['status']
  seasonName?: string
  pricePerDay?: number
  durationDays?: number
  subtotal?: number
  discountPercent?: number
  discountAmount?: number
  total?: number
}

export interface EvaluationCapabilityExplanationSummary {
  capabilityKey: string
  strength: 'hard' | 'soft'
  score: number
  matchedWeight: number
  totalWeight: number
  passedThreshold?: boolean
  matchedFeatureCount: number
  missingFeatureCount: number
}

export interface CamperEvaluationExplanation {
  source: EvaluationExplanationSource
  camperSlug: string
  camperName: string
  status: CamperEvaluation['status']
  eligible: boolean
  score: number | null
  hardFailures: EvaluationHardFailureExplanation[]
  scoreReasons: EvaluationScoreExplanation[]
  pricing: EvaluationPricingExplanation
  capabilitySummary: EvaluationCapabilityExplanationSummary[]
}

export interface EvaluationNoResultDiagnostics {
  source: EvaluationExplanationSource
  totalEvaluated: number
  eligibleCount: number
  failCounts: Record<HardFailureKey, number>
  dominantFailureKeys: HardFailureKey[]
}

function explainHardFailure(failure: HardFailure): EvaluationHardFailureExplanation {
  return {
    key: failure.key,
    label: failure.label || HARD_FAILURE_LABELS[failure.key],
    capabilityKey: failure.capabilityKey,
    attributeKey: failure.attributeKey,
    operator: failure.operator,
    expectedValue: failure.expectedValue,
    actualValue: failure.actualValue,
    budgetAmount: failure.budgetAmount,
    actualPrice: failure.actualPrice,
    score: failure.score,
    threshold: failure.threshold,
    matchedWeight: failure.matchedWeight,
    totalWeight: failure.totalWeight,
    missingFeatures: failure.missingFeatures,
  }
}

function explainScoreItem(item: ScoreBreakdownItem): EvaluationScoreExplanation {
  return {
    key: item.key,
    label: item.label,
    points: item.points,
    capabilityKey: item.capabilityKey,
    attributeKey: item.attributeKey,
    operator: item.operator,
    expectedValue: item.expectedValue,
    actualValue: item.actualValue,
    budgetAmount: item.budgetAmount,
    actualPrice: item.actualPrice,
    score: item.score,
    matchedWeight: item.matchedWeight,
    totalWeight: item.totalWeight,
  }
}

export function explainCamperEvaluation(
  evaluation: CamperEvaluation,
): CamperEvaluationExplanation {
  return {
    source: 'evaluation_engine',
    camperSlug: evaluation.camperSlug,
    camperName: evaluation.camperName,
    status: evaluation.status,
    eligible: evaluation.status === 'eligible',
    score: evaluation.score,
    hardFailures: evaluation.hardFailures.map(explainHardFailure),
    scoreReasons: evaluation.scoreBreakdown.map(explainScoreItem),
    pricing: {
      status: evaluation.pricing.status,
      seasonName: evaluation.pricing.seasonName,
      pricePerDay: evaluation.pricing.pricePerDay,
      durationDays: evaluation.pricing.durationDays,
      subtotal: evaluation.pricing.subtotal,
      discountPercent: evaluation.pricing.discountPercent,
      discountAmount: evaluation.pricing.discountAmount,
      total: evaluation.pricing.total,
    },
    capabilitySummary: evaluation.capabilityMatches.map(match => ({
      capabilityKey: match.capabilityKey,
      strength: match.strength,
      score: match.score,
      matchedWeight: match.matchedWeight,
      totalWeight: match.totalWeight,
      passedThreshold: match.passedThreshold,
      matchedFeatureCount: match.matchedFeatures.length,
      missingFeatureCount: match.missingFeatures.length,
    })),
  }
}

export function buildEvaluationNoResultDiagnostics(
  result: CamperEvaluationResult,
): EvaluationNoResultDiagnostics {
  const failCounts: Record<HardFailureKey, number> = {
    capacity: 0,
    availability: 0,
    duration_availability: 0,
    feature_requirement: 0,
    attribute_requirement: 0,
    pricing_budget: 0,
    capability_requirement: 0,
  }

  for (const evaluation of result.evaluations) {
    for (const failure of evaluation.hardFailures) {
      failCounts[failure.key] += 1
    }
  }

  const highestCount = Math.max(0, ...Object.values(failCounts))
  const dominantFailureKeys = highestCount > 0
    ? (Object.entries(failCounts)
        .filter(([, count]) => count === highestCount)
        .map(([key]) => key) as HardFailureKey[])
    : []

  return {
    source: 'evaluation_engine',
    totalEvaluated: result.evaluations.length,
    eligibleCount: result.evaluations.filter(evaluation => evaluation.status === 'eligible').length,
    failCounts,
    dominantFailureKeys,
  }
}
