import { describe, expect, it } from 'vitest'
import type { ConversationState, SessionMemory } from '@/lib/chat/state'
import {
  appendMemoryEvents,
  createMemoryEvent,
  createRecommendationCriteria,
  createRecommendationCriteriaHash,
  createRecommendationMemorySnapshots,
  createRecommendationOptionId,
  evaluateRecommendationCriteriaCompatibility,
  MAX_MEMORY_EVENTS,
  rememberRecommendationSnapshots,
  type RecommendationMemoryInput,
} from '@/lib/chat/recommendationMemory'

const baseState: ConversationState = {
  month: '2026-07',
  durationDays: 7,
  passengers: 2,
  campingType: 'camping_site',
  featurePreferences: [
    { key: 'solar_panel', strength: 'soft', sourceText: 'jó lenne napelem' },
  ],
  capabilityPreferences: [
    { key: 'off_grid', strength: 'soft', sourceText: 'néha off-grid' },
  ],
  pricingPreference: {
    intent: 'cheaper',
    strength: 'soft',
    sourceText: 'olcsóbbat',
  },
}

const input: RecommendationMemoryInput = {
  camperSlug: 'hobby-t75hf',
  camperName: 'Hobby T75HF',
  pricePerDay: 58000,
  totalPrice: 406000,
  score: 42,
  source: 'evaluation_engine',
  featureKeys: ['cassette_wc', 'solar_panel'],
  attributeFacts: {
    beds: 4,
    type: 'Alkóvos',
    gearbox: 'Manuális',
    year: 2024,
  },
  capabilityMatches: [
    {
      capabilityKey: 'off_grid',
      strength: 'soft',
      score: 0.7,
      matchedWeight: 7,
      totalWeight: 10,
      matchedFeatures: ['solar_panel'],
      missingFeatures: ['inverter'],
    },
  ],
  availabilitySummary: {
    from: '2026-07-13',
    to: '2026-07-20',
    days: 7,
  },
}

describe('recommendation memory snapshots', () => {
  it('creates a recommendation criteria snapshot from ConversationState', () => {
    expect(createRecommendationCriteria(baseState)).toEqual({
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      featurePreferences: baseState.featurePreferences,
      capabilityPreferences: baseState.capabilityPreferences,
      pricingPreference: baseState.pricingPreference,
    })
  })

  it('creates stable criteriaHash for the same input', () => {
    const a = createRecommendationCriteriaHash(createRecommendationCriteria(baseState))
    const b = createRecommendationCriteriaHash(createRecommendationCriteria({
      ...baseState,
      featurePreferences: [...(baseState.featurePreferences ?? [])].reverse(),
    }))

    expect(a).toBe(b)
  })

  it('changes criteriaHash when relevant criteria changes', () => {
    const a = createRecommendationCriteriaHash(createRecommendationCriteria(baseState))
    const b = createRecommendationCriteriaHash(createRecommendationCriteria({
      ...baseState,
      passengers: 4,
    }))

    expect(a).not.toBe(b)
  })

  it('creates shownOptions with stable optionId that is not based on feature.name', () => {
    const criteriaHash = createRecommendationCriteriaHash(createRecommendationCriteria(baseState))
    const optionId = createRecommendationOptionId(1, input, criteriaHash)
    const renamedFeatureInput = {
      ...input,
      camperName: 'Renamed camper display label',
      featureKeys: ['renamed_display_feature_key_should_not_matter'],
    }

    expect(optionId).toBe(createRecommendationOptionId(1, renamedFeatureInput, criteriaHash))
    expect(optionId).toMatch(/^rec_1_hobby-t75hf_/)
    expect(optionId).not.toContain('solar')
    expect(optionId).not.toContain('Hobby')
  })

  it('stores featureKeys, capabilityMatches, lightweight facts and keeps lastRecommendationResult compatible', () => {
    const snapshots = createRecommendationMemorySnapshots([], [input], baseState, '2026-06-12T10:00:00.000Z')

    expect(snapshots.lastRecommendationResult).toEqual(
      expect.objectContaining({
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        shownIndex: 1,
        shownAt: '2026-06-12T10:00:00.000Z',
        criteriaHash: expect.any(String),
        pricePerDay: 58000,
        totalPrice: 406000,
        score: 42,
        featureKeys: ['cassette_wc', 'solar_panel'],
        attributeFacts: expect.objectContaining({
          beds: 4,
          gearbox: 'Manuális',
        }),
        availabilitySummary: {
          from: '2026-07-13',
          to: '2026-07-20',
          days: 7,
        },
      }),
    )
    expect(snapshots.lastRecommendationResult?.capabilityMatches).toEqual([
      expect.objectContaining({
        capabilityKey: 'off_grid',
        matchedFeatures: ['solar_panel'],
        missingFeatures: ['inverter'],
      }),
    ])
    expect(snapshots.options[0]).toEqual(
      expect.objectContaining({
        optionId: snapshots.lastRecommendationResult?.optionId,
        camperSlug: 'hobby-t75hf',
        featureKeys: ['cassette_wc', 'solar_panel'],
      }),
    )
  })

  it('appends recommendation snapshots without making memory a truth source', () => {
    const sessionMemory: SessionMemory = {}
    const next = rememberRecommendationSnapshots(sessionMemory, [input], baseState)

    expect(next.lastRecommendationResult?.camperSlug).toBe('hobby-t75hf')
    expect(next.shownOptions).toHaveLength(1)
    expect(next.memoryEvents).toEqual([
      expect.objectContaining({
        eventType: 'shown',
        optionId: next.shownOptions?.[0].optionId,
        camperSlug: 'hobby-t75hf',
        metadata: expect.objectContaining({
          shownIndex: 1,
          source: 'evaluation_engine',
        }),
      }),
    ])
    expect(sessionMemory.lastRecommendationResult).toBeUndefined()
  })
})

describe('recommendation memory events', () => {
  it('creates stable shown event ids for the same objective input', () => {
    const event = createMemoryEvent({
      eventType: 'shown',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: { shownIndex: 1 },
    }, '2026-06-12T10:00:00.000Z')

    expect(event).toEqual(createMemoryEvent({
      eventType: 'shown',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: { shownIndex: 1 },
    }, '2026-06-12T10:00:00.000Z'))
    expect(event.eventId).toMatch(/^evt_/)
  })

  it('creates referenced event connected to optionId', () => {
    expect(createMemoryEvent({
      eventType: 'referenced',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: { referenceText: 'az első' },
    }, '2026-06-12T10:00:00.000Z')).toEqual(
      expect.objectContaining({
        eventType: 'referenced',
        optionId: 'rec_1_hobby-t75hf_abc',
        camperSlug: 'hobby-t75hf',
        metadata: { referenceText: 'az első' },
      }),
    )
  })

  it('creates selected event without preference inference', () => {
    const event = createMemoryEvent({
      eventType: 'selected',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: { sourceText: 'maradjunk annál' },
    }, '2026-06-12T10:00:00.000Z')

    expect(event.metadata).toEqual({ sourceText: 'maradjunk annál' })
    expect(JSON.stringify(event)).not.toContain('prefers')
    expect(JSON.stringify(event)).not.toContain('probably')
  })

  it('creates dismissed event without rejection reason inference', () => {
    expect(createMemoryEvent({
      eventType: 'dismissed',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: { sourceText: 'ez nem jó' },
    }, '2026-06-12T10:00:00.000Z')).toEqual(
      expect.objectContaining({
        eventType: 'dismissed',
        metadata: { sourceText: 'ez nem jó' },
      }),
    )
  })

  it('creates compared event as objective comparison fact only', () => {
    expect(createMemoryEvent({
      eventType: 'compared',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: {
        comparedOptionId: 'rec_2_hymer_abc',
        comparedCamperSlug: 'hymer-ayers-rock',
      },
    }, '2026-06-12T10:00:00.000Z')).toEqual(
      expect.objectContaining({
        eventType: 'compared',
        optionId: 'rec_1_hobby-t75hf_abc',
        metadata: {
          comparedOptionId: 'rec_2_hymer_abc',
          comparedCamperSlug: 'hymer-ayers-rock',
        },
      }),
    )
  })

  it('limits event history and keeps newest events', () => {
    const events = Array.from({ length: MAX_MEMORY_EVENTS + 3 }, (_, index) => createMemoryEvent({
      eventType: 'referenced',
      optionId: `rec_${index + 1}_camper_x`,
      camperSlug: `camper-${index + 1}`,
      metadata: { sequence: index + 1 },
    }, `2026-06-12T10:00:${String(index).padStart(2, '0')}.000Z`))

    const next = appendMemoryEvents({}, events)

    expect(next.memoryEvents).toHaveLength(MAX_MEMORY_EVENTS)
    expect(next.memoryEvents?.[0].metadata).toEqual({ sequence: 4 })
    expect(next.memoryEvents?.at(-1)?.metadata).toEqual({ sequence: MAX_MEMORY_EVENTS + 3 })
  })

  it('deduplicates events by eventId', () => {
    const event = createMemoryEvent({
      eventType: 'selected',
      optionId: 'rec_1_hobby-t75hf_abc',
    }, '2026-06-12T10:00:00.000Z')

    const next = appendMemoryEvents({ memoryEvents: [event] }, [event])

    expect(next.memoryEvents).toEqual([event])
  })

  it('preserves availability and recommendation history when event history changes', () => {
    const sessionMemory: SessionMemory = {
      lastAvailabilityResult: {
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        from: '2026-07-01',
        to: '2026-07-08',
        days: 7,
        source: 'availability_search',
      },
      previousAvailabilityResults: [{
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        from: '2026-07-01',
        to: '2026-07-08',
        days: 7,
        source: 'availability_search',
      }],
      lastRecommendationResult: {
        optionId: 'rec_1_hobby-t75hf_abc',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
      shownOptions: [{
        index: 1,
        optionId: 'rec_1_hobby-t75hf_abc',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      }],
    }
    const event = createMemoryEvent({
      eventType: 'referenced',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
    }, '2026-06-12T10:00:00.000Z')

    const next = appendMemoryEvents(sessionMemory, [event])

    expect(next.lastAvailabilityResult).toBe(sessionMemory.lastAvailabilityResult)
    expect(next.previousAvailabilityResults).toBe(sessionMemory.previousAvailabilityResults)
    expect(next.lastRecommendationResult).toBe(sessionMemory.lastRecommendationResult)
    expect(next.shownOptions).toBe(sessionMemory.shownOptions)
    expect(next.memoryEvents).toEqual([event])
  })

  it('does not mutate ConversationState when events are stored', () => {
    const stateBefore = JSON.stringify(baseState)
    const sessionMemory: SessionMemory = {}
    const next = rememberRecommendationSnapshots(sessionMemory, [input], baseState)

    expect(JSON.stringify(baseState)).toBe(stateBefore)
    expect(next.memoryEvents?.[0].eventType).toBe('shown')
  })

  it('keeps memory operations separate from current search truth inputs', () => {
    const criteria = createRecommendationCriteria(baseState)
    const stateBefore = structuredClone(baseState)
    const compatibility = evaluateRecommendationCriteriaCompatibility(criteria, baseState)
    const event = createMemoryEvent({
      eventType: 'selected',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
    }, '2026-06-12T10:00:00.000Z')
    const nextMemory = appendMemoryEvents({}, [event])

    expect(compatibility.status).toBe('compatible')
    expect(baseState).toEqual(stateBefore)
    expect(nextMemory.memoryEvents).toEqual([event])
    expect(nextMemory.lastRecommendationResult).toBeUndefined()
    expect(nextMemory.shownOptions).toBeUndefined()
  })
})

describe('recommendation criteria compatibility', () => {
  it('returns compatible for identical criteria', () => {
    const criteria = createRecommendationCriteria(baseState)

    expect(evaluateRecommendationCriteriaCompatibility(criteria, baseState)).toEqual({
      status: 'compatible',
      reasons: [],
    })
  })

  it('marks duration reduction as compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({ ...baseState, durationDays: 10 })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, durationDays: 7 })).toEqual({
      status: 'compatible_relaxed',
      reasons: ['duration_reduced'],
    })
  })

  it('marks duration increase as needs_recheck', () => {
    const criteria = createRecommendationCriteria({ ...baseState, durationDays: 7 })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, durationDays: 10 })).toEqual({
      status: 'needs_recheck',
      reasons: ['duration_increased'],
    })
  })

  it('marks passenger increase as needs_recheck', () => {
    const criteria = createRecommendationCriteria({ ...baseState, passengers: 2 })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, passengers: 4 })).toEqual({
      status: 'needs_recheck',
      reasons: ['passengers_increased'],
    })
  })

  it('marks passenger reduction as compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({ ...baseState, passengers: 4 })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, passengers: 2 })).toEqual({
      status: 'compatible_relaxed',
      reasons: ['passengers_reduced'],
    })
  })

  it('marks legacy wild campingType criteria as stale instead of compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({ ...baseState, campingType: 'wild' })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, campingType: 'camping_site' })).toEqual({
      status: 'stale',
      reasons: ['legacy_wild_camping_type'],
    })
  })

  it('marks current legacy wild campingType criteria as stale instead of needs_recheck', () => {
    const criteria = createRecommendationCriteria({ ...baseState, campingType: 'camping_site' })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, campingType: 'wild' })).toEqual({
      status: 'stale',
      reasons: ['legacy_wild_camping_type'],
    })
  })

  it('marks hard feature addition as needs_recheck', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      featurePreferences: [],
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' },
      ],
    })).toEqual({
      status: 'needs_recheck',
      reasons: ['hard_feature_added'],
    })
  })

  it('marks hard feature removal as compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' },
      ],
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      featurePreferences: [],
    })).toEqual({
      status: 'compatible_relaxed',
      reasons: ['hard_feature_removed'],
    })
  })

  it('marks hard attribute addition as needs_recheck', () => {
    const criteria = createRecommendationCriteria(baseState)

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'hard', sourceText: 'automata legyen' },
      ],
    })).toEqual({
      status: 'needs_recheck',
      reasons: ['hard_attribute_added'],
    })
  })

  it('marks hard attribute removal as compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'hard', sourceText: 'automata legyen' },
      ],
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      attributePreferences: [],
    })).toEqual({
      status: 'compatible_relaxed',
      reasons: ['hard_attribute_removed'],
    })
  })

  it('marks hard capability addition as needs_recheck', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      capabilityPreferences: [],
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'off-grid kell' },
      ],
    })).toEqual({
      status: 'needs_recheck',
      reasons: ['hard_capability_added'],
    })
  })

  it('marks hard capability removal as compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'off-grid kell' },
      ],
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      capabilityPreferences: [],
    })).toEqual({
      status: 'compatible_relaxed',
      reasons: ['hard_capability_removed'],
    })
  })

  it('marks pricing tightening as needs_recheck', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      pricingPreference: undefined,
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      pricingPreference: {
        intent: 'budget_limit',
        amount: 40000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 40000',
      },
    })).toEqual({
      status: 'needs_recheck',
      reasons: ['pricing_tightened'],
    })
  })

  it('marks pricing relaxing as compatible_relaxed', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      pricingPreference: {
        intent: 'budget_limit',
        amount: 40000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 40000',
      },
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      pricingPreference: {
        intent: 'premium_ok',
        strength: 'soft',
        sourceText: 'lehet drágább',
      },
    })).toEqual({
      status: 'compatible_relaxed',
      reasons: ['pricing_relaxed'],
    })
  })

  it('marks large date changes as stale', () => {
    const criteria = createRecommendationCriteria({ ...baseState, month: '2026-07' })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, { ...baseState, month: '2026-08' })).toEqual({
      status: 'stale',
      reasons: ['month_changed'],
    })
  })

  it('keeps soft preference changes non-stale', () => {
    const criteria = createRecommendationCriteria({
      ...baseState,
      featurePreferences: [
        { key: 'solar_panel', strength: 'soft', sourceText: 'jó lenne napelem' },
      ],
    })

    expect(evaluateRecommendationCriteriaCompatibility(criteria, {
      ...baseState,
      featurePreferences: [
        { key: 'awning', strength: 'soft', sourceText: 'jó lenne napellenző' },
      ],
    })).toEqual({
      status: 'compatible',
      reasons: ['soft_feature_changed'],
    })
  })
})
