import { describe, expect, it, vi } from 'vitest'
import type { CamperResult } from '@/lib/chat/availability'
import type { CamperEvaluationResult } from '@/lib/chat/evaluation'

const mockEvaluateCampers = vi.hoisted(() => vi.fn())

vi.mock('@/lib/chat/evaluation', () => {
  return {
    evaluateCampers: (...args: any[]) => mockEvaluateCampers(...args),
  }
})

import {
  buildRecommendationProjection,
  runRecommendationEvaluation,
} from '@/lib/chat/recommendationPipeline'

function camper(slug: string, price = 35000): CamperResult {
  return {
    slug,
    name: slug,
    image_url: `${slug}.jpg`,
    price_per_day: price,
    type: 'Alkóvos',
    beds: 4,
    availableSlots: [{ from: '2026-08-01', to: '2026-08-07', days: 7 }],
  }
}

function evaluationResult(slugs: string[]): CamperEvaluationResult {
  const evaluations = slugs.map((slug, index) => ({
    camperId: `id-${slug}`,
    camperSlug: slug,
    camperName: slug,
    status: 'eligible',
    score: 100 - index,
    hardFailures: [],
    scoreBreakdown: [{ key: 'base', label: 'Base fit', points: 10 }],
    capabilityMatches: [],
    capabilityExplanations: [],
    featureExplanations: [],
    capabilityFeatureExplanations: [],
    pricing: {
      status: 'priced',
      pricePerDay: 40000 - index * 1000,
      total: 280000,
    },
    availableSlots: [{ from: '2026-08-01', to: '2026-08-07', days: 7 }],
    featureKeys: ['solar_panel'],
    attributeFacts: { beds: 4, type: 'Alkóvos' },
    imageUrl: `${slug}.jpg`,
    type: 'Alkóvos',
    beds: 4,
  }))

  return {
    evaluations,
    topRecommendations: evaluations,
    branchSummary: [],
    branches: [],
    pricingSummary: { pricedCount: evaluations.length, missingPriceCount: 0 },
    discountOpportunities: [],
    explanationContext: {
      hardConstraintKeys: [],
      softScoringKeys: ['base'],
    },
  } as CamperEvaluationResult
}

describe('recommendationPipeline', () => {
  it('runs Evaluation Engine in recommend mode and returns success status', async () => {
    mockEvaluateCampers.mockResolvedValueOnce(evaluationResult(['engine-top']))

    const result = await runRecommendationEvaluation({
      effectiveMode: 'recommend',
      state: { intent: 'recommendation' },
      refinementReferenceBlocked: false,
    })

    expect(mockEvaluateCampers).toHaveBeenCalledWith({ intent: 'recommendation' })
    expect(result.evaluationStatus).toBe('success')
    expect(result.evaluationResult?.topRecommendations[0]?.camperSlug).toBe('engine-top')
  })

  it('returns no_results without invoking legacy fallback when engine has no top recommendations', async () => {
    mockEvaluateCampers.mockResolvedValueOnce(evaluationResult([]))

    const result = await runRecommendationEvaluation({
      effectiveMode: 'recommend',
      state: { intent: 'recommendation' },
      refinementReferenceBlocked: false,
    })

    expect(result.evaluationStatus).toBe('no_results')
    expect(result.evaluationResult?.topRecommendations).toEqual([])
  })

  it('returns failed_fallback_used explicitly when Evaluation Engine throws', async () => {
    const onError = vi.fn()
    mockEvaluateCampers.mockRejectedValueOnce(new Error('engine down'))

    const result = await runRecommendationEvaluation({
      effectiveMode: 'recommend',
      state: { intent: 'recommendation' },
      refinementReferenceBlocked: false,
      onError,
    })

    expect(result).toEqual({ evaluationStatus: 'failed_fallback_used' })
    expect(onError).toHaveBeenCalled()
  })

  it('does not run Evaluation Engine outside recommend mode or when reference refinement is blocked', async () => {
    mockEvaluateCampers.mockClear()

    await expect(runRecommendationEvaluation({
      effectiveMode: 'availability',
      state: { intent: 'availability' },
      refinementReferenceBlocked: false,
    })).resolves.toEqual({})

    await expect(runRecommendationEvaluation({
      effectiveMode: 'recommend',
      state: { intent: 'recommendation' },
      refinementReferenceBlocked: true,
    })).resolves.toEqual({})

    expect(mockEvaluateCampers).not.toHaveBeenCalled()
  })

  it('uses engine topRecommendations as the display and allowed source in recommend mode', () => {
    const projection = buildRecommendationProjection({
      effectiveMode: 'recommend',
      state: {},
      stateUpdate: {},
      evaluationResult: evaluationResult(['engine-top']),
      camperResults: [camper('legacy-camper')],
    })

    expect(projection.enginePrimaryRecommendations).toBe(true)
    expect(projection.displayResults.map(item => item.slug)).toEqual(['engine-top'])
    expect([...projection.allowedSlugs]).toEqual(['engine-top'])
    expect(projection.backendSelectedRecommendations?.map(item => item.slug)).toEqual(['engine-top'])
  })

  it('does not leak legacy search results when the engine has no top recommendations', () => {
    const projection = buildRecommendationProjection({
      effectiveMode: 'recommend',
      state: {},
      stateUpdate: {},
      evaluationResult: evaluationResult([]),
      camperResults: [camper('legacy-camper')],
    })

    expect(projection.enginePrimaryRecommendations).toBe(true)
    expect(projection.displayResults).toEqual([])
    expect([...projection.allowedSlugs]).toEqual([])
    expect(projection.noResultReasonSummary).toEqual(expect.objectContaining({
      capacityFailCount: 0,
      availabilityFailCount: 0,
      durationFailCount: 0,
    }))
  })

  it('creates no-more-options note when all engine recommendations were already shown', () => {
    const projection = buildRecommendationProjection({
      effectiveMode: 'recommend',
      state: { alreadyRecommendedSlugs: ['engine-top'] },
      stateUpdate: {},
      evaluationResult: evaluationResult(['engine-top']),
      camperResults: [],
    })

    expect(projection.displayResults).toEqual([])
    expect(projection.refinementNote).toContain('NINCS TÖBB OPCIÓ')
  })

  it('keeps legacy fallback refinement isolated when no evaluation result exists', () => {
    const projection = buildRecommendationProjection({
      effectiveMode: 'recommend',
      state: {
        alreadyRecommendedSlugs: ['already-shown'],
        lastShownPrice: 36000,
      },
      stateUpdate: {
        refinementIntent: { intent: 'cheaper', sourceText: 'olcsóbbat' },
      },
      camperResults: [
        camper('already-shown', 30000),
        camper('too-expensive', 37000),
        camper('cheaper-option', 32000),
      ],
    })

    expect(projection.enginePrimaryRecommendations).toBe(false)
    expect(projection.displayResults.map(item => item.slug)).toEqual(['cheaper-option'])
    expect([...projection.allowedSlugs]).toEqual(['cheaper-option'])
    expect(projection.refinementNote).toContain('allowedCamperSlugs')
  })

  it('does not filter availability mode results as recommendations', () => {
    const projection = buildRecommendationProjection({
      effectiveMode: 'availability',
      state: { alreadyRecommendedSlugs: ['shown'] },
      stateUpdate: {},
      camperResults: [camper('shown'), camper('available')],
    })

    expect(projection.enginePrimaryRecommendations).toBe(false)
    expect(projection.displayResults.map(item => item.slug)).toEqual(['shown', 'available'])
    expect([...projection.allowedSlugs]).toEqual(['shown', 'available'])
  })
})
