import { describe, expect, it } from 'vitest'
import {
  buildEvaluationNoResultDiagnostics,
  explainCamperEvaluation,
} from '@/lib/chat/evaluationExplainability'
import type { CamperEvaluation, CamperEvaluationResult } from '@/lib/chat/evaluation'

const baseEvaluation: CamperEvaluation = {
  camperId: 'camper-1',
  camperSlug: 'atlas',
  camperName: 'Atlas',
  status: 'eligible',
  score: 34,
  hardFailures: [],
  scoreBreakdown: [
    { key: 'capacity', label: 'Megfelel a létszámnak', points: 20 },
    { key: 'feature_match', label: 'Illeszkedik megadott felszereltségi preferenciához', points: 6 },
    {
      key: 'capability_match',
      label: 'Illeszkedik megadott használati célhoz',
      points: 8,
      capabilityKey: 'off_grid',
      score: 0.66,
      matchedWeight: 20,
      totalWeight: 30,
    },
  ],
  capabilityMatches: [
    {
      capabilityKey: 'off_grid',
      strength: 'soft',
      score: 0.66,
      matchedWeight: 20,
      totalWeight: 30,
      matchedFeatures: ['solar_panel'],
      missingFeatures: ['cassette_wc', 'water_filter'],
    },
  ],
  capabilityExplanations: [],
  featureExplanations: [],
  capabilityFeatureExplanations: [],
  pricing: {
    status: 'priced',
    seasonName: 'Főszezon',
    pricePerDay: 50000,
    durationDays: 7,
    subtotal: 350000,
    discountPercent: 0,
    discountAmount: 0,
    total: 350000,
  },
  availableSlots: [],
  featureKeys: ['solar_panel'],
  attributeFacts: { beds: 4, type: 'Alkóvos', gearbox: 'Automata', year: 2024 },
  imageUrl: '/atlas.jpg',
  type: 'Alkóvos',
  beds: 4,
}

describe('evaluation explainability contract', () => {
  it('projects camper evaluation facts without creating a new truth source', () => {
    expect(explainCamperEvaluation(baseEvaluation)).toEqual({
      source: 'evaluation_engine',
      camperSlug: 'atlas',
      camperName: 'Atlas',
      status: 'eligible',
      eligible: true,
      score: 34,
      hardFailures: [],
      scoreReasons: [
        { key: 'capacity', label: 'Megfelel a létszámnak', points: 20 },
        {
          key: 'feature_match',
          label: 'Illeszkedik megadott felszereltségi preferenciához',
          points: 6,
        },
        {
          key: 'capability_match',
          label: 'Illeszkedik megadott használati célhoz',
          points: 8,
          capabilityKey: 'off_grid',
          score: 0.66,
          matchedWeight: 20,
          totalWeight: 30,
        },
      ],
      pricing: {
        status: 'priced',
        seasonName: 'Főszezon',
        pricePerDay: 50000,
        durationDays: 7,
        subtotal: 350000,
        discountPercent: 0,
        discountAmount: 0,
        total: 350000,
      },
      capabilitySummary: [
        {
          capabilityKey: 'off_grid',
          strength: 'soft',
          score: 0.66,
          matchedWeight: 20,
          totalWeight: 30,
          matchedFeatureCount: 1,
          missingFeatureCount: 2,
        },
      ],
    })
  })

  it('summarizes no-result diagnostics from hard failures deterministically', () => {
    const failedCapacity: CamperEvaluation = {
      ...baseEvaluation,
      camperId: 'camper-2',
      camperSlug: 'small',
      camperName: 'Small',
      status: 'currently_not_eligible',
      score: null,
      hardFailures: [{ key: 'capacity', label: 'Kevesebb fekvőhely van, mint az utasok száma' }],
      scoreBreakdown: [],
    }
    const failedFeature: CamperEvaluation = {
      ...baseEvaluation,
      camperId: 'camper-3',
      camperSlug: 'basic',
      camperName: 'Basic',
      status: 'currently_not_eligible',
      score: null,
      hardFailures: [{ key: 'feature_requirement', label: 'Hiányzik kötelezően kért felszereltség' }],
      scoreBreakdown: [],
    }
    const result: CamperEvaluationResult = {
      evaluations: [failedCapacity, failedFeature],
      topRecommendations: [],
      branchSummary: [],
      branches: [],
      pricingSummary: { pricedCount: 0, missingPriceCount: 0 },
      discountOpportunities: [],
      explanationContext: {
        hardConstraintKeys: ['capacity', 'feature_requirement'],
        softScoringKeys: [],
      },
    }

    expect(buildEvaluationNoResultDiagnostics(result)).toEqual({
      source: 'evaluation_engine',
      totalEvaluated: 2,
      eligibleCount: 0,
      failCounts: {
        capacity: 1,
        availability: 0,
        duration_availability: 0,
        feature_requirement: 1,
        attribute_requirement: 0,
        pricing_budget: 0,
        capability_requirement: 0,
      },
      dominantFailureKeys: ['capacity', 'feature_requirement'],
    })
  })
})
