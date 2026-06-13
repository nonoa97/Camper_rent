import { describe, expect, it } from 'vitest'

import { applyContextFallback, normalizeForMatch } from '@/lib/chat/extractorFallbacks'

describe('extractorFallbacks', () => {
  it('normalizes accents for deterministic fallback matching', () => {
    expect(normalizeForMatch('Túl drága, inkább olcsóbbat')).toBe('tul draga, inkabb olcsobbat')
  })

  it('fills short duration answers when GPT omits the value', () => {
    const update = applyContextFallback('5.', 'durationDays', {})

    expect(update.durationDays).toBe(5)
  })

  it('fills short passenger answers when GPT omits the value', () => {
    const update = applyContextFallback('ketten', 'passengers', {})

    expect(update.passengers).toBe(2)
  })

  it('maps wild camping fallback to capability and not campingType', () => {
    const update = applyContextFallback('vadkemp', 'campingType', {})

    expect(update.campingType).toBeUndefined()
    expect(update.capabilityPreferences).toEqual([
      {
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'vadkemp',
        detectedLocale: 'hu',
      },
    ])
    expect(update.skippedChecklist).toContain('campingType')
  })

  it('maps backing away from wild camping to camping_site correction', () => {
    const update = applyContextFallback('nem lesz vadkemp', 'campingType', {})

    expect(update.campingType).toBe('camping_site')
    expect(update.capabilityPreferences).toBeUndefined()
    expect(update.removedCapabilityPreferenceKeys).toEqual(['wild_camping'])
  })

  it('does not close extraRequirements when backing away from wild camping only', () => {
    const update = applyContextFallback('nem muszáj mégse hogy vadkempingre legyen alkalmas', 'extraRequirements', {
      capabilityPreferences: [
        { key: 'wild_camping', strength: 'hard', sourceText: 'vadkempingeznék', detectedLocale: 'hu' },
      ],
    })

    expect(update.campingType).toBe('camping_site')
    expect(update.removedCapabilityPreferenceKeys).toEqual(['wild_camping'])
    expect(update.capabilityPreferences).toBeUndefined()
    expect(update.extraRequirementsAsked).toBeUndefined()
  })

  it('marks negated capability aliases as removed constraints', () => {
    const update = applyContextFallback('és ha nem vinnék bringát?', undefined, {
      capabilityPreferences: [
        { key: 'bike_transport', strength: 'hard', sourceText: 'vinnénk bringákat is', detectedLocale: 'hu' },
      ],
      extraRequirements: ['nem vinnék bringát'],
    })

    expect(update.removedCapabilityPreferenceKeys).toEqual(['bike_transport'])
    expect(update.capabilityPreferences).toBeUndefined()
    expect(update.extraRequirements).toBeUndefined()
    expect(update.refinementIntent).toEqual({
      intent: 'remove_constraint',
      sourceText: 'és ha nem vinnék bringát?',
    })
  })

  it('keeps FAQ side-topic answers from filling checklist fallback values', () => {
    const update = applyContextFallback('3', 'passengers', { intent: 'faq' })

    expect(update.passengers).toBeUndefined()
  })
})
