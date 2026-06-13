import { describe, expect, it } from 'vitest'

import { buildExplainabilityPresentationBundle } from '@/lib/chat/explainabilityPresentation'
import { buildUiExplainabilityProjection } from '@/lib/chat/uiExplainabilityProjection'
import type { BackendSelectedRecommendation, NoResultReasonSummary } from '@/lib/chat/evaluationContext'

const recommendation: BackendSelectedRecommendation = {
  slug: 'atlas',
  name: 'Atlas',
  score: 44,
  scoreBreakdown: [
    { key: 'capacity', label: 'Megfelel a létszámnak', points: 20 },
    { key: 'attribute_match', label: 'Illeszkedik megadott járműattribútum preferenciához', points: 6, attributeKey: 'gearbox' },
    { key: 'pricing_preference_match', label: 'Illeszkedik megadott árpreferenciához', points: 10, budgetAmount: 400000, actualPrice: 350000 },
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
  attributeFacts: { beds: 4, type: 'Alkóvos', gearbox: 'Automata' },
  capabilityMatches: [],
  availabilitySummary: { from: '2026-07-10', to: '2026-07-17', days: 7 },
  featureExplainability: {
    camperSlug: 'atlas',
    camperName: 'Atlas',
    featureExplanations: [{
      kind: 'soft_preference_matched',
      featureKey: 'solar_panel',
      displayName: 'Napelem',
      source: 'feature_preference',
      strength: 'soft',
      sourceText: 'jó lenne napelem',
      points: 6,
    }],
    capabilityExplanations: [{
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
    }],
    capabilityFeatureExplanations: [],
    scoreExplanations: [],
  },
}

describe('UI explainability projection', () => {
  it('builds compact UI recommendation projection from backend explainability data', () => {
    const explainabilityPresentation = buildExplainabilityPresentationBundle({
      backendSelectedRecommendations: [recommendation],
    })

    expect(buildUiExplainabilityProjection({
      backendSelectedRecommendations: [recommendation],
      explainabilityPresentation,
    })).toEqual({
      schemaVersion: 1,
      source: 'backend_explainability_projection',
      recommendationTruthSource: 'evaluation_engine',
      noResult: undefined,
      recommendations: [
        expect.objectContaining({
          slug: 'atlas',
          name: 'Atlas',
          score: 44,
          badges: expect.arrayContaining([
            { kind: 'score', label: 'Pontszám', value: 44 },
            { kind: 'price', label: 'Napidíj', value: '50 000 Ft' },
            { kind: 'price', label: 'Összesen', value: '350 000 Ft' },
            { kind: 'availability', label: 'Elérhető', value: '2026-07-10' },
          ]),
          matchedPreferences: expect.arrayContaining([
            expect.objectContaining({ kind: 'feature', key: 'solar_panel', points: 6 }),
            expect.objectContaining({ kind: 'attribute', key: 'gearbox', points: 6 }),
            expect.objectContaining({ kind: 'pricing', key: 'pricing_preference_match', points: 10 }),
            expect.objectContaining({ kind: 'capability', key: 'off_grid', score: 0.8 }),
          ]),
          capabilitySummary: [
            expect.objectContaining({
              capabilityKey: 'off_grid',
              score: 0.8,
              matchedWeight: 24,
              totalWeight: 30,
            }),
          ],
          reasons: expect.arrayContaining([
            'Megfelel a létszámnak',
            'Napelem: teljesül',
            'Off-grid használat: 80% megfelelés',
          ]),
        }),
      ],
    })
  })

  it('builds UI no-result projection including attribute and pricing counts', () => {
    const noResultReasonSummary: NoResultReasonSummary = {
      capacityFailCount: 0,
      availabilityFailCount: 0,
      durationFailCount: 0,
      wildCampingFailCount: 0,
      featureRequirementFailCount: 0,
      attributeRequirementFailCount: 2,
      pricingBudgetFailCount: 1,
      capabilityRequirementFailCount: 0,
    }
    const explainabilityPresentation = buildExplainabilityPresentationBundle({
      noResultReasonSummary,
    })

    expect(buildUiExplainabilityProjection({
      noResultReasonSummary,
      explainabilityPresentation,
    })).toEqual({
      schemaVersion: 1,
      source: 'backend_explainability_projection',
      recommendationTruthSource: 'evaluation_engine',
      recommendations: [],
      noResult: {
        failCounts: {
          capacity: 0,
          availability: 0,
          duration: 0,
          wildCamping: 0,
          featureRequirement: 0,
          attributeRequirement: 2,
          pricingBudget: 1,
          capabilityRequirement: 0,
        },
        reasons: [
          'Kötelező járműattribútum miatt több camper kiesett',
          'A megadott árkeret miatt nincs elég találat',
        ],
      },
    })
  })
})
