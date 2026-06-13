import {
  EVALUATION_SCORE_POLICY,
  MAX_SOFT_CAPABILITY_POINTS,
} from './evaluationPolicy'
import { scoreAttributePreferences } from './attributeEvaluation'
import type { CamperFact } from './evaluationFacts'
import type { CapabilityEvaluationMatch, ScoreBreakdownItem } from './evaluation'
import { scorePricingPreference, type EvaluationPricing } from './pricingEvaluation'
import type { ConversationState } from './state'

export function scoreCapabilityMatches(capabilityMatches: CapabilityEvaluationMatch[]): ScoreBreakdownItem[] {
  return capabilityMatches
    .filter(match => match.strength === 'soft' && match.score > 0)
    .map(match => ({
      key: 'capability_match',
      label: EVALUATION_SCORE_POLICY.capabilityMatch.label,
      points: Math.round(match.score * MAX_SOFT_CAPABILITY_POINTS),
      capabilityKey: match.capabilityKey,
      score: match.score,
      matchedWeight: match.matchedWeight,
      totalWeight: match.totalWeight,
    }))
}

export function scoreCamper(
  camper: CamperFact,
  state: ConversationState,
  pricing: EvaluationPricing,
  capabilityMatches: CapabilityEvaluationMatch[],
): ScoreBreakdownItem[] {
  const breakdown: ScoreBreakdownItem[] = []
  if (state.passengers && camper.beds != null && camper.beds >= state.passengers) {
    breakdown.push({
      key: EVALUATION_SCORE_POLICY.capacity.key,
      label: EVALUATION_SCORE_POLICY.capacity.label,
      points: EVALUATION_SCORE_POLICY.capacity.points,
    })
  }
  if (pricing.status === 'priced') {
    breakdown.push({
      key: EVALUATION_SCORE_POLICY.priceAvailable.key,
      label: EVALUATION_SCORE_POLICY.priceAvailable.label,
      points: EVALUATION_SCORE_POLICY.priceAvailable.points,
    })
  }
  const softFeaturePreferences = state.featurePreferences?.filter(preference => preference.strength === 'soft') ?? []
  if (softFeaturePreferences.length) {
    const featureMatches = softFeaturePreferences.filter(preference => camper.featureKeys.has(preference.key)).length
    if (featureMatches > 0) {
      breakdown.push({
        key: EVALUATION_SCORE_POLICY.featureMatch.key,
        label: EVALUATION_SCORE_POLICY.featureMatch.label,
        points: Math.min(
          EVALUATION_SCORE_POLICY.featureMatch.maxPoints,
          featureMatches * EVALUATION_SCORE_POLICY.featureMatch.pointsPerMatchedFeature,
        ),
      })
    }
  }
  breakdown.push(...scorePricingPreference(pricing, state))
  breakdown.push(...scoreAttributePreferences(camper, state))
  breakdown.push(...scoreCapabilityMatches(capabilityMatches))
  return breakdown
}
