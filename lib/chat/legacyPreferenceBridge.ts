import { ConversationState, ChecklistField } from './state'
import {
  validateFeaturePreferences,
  resolveCapabilityAlias,
} from './preferences'

export type LegacyPreferenceBridgeUpdate = Partial<ConversationState>

export interface ApplyLegacyRawPreferenceCanonicalBridgeInput {
  preferences: unknown[]
  strength: 'hard' | 'soft'
  update: LegacyPreferenceBridgeUpdate
  normalizeForMatch: (message: string) => string
}

function addCapabilityPreference(
  update: LegacyPreferenceBridgeUpdate,
  preference: NonNullable<ConversationState['capabilityPreferences']>[number],
) {
  const existing = update.capabilityPreferences ?? []
  const key = `${preference.key}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.strength}|${item.sourceText}` === key)) return
  update.capabilityPreferences = [...existing, preference]
}

function addFeaturePreference(
  update: LegacyPreferenceBridgeUpdate,
  preference: NonNullable<ConversationState['featurePreferences']>[number],
) {
  const existing = update.featurePreferences ?? []
  const key = `${preference.key}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.strength}|${item.sourceText}` === key)) return
  update.featurePreferences = [...existing, preference]
}

function addAttributePreference(
  update: LegacyPreferenceBridgeUpdate,
  preference: NonNullable<ConversationState['attributePreferences']>[number],
) {
  const existing = update.attributePreferences ?? []
  const key = `${preference.key}|${preference.operator ?? ''}|${String(preference.value)}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.operator ?? ''}|${String(item.value)}|${item.strength}|${item.sourceText}` === key)) return
  update.attributePreferences = [...existing, preference]
}

function addAmbiguousPreference(
  update: LegacyPreferenceBridgeUpdate,
  preference: NonNullable<ConversationState['ambiguousPreferences']>[number],
) {
  const existing = update.ambiguousPreferences ?? []
  const key = `${preference.reason}|${preference.sourceText}|${preference.candidates.join(',')}`
  if (existing.some(item => `${item.reason}|${item.sourceText}|${item.candidates.join(',')}` === key)) return
  update.ambiguousPreferences = [...existing, preference]
}

function addPricingPreference(
  update: LegacyPreferenceBridgeUpdate,
  preference: NonNullable<ConversationState['pricingPreference']>,
) {
  if (update.pricingPreference) return
  update.pricingPreference = preference
}

function markCampingTypeHandled(update: LegacyPreferenceBridgeUpdate) {
  update.skippedChecklist = [
    ...new Set([...(update.skippedChecklist ?? []).filter(field => field !== 'campingType'), 'campingType']),
  ] as ChecklistField[]
}

function inferAttributePreferenceFromText(
  sourceText: string,
  strength: 'hard' | 'soft',
  normalizeForMatch: (message: string) => string,
): NonNullable<ConversationState['attributePreferences']>[number] | undefined {
  const normalized = normalizeForMatch(sourceText)
  if (/\b(automata|automatic)\b/.test(normalized)) {
    return {
      key: 'gearbox',
      value: 'Automata',
      operator: 'eq',
      strength,
      sourceText,
      detectedLocale: /automatic/.test(normalized) ? 'en' : 'hu',
    }
  }
  if (/\b(manualis|manu[aá]lis|manual)\b/.test(normalized)) {
    return {
      key: 'gearbox',
      value: 'Manuális',
      operator: 'eq',
      strength,
      sourceText,
      detectedLocale: /manual/.test(normalized) ? 'en' : 'hu',
    }
  }
  return undefined
}

function inferPricingPreferenceFromText(
  sourceText: string,
  strength: 'hard' | 'soft',
  normalizeForMatch: (message: string) => string,
): NonNullable<ConversationState['pricingPreference']> | undefined {
  const normalized = normalizeForMatch(sourceText)
  if (/\b(olcsobb\w*|cheaper|tul draga)\b/.test(normalized)) {
    return {
      intent: 'cheaper',
      strength,
      sourceText,
    }
  }
  if (/\b(best value|legjobb ar|legjobb ár|ar ertek|ár érték)\b/.test(normalized)) {
    return {
      intent: 'best_value',
      strength,
      sourceText,
    }
  }
  if (/\b(premium|prémium|dragabb|drágább)\b/.test(normalized)) {
    return {
      intent: 'premium_ok',
      strength,
      sourceText,
    }
  }
  return undefined
}

export function applyLegacyRawPreferenceCanonicalBridge({
  preferences,
  strength,
  update,
  normalizeForMatch,
}: ApplyLegacyRawPreferenceCanonicalBridgeInput): string[] {
  const remainingRawPreferences: string[] = []

  for (const preference of preferences) {
    if (typeof preference !== 'string') continue
    const sourceText = preference.trim()
    if (!sourceText) continue

    const pricingPreference = inferPricingPreferenceFromText(sourceText, strength, normalizeForMatch)
    if (pricingPreference) {
      addPricingPreference(update, pricingPreference)
      if (strength === 'hard') remainingRawPreferences.push(preference)
      continue
    }

    const attributePreference = inferAttributePreferenceFromText(sourceText, strength, normalizeForMatch)
    if (attributePreference) {
      addAttributePreference(update, attributePreference)
      if (strength === 'hard') remainingRawPreferences.push(preference)
      continue
    }

    const featureValidation = validateFeaturePreferences([
      { sourceText, strength },
    ])
    if (featureValidation.featurePreferences?.length) {
      for (const featurePreference of featureValidation.featurePreferences) {
        addFeaturePreference(update, featurePreference)
      }
      if (strength === 'hard') remainingRawPreferences.push(preference)
      continue
    }
    for (const ambiguousPreference of featureValidation.ambiguousPreferences ?? []) {
      addAmbiguousPreference(update, ambiguousPreference)
    }
    if (featureValidation.ambiguousPreferences?.length) {
      if (strength === 'hard') remainingRawPreferences.push(preference)
      continue
    }

    const capabilityResolution = resolveCapabilityAlias(sourceText)
    if (capabilityResolution.status === 'matched') {
      addCapabilityPreference(update, {
        key: capabilityResolution.capabilityKey,
        strength,
        sourceText,
        detectedLocale: capabilityResolution.locale,
      })
      if (capabilityResolution.capabilityKey === 'wild_camping') {
        markCampingTypeHandled(update)
      }
      if (strength === 'hard') remainingRawPreferences.push(preference)
      continue
    }
    if (capabilityResolution.status === 'ambiguous') {
      addAmbiguousPreference(update, {
        sourceText,
        candidates: capabilityResolution.candidates,
        strength,
        detectedLocale: capabilityResolution.locale,
        reason: 'ambiguous_capability',
      })
      if (strength === 'hard') remainingRawPreferences.push(preference)
      continue
    }

    remainingRawPreferences.push(preference)
  }

  return remainingRawPreferences
}
