import { describe, expect, it } from 'vitest'
import type { ConversationState, SessionMemory, SessionShownOption } from '@/lib/chat/state'
import { resolveRecommendationReferencesForTurn } from '@/lib/chat/recommendationReferenceOrchestrator'

const state: ConversationState = {
  month: '2026-07',
  durationDays: 7,
  passengers: 2,
}

const firstOption: SessionShownOption = {
  index: 1,
  optionId: 'rec_1',
  camperSlug: 'hobby-t75hf',
  camperName: 'Hobby T75HF',
  criteria: { month: '2026-07', durationDays: 7, passengers: 2 },
  criteriaHash: 'hash',
  featureKeys: ['solar_panel'],
  attributeFacts: { beds: 4, gearbox: 'Manuális' },
  pricePerDay: 58000,
}

const secondOption: SessionShownOption = {
  index: 2,
  optionId: 'rec_2',
  camperSlug: 'hymer-ayers-rock',
  camperName: 'Hymer Ayers Rock',
  criteria: { month: '2026-07', durationDays: 7, passengers: 2 },
  criteriaHash: 'hash',
  featureKeys: ['cassette_wc'],
  attributeFacts: { beds: 2, gearbox: 'Automata' },
  pricePerDay: 62000,
}

const sessionMemory: SessionMemory = {
  lastRecommendationResult: {
    optionId: 'rec_2',
    camperSlug: 'hymer-ayers-rock',
    camperName: 'Hymer Ayers Rock',
    shownIndex: 2,
    criteria: { month: '2026-07', durationDays: 7, passengers: 2 },
    criteriaHash: 'hash',
  },
  shownOptions: [firstOption, secondOption],
}

describe('recommendation reference orchestrator', () => {
  it('returns no results when the turn has no recommendation reference', () => {
    expect(resolveRecommendationReferencesForTurn({ state, sessionMemory })).toEqual({
      recommendationReferenceResult: undefined,
      primaryInteractionResult: undefined,
      secondaryInteractionResult: undefined,
    })
  })

  it('resolves a basic recommendation reference for the turn', () => {
    const result = resolveRecommendationReferencesForTurn({
      state: { ...state, referenceTarget: 'firstShownOption' },
      sessionMemory,
    })

    expect(result.recommendationReferenceResult?.status).toBe('resolved')
    expect(result.recommendationReferenceResult?.target?.optionId).toBe('rec_1')
  })

  it('resolves a fact recommendation reference for the turn', () => {
    const result = resolveRecommendationReferencesForTurn({
      state: {
        ...state,
        recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
      },
      sessionMemory,
    })

    expect(result.recommendationReferenceResult?.status).toBe('resolved')
    expect(result.recommendationReferenceResult?.target?.optionId).toBe('rec_1')
  })

  it('resolves interaction primary target from basic or fact hints', () => {
    const basic = resolveRecommendationReferencesForTurn({
      state: {
        ...state,
        recommendationInteraction: {
          type: 'selected',
          targetReference: 'lastShownOption',
          sourceText: 'az utolsó jó',
        },
      },
      sessionMemory,
    })
    const fact = resolveRecommendationReferencesForTurn({
      state: {
        ...state,
        recommendationInteraction: {
          type: 'selected',
          targetRecommendationReference: { kind: 'attribute', attributeKey: 'gearbox', value: 'Automata' },
          sourceText: 'az automata jó',
        },
      },
      sessionMemory,
    })

    expect(basic.primaryInteractionResult?.target?.optionId).toBe('rec_2')
    expect(fact.primaryInteractionResult?.target?.optionId).toBe('rec_2')
  })

  it('uses the main reference result as fallback for interaction target', () => {
    const result = resolveRecommendationReferencesForTurn({
      state: {
        ...state,
        referenceTarget: 'firstShownOption',
        recommendationInteraction: {
          type: 'selected',
          sourceText: 'ez jó',
        },
      },
      sessionMemory,
    })

    expect(result.recommendationReferenceResult?.target?.optionId).toBe('rec_1')
    expect(result.primaryInteractionResult?.target?.optionId).toBe('rec_1')
  })

  it('resolves compared secondary target without guessing', () => {
    const result = resolveRecommendationReferencesForTurn({
      state: {
        ...state,
        recommendationInteraction: {
          type: 'compared',
          targetReference: 'firstShownOption',
          secondaryTargetReference: 'lastShownOption',
          sourceText: 'az elsőt hasonlítsuk az utolsóhoz',
        },
      },
      sessionMemory,
    })

    expect(result.primaryInteractionResult?.target?.optionId).toBe('rec_1')
    expect(result.secondaryInteractionResult?.target?.optionId).toBe('rec_2')
  })

  it('keeps ambiguous references ambiguous', () => {
    const result = resolveRecommendationReferencesForTurn({
      state: {
        ...state,
        recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
      },
      sessionMemory: {
        shownOptions: [
          firstOption,
          { ...secondOption, featureKeys: ['solar_panel'] },
        ],
      },
    })

    expect(result.recommendationReferenceResult?.status).toBe('ambiguous')
    expect(result.recommendationReferenceResult?.target).toBeUndefined()
  })
})
