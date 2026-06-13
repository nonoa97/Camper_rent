import { describe, expect, it } from 'vitest'
import {
  createAvailabilityCriteria,
  createAvailabilityCriteriaHash,
  evaluateAvailabilityCriteriaCompatibility,
  markStaleAvailabilityResults,
  rememberSessionAvailability,
  rememberStaleAvailabilityResult,
  resolveSessionAvailabilityReference,
} from '@/lib/chat/availabilityMemory'
import { CamperResult } from '@/lib/chat/availability'
import { SessionAvailabilityResult, SessionMemory } from '@/lib/chat/state'

const camper: CamperResult = {
  slug: 'hobby-t75hf',
  name: 'Hobby T75HF',
  image_url: '/hobby.jpg',
  price_per_day: 58000,
  type: 'Alkóvos',
  beds: 4,
  availableSlots: [{ from: '2026-07-13', to: '2026-07-20', days: 7 }],
}

function availabilityResult(overrides: Partial<SessionAvailabilityResult> = {}): SessionAvailabilityResult {
  return {
    camperSlug: 'hobby-t75hf',
    camperName: 'Hobby T75HF',
    from: '2026-07-13',
    to: '2026-07-20',
    days: 7,
    source: 'availability_search',
    criteria: {
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      campingType: 'wild',
    },
    criteriaHash: '{"month":"2026-07","durationDays":7,"passengers":4,"campingType":"wild"}',
    ...overrides,
  }
}

describe('availabilityMemory', () => {
  it('creates canonical criteria snapshots and stable hashes without new legacy raw preference fields', () => {
    const criteria = createAvailabilityCriteria({
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      extraRequirements: ['zuhany', 'wc', 'wc'],
      softPreferences: ['napelem', 'automata', 'napelem'],
      featurePreferences: [
        { key: 'solar_panel', strength: 'soft', sourceText: 'napelem' },
        { key: 'cassette_wc', strength: 'hard', sourceText: 'wc' },
      ],
      attributePreferences: [
        { key: 'gearbox', operator: 'eq', value: 'automatic', strength: 'hard', sourceText: 'automata' },
      ],
      capabilityPreferences: [
        { key: 'off_grid', strength: 'soft', sourceText: 'off-grid' },
      ],
      pricingPreference: {
        intent: 'budget_limit',
        amount: 100000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 100000',
      },
    })

    expect(criteria).toEqual({
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'wc', detectedLocale: undefined },
        { key: 'solar_panel', strength: 'soft', sourceText: 'napelem', detectedLocale: undefined },
      ],
      attributePreferences: [
        {
          key: 'gearbox',
          operator: 'eq',
          value: 'automatic',
          strength: 'hard',
          sourceText: 'automata',
          detectedLocale: undefined,
        },
      ],
      capabilityPreferences: [
        { key: 'off_grid', strength: 'soft', sourceText: 'off-grid', detectedLocale: undefined },
      ],
      pricingPreference: {
        intent: 'budget_limit',
        amount: 100000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 100000',
      },
    })
    expect(createAvailabilityCriteriaHash(criteria)).toBe(
      '{"month":"2026-07","durationDays":7,"passengers":4,"featurePreferences":[{"key":"cassette_wc","strength":"hard","sourceText":"wc"},{"key":"solar_panel","strength":"soft","sourceText":"napelem"}],"attributePreferences":[{"key":"gearbox","operator":"eq","value":"automatic","strength":"hard","sourceText":"automata"}],"capabilityPreferences":[{"key":"off_grid","strength":"soft","sourceText":"off-grid"}],"pricingPreference":{"intent":"budget_limit","amount":100000,"currency":"HUF","strength":"hard","sourceText":"max 100000"}}',
    )
  })

  it('keeps legacy raw availability criteria hash readable for old client-carried memory', () => {
    expect(createAvailabilityCriteriaHash({
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      extraRequirements: ['zuhany', 'wc', 'wc'],
      softPreferences: ['napelem', 'automata', 'napelem'],
    })).toBe(
      '{"month":"2026-07","durationDays":7,"passengers":4,"extraRequirements":["wc","zuhany"],"softPreferences":["automata","napelem"]}',
    )
  })

  it('evaluates canonical feature and pricing compatibility without relying on legacy raw state fields', () => {
    const featureAdded = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        featurePreferences: [{ key: 'cassette_wc', strength: 'hard', sourceText: 'wc' }],
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        extraRequirements: ['legacy text should not affect canonical memory'],
        featurePreferences: [
          { key: 'cassette_wc', strength: 'hard', sourceText: 'wc' },
          { key: 'shower', strength: 'hard', sourceText: 'zuhany' },
        ],
      },
    )
    expect(featureAdded.status).toBe('needs_recheck')
    expect(featureAdded.reasons).toEqual(['hard_feature_added'])

    const featureRemoved = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        featurePreferences: [
          { key: 'cassette_wc', strength: 'hard', sourceText: 'wc' },
          { key: 'shower', strength: 'hard', sourceText: 'zuhany' },
        ],
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        featurePreferences: [{ key: 'cassette_wc', strength: 'hard', sourceText: 'wc' }],
      },
    )
    expect(featureRemoved.status).toBe('compatible_relaxed')
    expect(featureRemoved.reasons).toEqual(['hard_feature_removed'])

    const softChanged = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        featurePreferences: [{ key: 'solar_panel', strength: 'soft', sourceText: 'napelem' }],
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        featurePreferences: [{ key: 'bike_rack', strength: 'soft', sourceText: 'biciklitarto' }],
      },
    )
    expect(softChanged.status).toBe('compatible')
    expect(softChanged.reasons).toEqual(['soft_feature_changed'])

    const pricingTightened = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        pricingPreference: {
          intent: 'budget_limit',
          amount: 120000,
          currency: 'HUF',
          strength: 'hard',
          sourceText: 'max 120000',
        },
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        pricingPreference: {
          intent: 'budget_limit',
          amount: 90000,
          currency: 'HUF',
          strength: 'hard',
          sourceText: 'max 90000',
        },
      },
    )
    expect(pricingTightened.status).toBe('needs_recheck')
    expect(pricingTightened.reasons).toEqual(['pricing_tightened'])
  })

  it('evaluates legacy raw criteria only when the saved memory snapshot contains legacy fields', () => {
    const legacySaved = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        extraRequirements: ['wc'],
        softPreferences: ['napelem'],
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        extraRequirements: ['wc', 'zuhany'],
        softPreferences: ['automata'],
      },
    )
    expect(legacySaved.status).toBe('needs_recheck')
    expect(legacySaved.reasons).toEqual([
      'legacy_hard_requirements_added',
      'legacy_soft_preferences_changed',
    ])

    const canonicalSaved = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        extraRequirements: ['wc'],
        softPreferences: ['napelem'],
      },
    )
    expect(canonicalSaved.status).toBe('compatible')
    expect(canonicalSaved.reasons).toEqual([])
  })

  it('remembers last and previous availability result with criteria snapshot', () => {
    const next = rememberSessionAvailability(
      {},
      { camper, slot: camper.availableSlots[0] },
      'availability_search',
      { month: '2026-07', durationDays: 7, passengers: 4 },
    )

    expect(next.lastAvailabilityResult).toMatchObject({
      camperSlug: 'hobby-t75hf',
      camperName: 'Hobby T75HF',
      from: '2026-07-13',
      to: '2026-07-20',
      days: 7,
      pricePerDay: 58000,
      source: 'availability_search',
      criteria: {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
      },
    })
    expect(next.lastAvailabilityResult?.criteriaHash).toBe('{"month":"2026-07","durationDays":7,"passengers":4}')
    expect(next.previousAvailabilityResults).toHaveLength(1)
  })

  it('marks legacy wild campingType criteria as stale even when other criteria relax', () => {
    const result = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 10,
        passengers: 4,
        campingType: 'wild',
      },
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 2,
        campingType: 'camping_site',
      },
    )

    expect(result.status).toBe('stale')
    expect(result.reasons).toEqual(['duration_decreased', 'passengers_decreased', 'legacy_wild_camping_type'])
  })

  it('marks current legacy wild campingType criteria as stale even when other criteria tighten', () => {
    const result = evaluateAvailabilityCriteriaCompatibility(
      {
        month: '2026-07',
        durationDays: 7,
        passengers: 2,
        campingType: 'camping_site',
      },
      {
        month: '2026-07',
        durationDays: 10,
        passengers: 4,
        campingType: 'wild',
      },
    )

    expect(result.status).toBe('stale')
    expect(result.reasons).toEqual(['duration_increased', 'passengers_increased', 'legacy_wild_camping_type'])
  })

  it('marks incompatible remembered availability results as stale without dropping history', () => {
    const current = availabilityResult({
      criteria: { month: '2026-07', durationDays: 7, passengers: 4 },
      criteriaHash: '{"month":"2026-07","durationDays":7,"passengers":4}',
    })
    const stale = availabilityResult({
      from: '2026-08-01',
      to: '2026-08-08',
      criteria: { month: '2026-08', durationDays: 7 },
      criteriaHash: '{"month":"2026-08","durationDays":7}',
    })
    const memory: SessionMemory = {
      lastAvailabilityResult: current,
      previousAvailabilityResults: [current, stale],
    }

    const next = markStaleAvailabilityResults(memory, { month: '2026-07', durationDays: 7, passengers: 4 })

    expect(next.previousAvailabilityResults).toEqual([current, stale])
    expect(next.staleAvailabilityResults).toEqual([stale])
  })

  it('remembers an explicitly stale referenced result with existing dedupe behavior', () => {
    const stale = availabilityResult()
    const next = rememberStaleAvailabilityResult(
      { staleAvailabilityResults: [stale] },
      stale,
    )

    expect(next.staleAvailabilityResults).toEqual([stale])
  })

  it('resolves previous availability reference and attaches compatibility', () => {
    const older = availabilityResult({
      from: '2026-07-01',
      to: '2026-07-08',
      criteriaHash: 'older',
    })
    const latest = availabilityResult({
      from: '2026-07-13',
      to: '2026-07-20',
      criteriaHash: 'latest',
    })

    const result = resolveSessionAvailabilityReference(
      {
        referenceTarget: 'previousAvailability',
        startDate: '2026-07-13',
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        campingType: 'wild',
      },
      {
        lastAvailabilityResult: latest,
        previousAvailabilityResults: [older, latest],
      },
    )

    expect(result?.result).toBe(older)
    expect(result?.compatibility.status).toBe('stale')
    expect(result?.compatibility.reasons).toContain('time_window_changed')
  })
})
