import { describe, expect, it } from 'vitest'
import { buildRecommendationInteractionEvents } from '@/lib/chat/recommendationInteractionEvents'
import { RecommendationReferenceResult } from '@/lib/chat/recommendationReference'

const timestamp = '2026-06-12T12:00:00.000Z'

function resolved(optionId: string, camperSlug = optionId): RecommendationReferenceResult {
  return {
    status: 'resolved',
    target: {
      index: 1,
      optionId,
      camperSlug,
      camperName: `Camper ${camperSlug}`,
    },
    reasons: [`${optionId}_resolved`],
  }
}

const ambiguous: RecommendationReferenceResult = {
  status: 'ambiguous',
  candidates: [
    { index: 1, optionId: 'option-1', camperSlug: 'camper-1', camperName: 'Camper 1' },
    { index: 2, optionId: 'option-2', camperSlug: 'camper-2', camperName: 'Camper 2' },
  ],
  reasons: ['multiple_candidates'],
}

const notFound: RecommendationReferenceResult = {
  status: 'not_found',
  reasons: ['no_candidate'],
}

describe('recommendationInteractionEvents', () => {
  it('creates a referenced event for a resolved reference without explicit interaction', () => {
    const result = buildRecommendationInteractionEvents({
      recommendationReferenceResult: resolved('option-1', 'hobby-t75hf'),
      referenceTarget: 'lastRecommendation',
      recommendationReferenceKind: 'feature',
      timestamp,
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      eventType: 'referenced',
      timestamp,
      optionId: 'option-1',
      camperSlug: 'hobby-t75hf',
      metadata: {
        referenceTarget: 'lastRecommendation',
        referenceKind: 'feature',
      },
    })
  })

  it('creates a selected event for a resolved interaction target', () => {
    const result = buildRecommendationInteractionEvents({
      primaryInteractionResult: resolved('option-1', 'hobby-t75hf'),
      recommendationInteraction: {
        type: 'selected',
        targetReference: 'firstShownOption',
        sourceText: 'az első jó lesz',
      },
      timestamp,
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      eventType: 'selected',
      timestamp,
      optionId: 'option-1',
      camperSlug: 'hobby-t75hf',
      metadata: {
        sourceText: 'az első jó lesz',
        interactionType: 'selected',
        referenceTarget: 'firstShownOption',
      },
    })
  })

  it('creates a dismissed event for a resolved interaction target', () => {
    const result = buildRecommendationInteractionEvents({
      primaryInteractionResult: resolved('option-2', 'challenger-377'),
      recommendationInteraction: {
        type: 'dismissed',
        targetRecommendationReference: { kind: 'price', relation: 'cheapest' },
        sourceText: 'ezt ne',
      },
      timestamp,
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      eventType: 'dismissed',
      timestamp,
      optionId: 'option-2',
      camperSlug: 'challenger-377',
      metadata: {
        sourceText: 'ezt ne',
        interactionType: 'dismissed',
        referenceKind: 'price',
      },
    })
  })

  it('creates a compared event only when both targets are resolved', () => {
    const result = buildRecommendationInteractionEvents({
      primaryInteractionResult: resolved('option-1', 'hobby-t75hf'),
      secondaryInteractionResult: resolved('option-2', 'challenger-377'),
      recommendationInteraction: {
        type: 'compared',
        targetReference: 'firstShownOption',
        secondaryTargetReference: 'lastShownOption',
        sourceText: 'az első jobb mint az utolsó',
      },
      timestamp,
    })

    expect(result.events).toHaveLength(1)
    expect(result.events[0]).toMatchObject({
      eventType: 'compared',
      timestamp,
      optionId: 'option-1',
      camperSlug: 'hobby-t75hf',
      metadata: {
        sourceText: 'az első jobb mint az utolsó',
        interactionType: 'compared',
        referenceTarget: 'firstShownOption',
        comparedOptionId: 'option-2',
        comparedCamperSlug: 'challenger-377',
        secondaryReferenceTarget: 'lastShownOption',
      },
    })
  })

  it('does not create interaction events for ambiguous or not_found targets', () => {
    const selected = buildRecommendationInteractionEvents({
      primaryInteractionResult: ambiguous,
      recommendationInteraction: {
        type: 'selected',
        targetReference: 'firstShownOption',
        sourceText: 'az első jó',
      },
      timestamp,
    })

    const compared = buildRecommendationInteractionEvents({
      primaryInteractionResult: resolved('option-1'),
      secondaryInteractionResult: notFound,
      recommendationInteraction: {
        type: 'compared',
        targetReference: 'firstShownOption',
        secondaryTargetReference: 'lastShownOption',
        sourceText: 'hasonlítsuk össze',
      },
      timestamp,
    })

    expect(selected.events).toEqual([])
    expect(compared.events).toEqual([])
  })

  it('does not create referenced events for ambiguous or not_found references', () => {
    expect(buildRecommendationInteractionEvents({
      recommendationReferenceResult: ambiguous,
      referenceTarget: 'lastRecommendation',
      timestamp,
    }).events).toEqual([])

    expect(buildRecommendationInteractionEvents({
      recommendationReferenceResult: notFound,
      referenceTarget: 'lastRecommendation',
      timestamp,
    }).events).toEqual([])
  })
})
