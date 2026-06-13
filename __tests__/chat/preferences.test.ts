import { describe, expect, it } from 'vitest'
import {
  resolveCapabilityAlias,
  resolveFeatureAlias,
  validateAttributePreferences,
  validateCapabilityPreferences,
  validateFeaturePreferences,
  validatePricingPreference,
} from '@/lib/chat/preferences'

describe('canonical preference validation', () => {
  it('maps feature sourceText through aliases when key is missing or invalid', () => {
    const result = validateFeaturePreferences([
      { key: 'not_a_feature', strength: 'hard', sourceText: 'Kell saját WC', detectedLocale: 'hu' },
    ])

    expect(result.featurePreferences).toEqual([
      {
        key: 'cassette_wc',
        strength: 'hard',
        sourceText: 'Kell saját WC',
        detectedLocale: 'hu',
      },
    ])
    expect(result.unmappedPreferences ?? []).toHaveLength(0)
  })

  it('does not silently accept a GPT-selected feature key for an ambiguous sourceText', () => {
    const result = validateFeaturePreferences([
      { key: 'living_area_ac', strength: 'soft', sourceText: 'klíma', detectedLocale: 'hu' },
    ])

    expect(result.featurePreferences ?? []).toHaveLength(0)
    expect(result.ambiguousPreferences).toEqual([
      {
        sourceText: 'klíma',
        candidates: expect.arrayContaining(['cab_ac', 'living_area_ac']),
        strength: 'soft',
        detectedLocale: 'hu',
        reason: 'ambiguous_feature',
      },
    ])
  })

  it('keeps automatic transmission as an attribute, not a feature', () => {
    expect(resolveFeatureAlias('automata váltó', 'hu')).toEqual({
      status: 'unmapped',
      sourceText: 'automata váltó',
    })

    const result = validateAttributePreferences([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'hard',
        sourceText: 'automata váltó',
        detectedLocale: 'hu',
      },
    ])

    expect(result.attributePreferences).toEqual([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'hard',
        sourceText: 'automata váltó',
        detectedLocale: 'hu',
      },
    ])
  })

  it('keeps wild camping as a capability, not a feature', () => {
    const result = validateCapabilityPreferences([
      { key: 'missing_key', strength: 'hard', sourceText: 'vadkempingeznénk', detectedLocale: 'hu' },
    ])

    expect(result.capabilityPreferences).toEqual([
      {
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'vadkempingeznénk',
        detectedLocale: 'hu',
      },
    ])
  })

  it('resolves capability sourceText through canonical capability aliases', () => {
    expect(resolveCapabilityAlias('off-grid használatra', 'hu')).toMatchObject({
      status: 'matched',
      capabilityKey: 'off_grid',
    })

    const result = validateCapabilityPreferences([
      { key: 'not_in_registry', strength: 'soft', sourceText: 'home office útközben', detectedLocale: 'hu' },
    ])

    expect(result.capabilityPreferences).toEqual([
      {
        key: 'remote_work',
        strength: 'soft',
        sourceText: 'home office útközben',
        detectedLocale: 'hu',
      },
    ])
    expect(result.unmappedPreferences ?? []).toHaveLength(0)
  })

  it('keeps ambiguous capability aliases out of canonical engine input', () => {
    const result = validateCapabilityPreferences([
      { key: 'wild_camping', strength: 'soft', sourceText: 'szabadon állnánk meg', detectedLocale: 'hu' },
    ])

    expect(result.capabilityPreferences ?? []).toHaveLength(0)
    expect(result.ambiguousPreferences).toEqual([
      {
        sourceText: 'szabadon állnánk meg',
        candidates: ['wild_camping'],
        strength: 'soft',
        detectedLocale: 'hu',
        reason: 'ambiguous_capability',
      },
    ])
  })

  it('does not accept a capability key when the sourceText clearly belongs to feature aliases', () => {
    const result = validateCapabilityPreferences([
      { key: 'off_grid', strength: 'hard', sourceText: 'napelem', detectedLocale: 'hu' },
    ])

    expect(result.capabilityPreferences ?? []).toHaveLength(0)
    expect(result.unmappedPreferences).toEqual([
      {
        sourceText: 'napelem',
        strength: 'hard',
        detectedLocale: 'hu',
        reason: 'unknown_capability',
      },
    ])
  })

  it('keeps cheaper/budget intent in pricingPreference', () => {
    const result = validatePricingPreference({
      intent: 'budget_limit',
      amount: 50000,
      currency: 'HUF',
      strength: 'hard',
      sourceText: 'maximum 50 ezer naponta',
    })

    expect(result.pricingPreference).toEqual({
      intent: 'budget_limit',
      amount: 50000,
      currency: 'HUF',
      strength: 'hard',
      sourceText: 'maximum 50 ezer naponta',
    })
  })

  it('does not force capability, attribute or pricing phrases into feature aliases', () => {
    expect(resolveFeatureAlias('vadkempingeznénk', 'hu')).toEqual({
      status: 'unmapped',
      sourceText: 'vadkempingeznénk',
    })
    expect(resolveFeatureAlias('off-grid használat', 'hu')).toEqual({
      status: 'unmapped',
      sourceText: 'off-grid használat',
    })
    expect(resolveFeatureAlias('önellátó legyen', 'hu')).toEqual({
      status: 'unmapped',
      sourceText: 'önellátó legyen',
    })
    expect(resolveFeatureAlias('olcsóbbat keresek', 'hu')).toEqual({
      status: 'unmapped',
      sourceText: 'olcsóbbat keresek',
    })
    expect(resolveFeatureAlias('nagyobb autó kell', 'hu')).toEqual({
      status: 'unmapped',
      sourceText: 'nagyobb autó kell',
    })
  })

  it('keeps broad equipment words ambiguous instead of silently choosing one feature', () => {
    const result = validateFeaturePreferences([
      { strength: 'soft', sourceText: 'fűtés', detectedLocale: 'hu' },
    ])

    expect(result.featurePreferences ?? []).toHaveLength(0)
    expect(result.ambiguousPreferences).toEqual([
      {
        sourceText: 'fűtés',
        candidates: expect.arrayContaining([
          'diesel_heater',
          'gas_heater',
          'parking_heater',
          'underfloor_heating',
        ]),
        strength: 'soft',
        detectedLocale: 'hu',
        reason: 'ambiguous_feature',
      },
    ])
  })

  it('rejects unknown attribute and capability keys', () => {
    expect(validateAttributePreferences([
      { key: 'automatic_transmission', value: true, strength: 'hard', sourceText: 'automata' },
    ]).unmappedPreferences).toEqual([
      { sourceText: 'automata', strength: 'hard', detectedLocale: undefined, reason: 'unknown_attribute' },
    ])

    expect(validateCapabilityPreferences([
      { key: 'luxury_trip', strength: 'soft', sourceText: 'luxus legyen' },
    ]).unmappedPreferences).toEqual([
      { sourceText: 'luxus legyen', strength: 'soft', detectedLocale: undefined, reason: 'unknown_capability' },
    ])
  })

  it('validates capability preferences through the capability registry', () => {
    expect(validateCapabilityPreferences([
      { key: 'off_grid', strength: 'soft', sourceText: 'jó lenne off-grid módon menni' },
    ])).toEqual({
      capabilityPreferences: [
        {
          key: 'off_grid',
          strength: 'soft',
          sourceText: 'jó lenne off-grid módon menni',
          detectedLocale: 'hu',
        },
      ],
      unmappedPreferences: [],
      ambiguousPreferences: [],
    })

    expect(validateCapabilityPreferences([
      { key: 'not_in_registry', strength: 'soft', sourceText: 'űrhajó mód' },
    ]).unmappedPreferences).toEqual([
      { sourceText: 'űrhajó mód', strength: 'soft', detectedLocale: undefined, reason: 'unknown_capability' },
    ])
  })
})
