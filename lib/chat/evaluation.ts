import type { CapabilityMatchResult } from './capabilities'
import {
  createCapabilityExplanations,
  createCapabilityFeatureExplanations,
  createFeatureExplanations,
  type CapabilityExplanation,
  type CapabilityFeatureExplanation,
  type FeatureExplanation,
} from './featureExplainability'
import {
  loadEvaluationFacts,
  type CamperFact,
  type EvaluationFacts,
} from './evaluationFacts'
import {
  evaluateAvailability,
  summarizeAvailability,
} from './evaluationAvailability'
import {
  buildDiscountOpportunity,
  calculatePricing,
  evaluatePricingPreferenceRequirement,
  type DiscountOpportunity,
  type EvaluationPricing,
} from './pricingEvaluation'
import {
  HARD_CAPABILITY_THRESHOLD,
  MAX_EVALUATION_BRANCHES,
} from './evaluationPolicy'
import {
  evaluateCapabilityPreferences,
  evaluateHardRequirements,
} from './hardRequirements'
import { scoreCamper } from './evaluationScoring'
import type {
  CampingType,
  ConversationState,
  RecommendationAttributeFacts,
  RecommendationAvailabilitySummary,
} from './state'

export { HARD_CAPABILITY_THRESHOLD } from './evaluationPolicy'

export type EvaluationStatus = 'eligible' | 'currently_not_eligible'
export type HardFailureKey =
  | 'capacity'
  | 'availability'
  | 'duration_availability'
  | 'feature_requirement'
  | 'attribute_requirement'
  | 'pricing_budget'
  | 'capability_requirement'
export type { DiscountOpportunity, EvaluationPricing, PricingStatus } from './pricingEvaluation'

export interface HardFailure {
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

export interface ScoreBreakdownItem {
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

export interface CapabilityEvaluationMatch extends CapabilityMatchResult {
  strength: 'hard' | 'soft'
  passedThreshold?: boolean
}

export interface CamperEvaluation {
  camperId: string
  camperSlug: string
  camperName: string
  status: EvaluationStatus
  score: number | null
  hardFailures: HardFailure[]
  scoreBreakdown: ScoreBreakdownItem[]
  capabilityMatches: CapabilityEvaluationMatch[]
  capabilityExplanations: CapabilityExplanation[]
  featureExplanations: FeatureExplanation[]
  capabilityFeatureExplanations: CapabilityFeatureExplanation[]
  pricing: EvaluationPricing
  discountOpportunity?: DiscountOpportunity
  availableSlots: { from: string; to: string; days: number }[]
  featureKeys: string[]
  attributeFacts: RecommendationAttributeFacts
  availabilitySummary?: RecommendationAvailabilitySummary
  imageUrl: string
  type: string | null
  beds: number | null
}

export interface EvaluationBranch {
  id: string
  label: string
  state: ConversationState
  evaluations: CamperEvaluation[]
  topRecommendations: CamperEvaluation[]
}

export interface CamperEvaluationResult {
  evaluations: CamperEvaluation[]
  topRecommendations: CamperEvaluation[]
  branchSummary: {
    id: string
    label: string
    eligibleCount: number
    topCandidateSlug?: string
    topCandidateName?: string
  }[]
  branches: EvaluationBranch[]
  pricingSummary: {
    pricedCount: number
    missingPriceCount: number
  }
  discountOpportunities: Array<DiscountOpportunity & { camperSlug: string; camperName: string }>
  explanationContext: {
    hardConstraintKeys: HardFailureKey[]
    softScoringKeys: string[]
  }
  nextQuestionSuggestion?: {
    field: 'month' | 'durationDays' | 'passengers' | 'campingType'
    reason: string
  }
}

function evaluateCamper(facts: EvaluationFacts, camper: CamperFact, state: ConversationState): CamperEvaluation {
  const capabilityMatches = evaluateCapabilityPreferences(camper, state)
  const featureExplanations = createFeatureExplanations({
    state,
    camperFeatureKeys: camper.featureKeys,
    camperSlug: camper.slug,
    camperName: camper.name,
    featureDisplayNames: facts.featureDisplayNames,
  })
  const capabilityFeatureExplanations = createCapabilityFeatureExplanations({
    capabilityMatches,
    camperSlug: camper.slug,
    camperName: camper.name,
    featureDisplayNames: facts.featureDisplayNames,
  })
  const capabilityExplanations = createCapabilityExplanations({
    capabilityMatches,
    capabilityFeatureExplanations,
    camperSlug: camper.slug,
    camperName: camper.name,
    threshold: HARD_CAPABILITY_THRESHOLD,
  })
  const hardFailures = evaluateHardRequirements(camper, state, capabilityMatches)

  const availability = evaluateAvailability(camper, facts.bookingsByCamperId[camper.id] ?? [], state)
  if (availability.failure) hardFailures.push(availability.failure)

  const pricing = calculatePricing(facts, camper, state)
  hardFailures.push(...evaluatePricingPreferenceRequirement(pricing, state))
  const scoreBreakdown = hardFailures.length === 0 ? scoreCamper(camper, state, pricing, capabilityMatches) : []
  const score = hardFailures.length === 0
    ? scoreBreakdown.reduce((sum, item) => sum + item.points, 0)
    : null

  return {
    camperId: camper.id,
    camperSlug: camper.slug,
    camperName: camper.name,
    status: hardFailures.length > 0 ? 'currently_not_eligible' : 'eligible',
    score,
    hardFailures,
    scoreBreakdown,
    capabilityMatches,
    capabilityExplanations,
    featureExplanations,
    capabilityFeatureExplanations,
    pricing,
    discountOpportunity: hardFailures.length === 0
      ? buildDiscountOpportunity(facts, camper, state, availability.slots)
      : undefined,
    availableSlots: availability.slots,
    featureKeys: [...camper.featureKeys].sort(),
    attributeFacts: {
      beds: camper.beds,
      type: camper.type,
      gearbox: camper.gearbox,
      fuel_type: camper.fuelType,
      year: camper.year,
    },
    availabilitySummary: summarizeAvailability(availability.slots),
    imageUrl: camper.imageUrl,
    type: camper.type,
    beds: camper.beds,
  }
}

function uniqueNumbers(values: Array<number | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && value > 0))]
}

function createBranches(state: ConversationState): Array<{ id: string; label: string; state: ConversationState }> {
  const flexible = state.flexibleCriteria
  if (!flexible) return [{ id: 'default', label: 'aktuális feltételek', state }]

  const preferredStartWindows = !state.startDate
    ? (flexible.preferredStartWindows ?? []).filter(window => window.startDate <= window.endDate)
    : []
  const months = !state.startDate && !state.month && preferredStartWindows.length === 0 ? [...new Set(flexible.months ?? [])] : []
  const durations = !state.durationDays
    ? uniqueNumbers([
        flexible.durationDays?.preferred,
        flexible.durationDays?.min,
        flexible.durationDays?.max,
        ...(flexible.durationDays?.alternatives ?? []),
      ])
    : []
  const passengerMax = !state.passengers
    ? flexible.passengers?.max ?? (flexible.passengers?.alternatives?.length ? Math.max(...flexible.passengers.alternatives) : undefined)
    : undefined
  const campingTypes = !state.campingType
    ? [...new Set(flexible.campingTypes ?? [])].filter(value => value !== 'wild') as CampingType[]
    : []

  const dimensions = [
    preferredStartWindows.length > 1 ? preferredStartWindows.map(value => ({ kind: 'preferredStartWindow' as const, value })) : [null],
    months.length > 1 ? months.map(value => ({ kind: 'month' as const, value })) : [null],
    durations.length > 1 ? durations.map(value => ({ kind: 'duration' as const, value })) : [null],
    campingTypes.length > 1 ? campingTypes.map(value => ({ kind: 'campingType' as const, value })) : [null],
  ]
  const count = dimensions.reduce((total, values) => total * values.length, 1)
  if (count > MAX_EVALUATION_BRANCHES) return [{ id: 'default', label: 'aktuális feltételek', state }]
  if (count <= 1 && !passengerMax) return [{ id: 'default', label: 'aktuális feltételek', state }]

  const branches: Array<{ id: string; label: string; state: ConversationState }> = []
  for (const preferredStartWindow of dimensions[0]) {
    for (const month of dimensions[1]) {
      for (const duration of dimensions[2]) {
        for (const campingType of dimensions[3]) {
        const branchState: ConversationState = { ...state }
        const labels: string[] = []
        if (preferredStartWindow?.kind === 'preferredStartWindow') {
          branchState.flexibleCriteria = {
            ...(branchState.flexibleCriteria ?? {}),
            preferredStartWindows: [preferredStartWindow.value],
            months: undefined,
          }
          branchState.month = undefined
          branchState.startDate = undefined
          branchState.endDate = undefined
          labels.push(preferredStartWindow.value.label ?? `${preferredStartWindow.value.startDate} - ${preferredStartWindow.value.endDate}`)
        }
        if (month?.kind === 'month') {
          branchState.month = month.value
          branchState.startDate = undefined
          branchState.endDate = undefined
          labels.push(month.value)
        }
        if (duration?.kind === 'duration') {
          branchState.durationDays = duration.value
          labels.push(`${duration.value} nap`)
        }
        if (passengerMax) {
          branchState.passengers = passengerMax
          labels.push(`${passengerMax} főig`)
        }
        if (campingType?.kind === 'campingType') {
          branchState.campingType = campingType.value
          labels.push('kempinghely')
        }
        branches.push({
          id: `branch_${branches.length + 1}`,
          label: labels.join(' + ') || 'aktuális feltételek',
          state: branchState,
        })
      }
    }
  }
  }
  return branches.slice(0, MAX_EVALUATION_BRANCHES)
}

function comparablePrice(evaluation: CamperEvaluation): number {
  return evaluation.pricing.total ?? evaluation.pricing.pricePerDay ?? Infinity
}

function valueRatio(evaluation: CamperEvaluation): number {
  const price = comparablePrice(evaluation)
  if (!Number.isFinite(price) || price <= 0) return 0
  return (evaluation.score ?? 0) / price
}

function topEligible(evaluations: CamperEvaluation[], state?: ConversationState): CamperEvaluation[] {
  const intent = state?.pricingPreference?.intent
  return evaluations
    .filter(evaluation => evaluation.status === 'eligible')
    .sort((a, b) => {
      if (intent === 'cheaper') {
        return comparablePrice(a) - comparablePrice(b) || (b.score ?? 0) - (a.score ?? 0)
      }
      if (intent === 'best_value') {
        return valueRatio(b) - valueRatio(a) || (b.score ?? 0) - (a.score ?? 0) || comparablePrice(a) - comparablePrice(b)
      }
      return (b.score ?? 0) - (a.score ?? 0) || comparablePrice(a) - comparablePrice(b)
    })
    .slice(0, 3)
}

export async function evaluateCampers(state: ConversationState): Promise<CamperEvaluationResult> {
  const branches = createBranches(state)
  const facts = await loadEvaluationFacts(branches.map(branch => branch.state))
  const evaluatedBranches: EvaluationBranch[] = branches.map(branch => {
    const evaluations = facts.campers.map(camper => evaluateCamper(facts, camper, branch.state))
    return {
      ...branch,
      evaluations,
      topRecommendations: topEligible(evaluations, branch.state),
    }
  })
  const evaluations = evaluatedBranches.flatMap(branch => branch.evaluations)
  const topRecommendations = topEligible(evaluations, state)
  const discountOpportunities = evaluations
    .filter(evaluation => evaluation.discountOpportunity)
    .map(evaluation => ({
      ...evaluation.discountOpportunity!,
      camperSlug: evaluation.camperSlug,
      camperName: evaluation.camperName,
    }))

  return {
    evaluations,
    topRecommendations,
    branches: evaluatedBranches,
    branchSummary: evaluatedBranches.map(branch => ({
      id: branch.id,
      label: branch.label,
      eligibleCount: branch.evaluations.filter(evaluation => evaluation.status === 'eligible').length,
      topCandidateSlug: branch.topRecommendations[0]?.camperSlug,
      topCandidateName: branch.topRecommendations[0]?.camperName,
    })),
    pricingSummary: {
      pricedCount: evaluations.filter(evaluation => evaluation.pricing.status === 'priced').length,
      missingPriceCount: evaluations.filter(evaluation => evaluation.pricing.status === 'missing_price').length,
    },
    discountOpportunities,
    explanationContext: {
      hardConstraintKeys: [...new Set(evaluations.flatMap(evaluation => evaluation.hardFailures.map(failure => failure.key)))],
      softScoringKeys: [...new Set(evaluations.flatMap(evaluation => evaluation.scoreBreakdown.map(item => item.key)))],
    },
    nextQuestionSuggestion: branches.length === 1 && state.flexibleCriteria?.months && state.flexibleCriteria.months.length > MAX_EVALUATION_BRANCHES
      ? { field: 'month', reason: 'Túl sok időszak-alternatíva lenne egyszerre.' }
      : undefined,
  }
}
