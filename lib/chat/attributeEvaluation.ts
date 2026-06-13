import { EVALUATION_SCORE_POLICY, HARD_FAILURE_LABELS } from './evaluationPolicy'
import type { CamperFact } from './evaluationFacts'
import type { HardFailure, ScoreBreakdownItem } from './evaluation'
import type { AttributePreference, AttributePreferenceKey, AttributePreferenceOperator } from './preferences'
import type { ConversationState } from './state'

type AttributeValue = string | number | boolean | null | undefined

function getAttributeValue(camper: CamperFact, key: AttributePreferenceKey): AttributeValue {
  if (key === 'beds') return camper.beds
  if (key === 'type') return camper.type
  if (key === 'gearbox') return camper.gearbox
  if (key === 'fuel_type') return camper.fuelType
  if (key === 'year') return camper.year
  return undefined
}

function normalizeString(value: AttributeValue): string {
  return String(value ?? '').trim().toLowerCase()
}

function numericValue(value: AttributeValue): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function matchesAttributePreference(
  actual: AttributeValue,
  preference: AttributePreference,
): boolean {
  const operator: AttributePreferenceOperator = preference.operator ?? 'eq'
  if (operator === 'preferred') return actual != null

  if (operator === 'eq') {
    return normalizeString(actual) === normalizeString(preference.value)
  }
  if (operator === 'neq') {
    return actual != null && normalizeString(actual) !== normalizeString(preference.value)
  }

  const actualNumber = numericValue(actual)
  const expectedNumber = numericValue(preference.value)
  if (actualNumber == null || expectedNumber == null) return false

  if (operator === 'gte') return actualNumber >= expectedNumber
  if (operator === 'lte') return actualNumber <= expectedNumber

  return false
}

function createAttributeFailure(
  camper: CamperFact,
  preference: AttributePreference,
): HardFailure {
  return {
    key: 'attribute_requirement',
    label: HARD_FAILURE_LABELS.attribute_requirement,
    attributeKey: preference.key,
    operator: preference.operator ?? 'eq',
    expectedValue: preference.value,
    actualValue: getAttributeValue(camper, preference.key) ?? null,
  }
}

export function evaluateHardAttributeRequirements(
  camper: CamperFact,
  state: ConversationState,
): HardFailure[] {
  return (state.attributePreferences ?? [])
    .filter(preference => preference.strength === 'hard')
    .filter(preference => !matchesAttributePreference(getAttributeValue(camper, preference.key), preference))
    .map(preference => createAttributeFailure(camper, preference))
}

export function scoreAttributePreferences(
  camper: CamperFact,
  state: ConversationState,
): ScoreBreakdownItem[] {
  const matches = (state.attributePreferences ?? [])
    .filter(preference => preference.strength === 'soft')
    .filter(preference => matchesAttributePreference(getAttributeValue(camper, preference.key), preference))

  if (matches.length === 0) return []

  return [{
    key: EVALUATION_SCORE_POLICY.attributeMatch.key,
    label: EVALUATION_SCORE_POLICY.attributeMatch.label,
    points: Math.min(
      EVALUATION_SCORE_POLICY.attributeMatch.maxPoints,
      matches.length * EVALUATION_SCORE_POLICY.attributeMatch.pointsPerMatchedAttribute,
    ),
    attributeKey: matches.map(preference => preference.key).join(','),
  }]
}
