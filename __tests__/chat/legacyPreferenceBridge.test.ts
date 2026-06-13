import { describe, expect, it } from 'vitest'

import { applyLegacyRawPreferenceCanonicalBridge } from '@/lib/chat/legacyPreferenceBridge'
import { normalizeForMatch } from '@/lib/chat/extractorFallbacks'
import type { ConversationState } from '@/lib/chat/state'

describe('applyLegacyRawPreferenceCanonicalBridge', () => {
  it('moves soft pricing raw text to canonical pricingPreference without raw mirror', () => {
    const update: Partial<ConversationState> = {}

    const remaining = applyLegacyRawPreferenceCanonicalBridge({
      preferences: ['olcsóbb opció jó lenne'],
      strength: 'soft',
      update,
      normalizeForMatch,
    })

    expect(remaining).toEqual([])
    expect(update.pricingPreference).toEqual({
      intent: 'cheaper',
      strength: 'soft',
      sourceText: 'olcsóbb opció jó lenne',
    })
  })

  it('keeps hard legacy raw mirror while adding canonical attribute preference', () => {
    const update: Partial<ConversationState> = {}

    const remaining = applyLegacyRawPreferenceCanonicalBridge({
      preferences: ['mindenképpen automata'],
      strength: 'hard',
      update,
      normalizeForMatch,
    })

    expect(remaining).toEqual(['mindenképpen automata'])
    expect(update.attributePreferences).toEqual([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'hard',
        sourceText: 'mindenképpen automata',
        detectedLocale: 'hu',
      },
    ])
  })

  it('moves capability raw text to canonical capability preference', () => {
    const update: Partial<ConversationState> = {}

    const remaining = applyLegacyRawPreferenceCanonicalBridge({
      preferences: ['off-grid használatra'],
      strength: 'soft',
      update,
      normalizeForMatch,
    })

    expect(remaining).toEqual([])
    expect(update.capabilityPreferences?.[0]).toMatchObject({
      key: 'off_grid',
      strength: 'soft',
      sourceText: 'off-grid használatra',
    })
  })

  it('keeps unknown raw preference as legacy text', () => {
    const update: Partial<ConversationState> = {}

    const remaining = applyLegacyRawPreferenceCanonicalBridge({
      preferences: ['valami nagyon különleges'],
      strength: 'soft',
      update,
      normalizeForMatch,
    })

    expect(remaining).toEqual(['valami nagyon különleges'])
    expect(update.featurePreferences).toBeUndefined()
    expect(update.capabilityPreferences).toBeUndefined()
    expect(update.attributePreferences).toBeUndefined()
    expect(update.pricingPreference).toBeUndefined()
  })
})
