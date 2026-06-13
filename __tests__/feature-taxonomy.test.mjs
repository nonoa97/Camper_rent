import { describe, expect, it } from 'vitest'
import {
  createFeatureKeyBackfillPlan,
  loadFeatureKeyMapping,
  validateFeatureKey,
  validateFeatureKeyMapping,
  validateFeatureRows,
} from '../scripts/feature-key-utils.mjs'
import {
  auditFeatureTaxonomyGovernance,
  validateUiFeatureKeys,
} from '../scripts/taxonomy-governance-utils.mjs'

describe('canonical feature key utilities', () => {
  it('keeps the reviewed DB snapshot mapping complete and valid', () => {
    const mapping = loadFeatureKeyMapping()
    const validation = validateFeatureKeyMapping(mapping)

    expect(Object.keys(mapping)).toHaveLength(88)
    expect(validation.valid).toBe(true)
  })

  it('accepts lower snake case canonical keys only', () => {
    expect(validateFeatureKey('cassette_wc')).toBe(true)
    expect(validateFeatureKey('solar_panel_2')).toBe(true)
    expect(validateFeatureKey('Kazettás WC')).toBe(false)
    expect(validateFeatureKey('solar-panel')).toBe(false)
    expect(validateFeatureKey('')).toBe(false)
  })

  it('validates mapping keys before backfill', () => {
    expect(validateFeatureKeyMapping({ 'Kazettás WC': 'cassette_wc' }).valid).toBe(true)
    expect(validateFeatureKeyMapping({ 'Kazettás WC': 'cassette-wc' }).errors).toEqual([
      'Invalid key for "Kazettás WC": "cassette-wc"',
    ])
  })

  it('creates an idempotent backfill plan without touching camper feature relations', () => {
    const plan = createFeatureKeyBackfillPlan(
      [
        { id: 1, name: 'Kazettás WC', key: null },
        { id: 2, name: 'Napelem', key: 'solar_panel' },
      ],
      {
        'Kazettás WC': 'cassette_wc',
        Napelem: 'solar_panel',
      },
    )

    expect(plan.updates).toEqual([{ id: 1, name: 'Kazettás WC', key: 'cassette_wc' }])
    expect(plan.skipped).toEqual([{ id: 2, name: 'Napelem', key: 'solar_panel', reason: 'already_keyed' }])
    expect(plan.missing).toEqual([])
    expect(plan.conflicts).toEqual([])
  })

  it('rejects a backfill plan that would create duplicate feature keys', () => {
    const plan = createFeatureKeyBackfillPlan(
      [
        { id: 1, name: 'Kazettás WC', key: null },
        { id: 2, name: 'WC', key: null },
      ],
      {
        'Kazettás WC': 'cassette_wc',
        WC: 'cassette_wc',
      },
    )

    expect(plan.conflicts).toEqual([
      'Backfill would create duplicate key "cassette_wc": Kazettás WC (1), WC (2)',
    ])
  })

  it('rejects incomplete or duplicate production feature keys', () => {
    const validation = validateFeatureRows([
      { id: 1, name: 'Kazettás WC', key: 'cassette_wc' },
      { id: 2, name: 'WC', key: 'cassette_wc' },
      { id: 3, name: 'Napelem', key: null },
      { id: 4, name: 'Zuhanyzó', key: 'bad-key' },
    ])

    expect(validation.valid).toBe(false)
    expect(validation.errors).toEqual([
      'Missing key: Napelem (3)',
      'Invalid key "bad-key": Zuhanyzó (4)',
      'Duplicate key "cassette_wc": Kazettás WC (1), WC (2)',
    ])
  })

  it('keeps the checked-in taxonomy governance audit valid', () => {
    const report = auditFeatureTaxonomyGovernance()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'feature_key_mapping', valid: true }),
        expect.objectContaining({ name: 'feature_alias_registry', valid: true }),
        expect.objectContaining({ name: 'capability_registry', valid: true }),
        expect.objectContaining({ name: 'ui_feature_keys', valid: true }),
      ]),
    )
    expect(report.coverageSummary.totalFeatureCount).toBe(88)
    expect(report.coverageSummary.missingHighPriorityFeatures).toEqual([])
  })

  it('rejects UI feature keys that are unknown or duplicated', () => {
    expect(validateUiFeatureKeys(['shower', 'missing_feature'], { Zuhanyzó: 'shower' })).toEqual({
      valid: false,
      errors: ['Unknown UI feature key: missing_feature'],
    })

    expect(validateUiFeatureKeys(['shower', 'shower'], { Zuhanyzó: 'shower' })).toEqual({
      valid: false,
      errors: ['Duplicate UI feature key: shower'],
    })
  })

  it('surfaces alias governance violations through the taxonomy audit', () => {
    const report = auditFeatureTaxonomyGovernance({
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
      capabilityDefinitions: [
        {
          key: 'off_grid',
          features: [{ featureKey: 'solar_panel', weight: 3 }],
        },
      ],
      uiFeatureKeys: ['solar_panel'],
    })

    expect(report.valid).toBe(false)
    expect(report.checks.find(check => check.name === 'feature_alias_registry')).toEqual(
      expect.objectContaining({
        valid: false,
        errors: [
          'alias group 1 uses rejected alias "off-grid" (hu) for solar_panel. Owner should be capability: Capability intent composed from multiple features.',
        ],
      }),
    )
  })
})
