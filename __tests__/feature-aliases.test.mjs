import { describe, expect, it } from 'vitest'
import {
  flattenFeatureAliases,
  auditFeatureAliasCoverage,
  normalizeFeatureAlias,
  resolveFeatureAlias,
  validateFeatureAliasRegistry,
} from '../scripts/feature-alias-utils.mjs'

describe('feature alias registry', () => {
  it('validates the reviewed multilingual alias registry', () => {
    const validation = validateFeatureAliasRegistry()

    expect(validation.valid).toBe(true)
    expect(validation.rows.length).toBeGreaterThan(88)
  })

  it('normalizes accents, case and whitespace consistently', () => {
    expect(normalizeFeatureAlias('  VÉCÉ  ')).toBe('vece')
    expect(normalizeFeatureAlias('Solar   Panel')).toBe('solar panel')
    expect(normalizeFeatureAlias('USB-C töltő')).toBe('usb c tolto')
  })

  it('maps Hungarian toilet phrases to cassette_wc', () => {
    expect(resolveFeatureAlias('kell saját wc', { locale: 'hu' })).toEqual(
      expect.objectContaining({
        status: 'matched',
        featureKey: 'cassette_wc',
        locale: 'hu',
      }),
    )
  })

  it('maps English, German and Spanish toilet aliases to cassette_wc', () => {
    expect(resolveFeatureAlias('we need a toilet', { locale: 'en' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'cassette_wc' }),
    )
    expect(resolveFeatureAlias('toilette', { locale: 'de' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'cassette_wc' }),
    )
    expect(resolveFeatureAlias('baño', { locale: 'es' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'cassette_wc' }),
    )
  })

  it('maps solar preferences across aliases', () => {
    expect(resolveFeatureAlias('jó lenne napelem', { locale: 'hu' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'solar_panel' }),
    )
    expect(resolveFeatureAlias('solar panel', { locale: 'en' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'solar_panel' }),
    )
  })

  it('does not silently choose for ambiguous climate aliases', () => {
    expect(resolveFeatureAlias('klíma', { locale: 'hu' })).toEqual(
      expect.objectContaining({
        status: 'ambiguous',
        candidates: expect.arrayContaining(['cab_ac', 'living_area_ac']),
      }),
    )
  })

  it('uses the most specific alias before declaring ambiguity', () => {
    expect(resolveFeatureAlias('lakótéri klíma kellene', { locale: 'hu' })).toEqual(
      expect.objectContaining({
        status: 'matched',
        featureKey: 'living_area_ac',
      }),
    )
  })

  it('returns unmapped for unknown preference text', () => {
    expect(resolveFeatureAlias('kényelmesebb belül', { locale: 'hu' })).toEqual(
      expect.objectContaining({
        status: 'unmapped',
        sourceText: 'kényelmesebb belül',
      }),
    )
  })

  it('rejects alias registries pointing to unknown feature keys', () => {
    const validation = validateFeatureAliasRegistry({
      featureNameMapping: { Napelem: 'solar_panel' },
      aliasGroups: [{ featureKey: 'missing_feature', locale: 'hu', aliases: ['valami'] }],
    })

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual([
      'alias group 1 points to unknown featureKey: missing_feature',
    ])
  })

  it('rejects non-explicit duplicate aliases across different features', () => {
    const validation = validateFeatureAliasRegistry({
      featureNameMapping: {
        'Vezetőfülke klíma': 'cab_ac',
        'Lakótéri klíma': 'living_area_ac',
      },
      aliasGroups: [
        { featureKey: 'cab_ac', locale: 'hu', aliases: ['klíma'] },
        { featureKey: 'living_area_ac', locale: 'hu', aliases: ['klíma'] },
      ],
    })

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual([
      'Ambiguous alias "klima" in locale "hu" must be explicit. Candidates: cab_ac, living_area_ac',
    ])
  })

  it('rejects governance-blocked aliases that belong to capability, attribute or pricing owners', () => {
    const validation = validateFeatureAliasRegistry({
      featureNameMapping: { Napelem: 'solar_panel' },
      aliasGroups: [{ featureKey: 'solar_panel', locale: 'hu', aliases: ['off-grid'] }],
      aliasGovernance: {
        rejectedAliases: [
          {
            phrase: 'off-grid',
            locale: 'hu',
            owner: 'capability',
            reason: 'Capability intent composed from multiple features.',
          },
        ],
      },
    })

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual([
      'alias group 1 uses rejected alias "off-grid" (hu) for solar_panel. Owner should be capability: Capability intent composed from multiple features.',
    ])
  })

  it('validates the checked-in alias governance registry together with aliases', () => {
    const validation = validateFeatureAliasRegistry()

    expect(validation.valid).toBe(true)
  })

  it('deduplicates display-name aliases and curated aliases for the same feature', () => {
    const rows = flattenFeatureAliases({
      featureNameMapping: { Napelem: 'solar_panel' },
      aliasGroups: [{ featureKey: 'solar_panel', locale: 'hu', aliases: ['napelem'] }],
    })

    expect(rows.filter(row => row.featureKey === 'solar_panel' && row.normalizedAlias === 'napelem')).toHaveLength(1)
  })

  it('reports no missing curated coverage for high-priority features', () => {
    const report = auditFeatureAliasCoverage()

    expect(report.missingHighPriorityFeatures).toEqual([])
    expect(report.localeCoverage).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ locale: 'hu' }),
        expect.objectContaining({ locale: 'en' }),
      ]),
    )
  })

  it('maps priority off-grid support equipment through specific aliases', () => {
    expect(resolveFeatureAlias('kell inverter', { locale: 'hu' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'inverter' }),
    )
    expect(resolveFeatureAlias('legyen lakó akku', { locale: 'hu' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'leisure_battery' }),
    )
    expect(resolveFeatureAlias('fresh water tank', { locale: 'en' })).toEqual(
      expect.objectContaining({ status: 'matched', featureKey: 'freshwater_tank' }),
    )
  })

  it('keeps broad heating aliases ambiguous', () => {
    expect(resolveFeatureAlias('fűtés', { locale: 'hu' })).toEqual(
      expect.objectContaining({
        status: 'ambiguous',
        candidates: expect.arrayContaining([
          'diesel_heater',
          'gas_heater',
          'parking_heater',
          'underfloor_heating',
        ]),
      }),
    )
  })
})
