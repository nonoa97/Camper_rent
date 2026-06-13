import { describe, expect, it } from 'vitest'
import {
  buildExplainabilityPresentationBundle,
  buildNoResultExplanationSummary,
  buildRecommendationExplanationSummary,
} from '@/lib/chat/explainabilityPresentation'
import type { BackendSelectedRecommendation, NoResultReasonSummary } from '@/lib/chat/evaluationContext'

const recommendation: BackendSelectedRecommendation = {
  slug: 'atlas',
  name: 'Atlas',
  score: 34,
  scoreBreakdown: [
    { key: 'capacity', label: 'Megfelel a létszámnak', points: 20 },
    { key: 'feature_match', label: 'Illeszkedik megadott felszereltségi preferenciához', points: 6 },
  ],
  hardFailures: [],
  pricing: {
    status: 'priced',
    pricePerDay: 50000,
    durationDays: 7,
    subtotal: 350000,
    discountPercent: 0,
    discountAmount: 0,
    total: 350000,
  },
  imageUrl: '/atlas.jpg',
  pricePerDay: 50000,
  type: 'Alkóvos',
  beds: 4,
  availableSlots: [],
  featureKeys: ['solar_panel'],
  attributeFacts: { beds: 4, type: 'Alkóvos' },
  capabilityMatches: [],
  featureExplainability: {
    camperSlug: 'atlas',
    camperName: 'Atlas',
    featureExplanations: [
      {
        kind: 'soft_preference_matched',
        featureKey: 'solar_panel',
        displayName: 'Napelem',
        source: 'feature_preference',
        strength: 'soft',
        sourceText: 'jó lenne napelem',
        points: 6,
      },
    ],
    capabilityExplanations: [
      {
        capabilityKey: 'off_grid',
        capabilityDisplayName: 'Off-grid használat',
        strength: 'soft',
        score: 0.8,
        matchedWeight: 24,
        totalWeight: 30,
        matchedFeatures: [],
        missingFeatures: [],
        explanationType: 'soft_bonus',
        camperSlug: 'atlas',
        camperName: 'Atlas',
      },
    ],
    capabilityFeatureExplanations: [],
    scoreExplanations: [],
  },
}

describe('explainability presentation contract', () => {
  it('builds deterministic recommendation explanation items from backend-selected recommendation data', () => {
    const summary = buildRecommendationExplanationSummary(recommendation)

    expect(summary).toEqual(
      expect.objectContaining({
        slug: 'atlas',
        name: 'Atlas',
        score: 34,
      }),
    )
    expect(summary.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'recommendation_reason',
          source: 'evaluation_engine',
          message: 'Megfelel a létszámnak',
          safeForGpt: true,
        }),
        expect.objectContaining({
          kind: 'feature_match',
          source: 'feature_explainability',
          message: 'Napelem: teljesül',
          evidence: expect.objectContaining({ featureKey: 'solar_panel' }),
        }),
        expect.objectContaining({
          kind: 'capability_match',
          source: 'capability_explainability',
          message: 'Off-grid használat: 80% megfelelés',
          evidence: expect.objectContaining({ capabilityKey: 'off_grid', score: 0.8 }),
        }),
      ]),
    )
  })

  it('builds no-result explanation from aggregated backend counts and restrictive facts', () => {
    const noResult: NoResultReasonSummary = {
      capacityFailCount: 2,
      availabilityFailCount: 0,
      durationFailCount: 1,
      wildCampingFailCount: 0,
      featureRequirementFailCount: 1,
      attributeRequirementFailCount: 0,
      pricingBudgetFailCount: 0,
      capabilityRequirementFailCount: 1,
      featureNoResultExplanation: {
        featureRequirementFailCount: 1,
        missingHardFeatures: [],
        mostRestrictiveFeatures: [
          {
            featureKey: 'cassette_wc',
            displayName: 'Kazettás WC',
            sourceText: 'kell wc',
            affectedCamperCount: 1,
          },
        ],
      },
      capabilityNoResultExplanation: {
        capabilityRequirementFailCount: 1,
        failedCapabilities: [],
        mostRestrictiveCapabilities: [
          {
            capabilityKey: 'off_grid',
            displayName: 'Off-grid használat',
            threshold: 0.8,
            affectedCamperCount: 2,
            averageScore: 0.4,
          },
        ],
      },
    }

    expect(buildNoResultExplanationSummary(noResult)).toEqual({
      failCounts: {
        capacity: 2,
        availability: 0,
        duration: 1,
        wildCamping: 0,
        featureRequirement: 1,
        attributeRequirement: 0,
        pricingBudget: 0,
        capabilityRequirement: 1,
      },
      items: expect.arrayContaining([
        expect.objectContaining({
          kind: 'no_result_reason',
          message: 'Több camper kapacitás miatt kiesett',
        }),
        expect.objectContaining({
          kind: 'feature_missing',
          message: 'Kazettás WC: kötelező feltételként több campert kizárt',
        }),
        expect.objectContaining({
          kind: 'capability_missing',
          message: 'Off-grid használat: több camper nem érte el a szükséges megfelelési szintet',
        }),
      ]),
    })
  })

  it('keeps explainability bundle explicitly non-decisive', () => {
    const bundle = buildExplainabilityPresentationBundle({
      backendSelectedRecommendations: [recommendation],
      recommendationReferenceExplanation: {
        status: 'resolved',
        target: { optionId: 'option-1', camperSlug: 'atlas', camperName: 'Atlas', shownIndex: 1 },
        reasons: ['last_recommendation'],
        communicationAction: 'confirm_resolved_reference',
        safeForGpt: true,
      },
      refinementContext: {
        refinementIntent: { intent: 'cheaper', sourceText: 'olcsóbbat' },
        sourceText: 'olcsóbbat',
        stateDeltaSummary: ['pricingPreference.intent=cheaper'],
        rerunTriggered: true,
        newBackendSelectedRecommendations: ['atlas'],
      },
    })

    expect(bundle.invariants).toEqual({
      recommendationTruthSource: 'evaluation_engine',
      gptMayChooseCamper: false,
      memoryMayChooseCamper: false,
    })
    expect(bundle.reference).toEqual(
      expect.objectContaining({
        kind: 'reference_resolution',
        source: 'reference_resolver',
        message: 'resolved',
      }),
    )
    expect(bundle.refinement).toEqual(
      expect.objectContaining({
        kind: 'refinement_rerun',
        source: 'refinement_pipeline',
      }),
    )
  })
})
