import type { ConversationState } from './state'

export function hasCanonicalPreferenceContext(state: Partial<ConversationState>): boolean {
  return !!(
    state.featurePreferences?.length ||
    state.attributePreferences?.length ||
    state.capabilityPreferences?.length ||
    state.pricingPreference ||
    state.unmappedPreferences?.length ||
    state.ambiguousPreferences?.length
  )
}

export function hasLegacyRawPreferenceContext(state: Partial<ConversationState>): boolean {
  return !!(
    state.extraRequirements?.length ||
    state.softPreferences?.length
  )
}

export function hasPreferenceContext(state: Partial<ConversationState>): boolean {
  return hasCanonicalPreferenceContext(state) || hasLegacyRawPreferenceContext(state)
}
