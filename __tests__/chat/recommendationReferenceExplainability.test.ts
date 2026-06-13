import { describe, expect, it } from 'vitest'
import { explainRecommendationReferenceResult } from '@/lib/chat/recommendationReferenceExplainability'
import type { RecommendationReferenceResult } from '@/lib/chat/recommendationReference'

const resolvedResult: RecommendationReferenceResult = {
  status: 'resolved',
  target: {
    index: 1,
    optionId: 'rec_1',
    camperSlug: 'hobby-t75hf',
    camperName: 'Hobby T75HF',
    criteria: { month: '2026-07' },
    criteriaHash: 'hash',
    featureKeys: ['solar_panel'],
    attributeFacts: { beds: 4 },
    capabilityMatches: [{
      capabilityKey: 'off_grid',
      score: 0.8,
      strength: 'soft',
      matchedWeight: 8,
      totalWeight: 10,
      matchedFeatures: ['solar_panel'],
      missingFeatures: ['inverter'],
    }],
  },
  compatibility: {
    status: 'compatible',
    reasons: [],
  },
  reasons: ['feature_reference_resolved'],
}

describe('recommendation reference explainability', () => {
  it('creates a safe resolved explanation without raw memory facts', () => {
    const explanation = explainRecommendationReferenceResult(resolvedResult)

    expect(explanation).toEqual({
      status: 'resolved',
      target: {
        optionId: 'rec_1',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        shownIndex: 1,
      },
      candidates: undefined,
      compatibility: {
        status: 'compatible',
        reasons: [],
      },
      reasons: ['feature_reference_resolved'],
      communicationAction: 'confirm_resolved_reference',
      safeForGpt: true,
    })
    expect(JSON.stringify(explanation)).not.toContain('featureKeys')
    expect(JSON.stringify(explanation)).not.toContain('attributeFacts')
    expect(JSON.stringify(explanation)).not.toContain('capabilityMatches')
    expect(JSON.stringify(explanation)).not.toContain('criteriaHash')
  })

  it('creates an ambiguous explanation with safe candidates and no selected target', () => {
    const explanation = explainRecommendationReferenceResult({
      status: 'ambiguous',
      candidates: [
        resolvedResult.target!,
        {
          index: 2,
          optionId: 'rec_2',
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          criteria: { month: '2026-07' },
          criteriaHash: 'hash',
          pricePerDay: 62000,
        },
      ],
      reasons: ['multiple_feature_reference_matches'],
    })

    expect(explanation.status).toBe('ambiguous')
    expect(explanation.target).toBeUndefined()
    expect(explanation.communicationAction).toBe('ask_clarification')
    expect(explanation.candidates).toEqual([
      {
        optionId: 'rec_1',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        shownIndex: 1,
      },
      {
        optionId: 'rec_2',
        camperSlug: 'hymer-ayers-rock',
        camperName: 'Hymer Ayers Rock',
        shownIndex: 2,
      },
    ])
    expect(JSON.stringify(explanation)).not.toContain('pricePerDay')
  })

  it('creates a not_found explanation without target or candidates', () => {
    const explanation = explainRecommendationReferenceResult({
      status: 'not_found',
      reasons: ['no_feature_reference_match'],
    })

    expect(explanation).toEqual({
      status: 'not_found',
      target: undefined,
      candidates: undefined,
      compatibility: undefined,
      reasons: ['no_feature_reference_match'],
      communicationAction: 'say_not_found',
      safeForGpt: true,
    })
  })

  it('does not mutate the resolver result', () => {
    const before = structuredClone(resolvedResult)

    explainRecommendationReferenceResult(resolvedResult)

    expect(resolvedResult).toEqual(before)
  })
})
