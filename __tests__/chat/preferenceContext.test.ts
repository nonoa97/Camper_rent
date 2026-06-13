import { describe, expect, it } from 'vitest'

import {
  hasCanonicalPreferenceContext,
  hasLegacyRawPreferenceContext,
  hasPreferenceContext,
} from '@/lib/chat/preferenceContext'
import type { ConversationState } from '@/lib/chat/state'

describe('preferenceContext', () => {
  it('detects canonical preference context without legacy raw fields', () => {
    const state: Partial<ConversationState> = {
      featurePreferences: [{ key: 'solar_panel', strength: 'soft', sourceText: 'napelem' }],
    }

    expect(hasCanonicalPreferenceContext(state)).toBe(true)
    expect(hasLegacyRawPreferenceContext(state)).toBe(false)
    expect(hasPreferenceContext(state)).toBe(true)
  })

  it('keeps legacy raw preference context as compatibility fallback', () => {
    const state = {
      softPreferences: ['napelem'],
    }

    expect(hasCanonicalPreferenceContext(state)).toBe(false)
    expect(hasLegacyRawPreferenceContext(state)).toBe(true)
    expect(hasPreferenceContext(state)).toBe(true)
  })

  it('detects pricing preference as preference context', () => {
    expect(hasPreferenceContext({
      pricingPreference: {
        intent: 'cheaper',
        strength: 'soft',
        sourceText: 'olcsóbbat',
      },
    })).toBe(true)
  })
})
