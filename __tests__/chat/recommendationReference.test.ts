import { describe, expect, it } from 'vitest'
import type { ConversationState, SessionMemory, SessionShownOption } from '@/lib/chat/state'
import {
  createReferencedRecommendationEvent,
  resolveRecommendationFactReference,
  resolveRecommendationReference,
} from '@/lib/chat/recommendationReference'

const criteria = {
  month: '2026-07',
  durationDays: 7,
  passengers: 2,
  campingType: 'camping_site' as const,
}

const state: ConversationState = {
  month: '2026-07',
  durationDays: 7,
  passengers: 2,
  campingType: 'camping_site',
}

const firstOption: SessionShownOption = {
  index: 1,
  optionId: 'rec_1_hobby-t75hf_abc',
  camperSlug: 'hobby-t75hf',
  camperName: 'Hobby T75HF',
  criteria,
  criteriaHash: 'hash-a',
  pricePerDay: 58000,
  totalPrice: 406000,
  featureKeys: ['solar_panel', 'cassette_wc'],
  attributeFacts: {
    beds: 4,
    type: 'Alkóvos',
    gearbox: 'Manuális',
    year: 2024,
  },
  capabilityMatches: [{
    capabilityKey: 'off_grid',
    strength: 'soft',
    score: 0.7,
    matchedWeight: 7,
    totalWeight: 10,
    matchedFeatures: ['solar_panel'],
    missingFeatures: ['inverter'],
  }],
}

const lastOption: SessionShownOption = {
  index: 2,
  optionId: 'rec_2_hymer_abc',
  camperSlug: 'hymer-ayers-rock',
  camperName: 'Hymer Ayers Rock',
  criteria,
  criteriaHash: 'hash-a',
  pricePerDay: 62000,
  totalPrice: 434000,
  featureKeys: ['cassette_wc'],
  attributeFacts: {
    beds: 2,
    type: 'Camper van',
    gearbox: 'Automata',
    year: 2023,
  },
  capabilityMatches: [{
    capabilityKey: 'off_grid',
    strength: 'soft',
    score: 0,
    matchedWeight: 0,
    totalWeight: 10,
    matchedFeatures: [],
    missingFeatures: ['solar_panel'],
  }],
}

const sessionMemory: SessionMemory = {
  lastRecommendationResult: {
    optionId: lastOption.optionId,
    camperSlug: lastOption.camperSlug,
    camperName: lastOption.camperName,
    shownIndex: lastOption.index,
    criteria,
    criteriaHash: 'hash-a',
    pricePerDay: lastOption.pricePerDay,
  },
  shownOptions: [firstOption, lastOption],
}

describe('recommendation reference resolver', () => {
  it('resolves lastRecommendation deterministically', () => {
    const result = resolveRecommendationReference('lastRecommendation', sessionMemory, state)

    expect(result).toEqual(
      expect.objectContaining({
        status: 'resolved',
        target: expect.objectContaining({
          optionId: 'rec_2_hymer_abc',
          camperSlug: 'hymer-ayers-rock',
        }),
        compatibility: {
          status: 'compatible',
          reasons: [],
        },
        reasons: ['last_recommendation_resolved'],
      }),
    )
  })

  it('resolves firstShownOption deterministically', () => {
    const result = resolveRecommendationReference('firstShownOption', sessionMemory, state)

    expect(result.status).toBe('resolved')
    expect(result.target).toEqual(expect.objectContaining({
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      index: 1,
    }))
  })

  it('resolves lastShownOption deterministically', () => {
    const result = resolveRecommendationReference('lastShownOption', sessionMemory, state)

    expect(result.status).toBe('resolved')
    expect(result.target).toEqual(expect.objectContaining({
      optionId: 'rec_2_hymer_abc',
      camperSlug: 'hymer-ayers-rock',
      index: 2,
    }))
  })

  it('returns not_found for empty memory', () => {
    expect(resolveRecommendationReference('lastRecommendation', {}, state)).toEqual({
      status: 'not_found',
      reasons: ['no_last_recommendation'],
    })
    expect(resolveRecommendationReference('firstShownOption', {}, state)).toEqual({
      status: 'not_found',
      reasons: ['no_shown_options'],
    })
    expect(resolveRecommendationReference('lastShownOption', {}, state)).toEqual({
      status: 'not_found',
      reasons: ['no_shown_options'],
    })
  })

  it('returns ambiguous when multiple first shown targets exist', () => {
    const duplicateFirst: SessionShownOption = {
      ...firstOption,
      optionId: 'rec_1_duplicate_abc',
      camperSlug: 'duplicate-camper',
    }

    const result = resolveRecommendationReference('firstShownOption', {
      shownOptions: [firstOption, duplicateFirst, lastOption],
    }, state)

    expect(result.status).toBe('ambiguous')
    expect(result.reasons).toEqual(['multiple_first_shown_options'])
    expect(result.candidates?.map(candidate => candidate.optionId)).toEqual([
      'rec_1_hobby-t75hf_abc',
      'rec_1_duplicate_abc',
    ])
  })

  it('returns ambiguous when multiple last shown targets exist', () => {
    const duplicateLast: SessionShownOption = {
      ...lastOption,
      optionId: 'rec_2_duplicate_abc',
      camperSlug: 'duplicate-camper',
    }

    const result = resolveRecommendationReference('lastShownOption', {
      shownOptions: [firstOption, lastOption, duplicateLast],
    }, state)

    expect(result.status).toBe('ambiguous')
    expect(result.reasons).toEqual(['multiple_last_shown_options'])
    expect(result.candidates?.map(candidate => candidate.optionId)).toEqual([
      'rec_2_hymer_abc',
      'rec_2_duplicate_abc',
    ])
  })

  it('attaches compatibility to resolved targets without using it as selection logic', () => {
    const result = resolveRecommendationReference('firstShownOption', sessionMemory, {
      ...state,
      passengers: 4,
    })

    expect(result.status).toBe('resolved')
    expect(result.target?.optionId).toBe('rec_1_hobby-t75hf_abc')
    expect(result.compatibility).toEqual({
      status: 'needs_recheck',
      reasons: ['passengers_increased'],
    })
  })

  it('creates referenced event infrastructure for resolved references', () => {
    const result = resolveRecommendationReference('firstShownOption', sessionMemory, state)
    const event = createReferencedRecommendationEvent(
      result,
      { referenceTarget: 'firstShownOption' },
      '2026-06-12T10:00:00.000Z',
    )

    expect(event).toEqual(expect.objectContaining({
      eventType: 'referenced',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: { referenceTarget: 'firstShownOption' },
    }))
  })

  it('does not create referenced event for ambiguous or not_found results', () => {
    const ambiguous = resolveRecommendationReference('firstShownOption', {
      shownOptions: [firstOption, { ...firstOption, optionId: 'rec_1_other' }],
    }, state)
    const notFound = resolveRecommendationReference('lastRecommendation', {}, state)

    expect(createReferencedRecommendationEvent(ambiguous)).toBeUndefined()
    expect(createReferencedRecommendationEvent(notFound)).toBeUndefined()
  })

  it('does not mutate ConversationState or SessionMemory', () => {
    const stateBefore = structuredClone(state)
    const memoryBefore = structuredClone(sessionMemory)

    resolveRecommendationReference('lastShownOption', sessionMemory, state)

    expect(state).toEqual(stateBefore)
    expect(sessionMemory).toEqual(memoryBefore)
  })

  it('does not choose recommendation for unsupported reference targets', () => {
    expect(resolveRecommendationReference('previousAvailability', sessionMemory, state)).toEqual({
      status: 'not_found',
      reasons: ['unsupported_recommendation_reference_target'],
    })
  })
})

describe('fact-based recommendation reference resolver', () => {
  it('resolves a single feature match', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'feature', featureKey: 'solar_panel' },
      sessionMemory,
      state,
    )

    expect(result.status).toBe('resolved')
    expect(result.target).toEqual(expect.objectContaining({
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
    }))
    expect(result.compatibility).toEqual({ status: 'compatible', reasons: [] })
  })

  it('returns ambiguous for multiple feature matches', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'feature', featureKey: 'solar_panel' },
      {
        shownOptions: [
          firstOption,
          { ...lastOption, featureKeys: ['solar_panel'], optionId: 'rec_2_hymer_abc' },
        ],
      },
      state,
    )

    expect(result.status).toBe('ambiguous')
    expect(result.reasons).toEqual(['multiple_feature_reference_matches'])
    expect(result.candidates?.map(candidate => candidate.optionId)).toEqual([
      'rec_1_hobby-t75hf_abc',
      'rec_2_hymer_abc',
    ])
  })

  it('returns not_found for missing feature matches', () => {
    expect(resolveRecommendationFactReference(
      { kind: 'feature', featureKey: 'bike_rack' },
      sessionMemory,
      state,
    )).toEqual({
      status: 'not_found',
      reasons: ['no_feature_reference_match'],
    })
  })

  it('resolves an attribute equality match', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'attribute', attributeKey: 'gearbox', value: 'Automata' },
      sessionMemory,
      state,
    )

    expect(result.status).toBe('resolved')
    expect(result.target).toEqual(expect.objectContaining({
      optionId: 'rec_2_hymer_abc',
      camperSlug: 'hymer-ayers-rock',
    }))
  })

  it('resolves the bigger option by beds when clear', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'attribute', attributeKey: 'beds', relation: 'max' },
      sessionMemory,
      state,
    )

    expect(result.status).toBe('resolved')
    expect(result.target?.optionId).toBe('rec_1_hobby-t75hf_abc')
  })

  it('returns ambiguous for bigger option ties', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'attribute', attributeKey: 'beds', relation: 'max' },
      {
        shownOptions: [
          firstOption,
          { ...lastOption, attributeFacts: { ...lastOption.attributeFacts, beds: 4 } },
        ],
      },
      state,
    )

    expect(result.status).toBe('ambiguous')
    expect(result.reasons).toEqual(['multiple_attribute_reference_matches'])
  })

  it('resolves the cheaper option when clear', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'price', relation: 'cheapest' },
      sessionMemory,
      state,
    )

    expect(result.status).toBe('resolved')
    expect(result.target?.optionId).toBe('rec_1_hobby-t75hf_abc')
  })

  it('returns ambiguous for tied cheapest price', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'price', relation: 'cheapest' },
      {
        shownOptions: [
          firstOption,
          { ...lastOption, pricePerDay: firstOption.pricePerDay },
        ],
      },
      state,
    )

    expect(result.status).toBe('ambiguous')
    expect(result.reasons).toEqual(['multiple_price_reference_matches'])
  })

  it('returns not_found when price data is incomplete', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'price', relation: 'cheapest' },
      {
        shownOptions: [
          firstOption,
          { ...lastOption, pricePerDay: undefined },
        ],
      },
      state,
    )

    expect(result.status).toBe('not_found')
    expect(result.reasons).toEqual(['insufficient_price_data'])
  })

  it('resolves capability match based on capabilityMatches', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'capability', capabilityKey: 'off_grid' },
      sessionMemory,
      state,
    )

    expect(result.status).toBe('resolved')
    expect(result.target?.optionId).toBe('rec_1_hobby-t75hf_abc')
  })

  it('uses explicit capability minScore as a reference boundary without changing scoring policy', () => {
    const resolved = resolveRecommendationFactReference(
      { kind: 'capability', capabilityKey: 'off_grid', minScore: 0.6 },
      sessionMemory,
      state,
    )
    const notFoundAtEqualScore = resolveRecommendationFactReference(
      { kind: 'capability', capabilityKey: 'off_grid', minScore: 0.7 },
      sessionMemory,
      state,
    )

    expect(resolved.status).toBe('resolved')
    expect(resolved.target?.optionId).toBe('rec_1_hobby-t75hf_abc')
    expect(notFoundAtEqualScore).toEqual({
      status: 'not_found',
      reasons: ['no_capability_reference_match'],
    })
  })

  it('attaches compatibility to resolved fact references', () => {
    const result = resolveRecommendationFactReference(
      { kind: 'feature', featureKey: 'solar_panel' },
      sessionMemory,
      { ...state, passengers: 4 },
    )

    expect(result.status).toBe('resolved')
    expect(result.compatibility).toEqual({
      status: 'needs_recheck',
      reasons: ['passengers_increased'],
    })
  })

  it('does not mutate ConversationState or choose unsupported facts', () => {
    const stateBefore = structuredClone(state)
    const memoryBefore = structuredClone(sessionMemory)

    resolveRecommendationFactReference(
      { kind: 'feature', featureKey: 'solar_panel' },
      sessionMemory,
      state,
    )

    expect(state).toEqual(stateBefore)
    expect(sessionMemory).toEqual(memoryBefore)
  })
})
