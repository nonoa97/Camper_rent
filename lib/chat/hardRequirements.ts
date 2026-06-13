import {
  calculateCapabilityMatch,
  getCapabilityDefinition,
} from './capabilities'
import {
  HARD_CAPABILITY_THRESHOLD,
  HARD_FAILURE_LABELS,
} from './evaluationPolicy'
import { evaluateHardAttributeRequirements } from './attributeEvaluation'
import type { CamperFact } from './evaluationFacts'
import type { CapabilityEvaluationMatch, HardFailure } from './evaluation'
import type { ConversationState } from './state'

export function evaluateCapabilityPreferences(
  camper: CamperFact,
  state: ConversationState,
): CapabilityEvaluationMatch[] {
  return (state.capabilityPreferences ?? [])
    .map((preference): CapabilityEvaluationMatch | undefined => {
      const definition = getCapabilityDefinition(preference.key)
      if (!definition) return undefined
      const match = calculateCapabilityMatch(camper.featureKeys, definition)
      const result: CapabilityEvaluationMatch = {
        ...match,
        strength: preference.strength,
      }
      if (preference.strength === 'hard') {
        result.passedThreshold = match.score >= HARD_CAPABILITY_THRESHOLD
      }
      return result
    })
    .filter((match): match is CapabilityEvaluationMatch => !!match)
}

export function evaluateHardRequirements(
  camper: CamperFact,
  state: ConversationState,
  capabilityMatches: CapabilityEvaluationMatch[],
): HardFailure[] {
  const hardFailures: HardFailure[] = []

  if (state.passengers != null && (camper.beds == null || camper.beds < state.passengers)) {
    hardFailures.push({ key: 'capacity', label: HARD_FAILURE_LABELS.capacity })
  }

  const missingHardFeaturePreferences = (state.featurePreferences ?? [])
    .filter(preference => preference.strength === 'hard' && !camper.featureKeys.has(preference.key))
  if (missingHardFeaturePreferences.length > 0) {
    hardFailures.push({
      key: 'feature_requirement',
      label: HARD_FAILURE_LABELS.feature_requirement,
    })
  }

  hardFailures.push(...evaluateHardAttributeRequirements(camper, state))

  const failedHardCapabilityMatches = capabilityMatches
    .filter(match => match.strength === 'hard' && match.score < HARD_CAPABILITY_THRESHOLD)
  for (const match of failedHardCapabilityMatches) {
    hardFailures.push({
      key: 'capability_requirement',
      label: HARD_FAILURE_LABELS.capability_requirement,
      capabilityKey: match.capabilityKey,
      score: match.score,
      threshold: HARD_CAPABILITY_THRESHOLD,
      matchedWeight: match.matchedWeight,
      totalWeight: match.totalWeight,
      missingFeatures: match.missingFeatures,
    })
  }

  return hardFailures
}
