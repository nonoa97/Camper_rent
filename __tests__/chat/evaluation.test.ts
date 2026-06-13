import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseCalls: Array<{ table: string; method: string; args: unknown[] }> = []

const campers = [
  {
    id: 'large-id',
    slug: 'large-camper',
    name: 'Large Camper',
    image_url: '/fallback-large.jpg',
    type: 'Alkóvos',
    gearbox: 'Automata',
    fuel_type: 'Dízel',
    beds: 4,
    wild_camping_suitable: true,
    camper_images: [{ url: '/large-primary.jpg', sort_order: 0 }],
    camper_features: [
      { features: { key: 'solar_panel', name: 'Renamed solar display label' } },
      { features: { key: 'leisure_battery', name: 'Leisure battery renamed' } },
      { features: { key: 'lithium_battery', name: 'Lithium renamed' } },
      { features: { key: 'freshwater_tank', name: 'Freshwater renamed' } },
      { features: { key: 'inverter', name: 'Inverter renamed' } },
      { features: { key: 'socket_230v', name: 'Socket renamed' } },
      { features: { key: 'charge_controller', name: 'Charge controller renamed' } },
      { features: { key: 'gas_cylinder', name: 'Gas cylinder renamed' } },
      { features: { key: 'diesel_heater', name: 'Diesel heater renamed' } },
      { features: { key: 'greywater_tank', name: 'Greywater renamed' } },
      { features: { key: 'external_socket_230v', name: 'External socket renamed' } },
      { features: { key: 'water_level_indicator', name: 'Water level renamed' } },
      { features: { key: 'water_filter', name: 'Water filter renamed' } },
    ],
  },
  {
    id: 'small-id',
    slug: 'small-camper',
    name: 'Small Camper',
    image_url: '/fallback-small.jpg',
    type: 'Camper van',
    gearbox: 'Manuális',
    fuel_type: 'Dízel',
    beds: 2,
    wild_camping_suitable: false,
    camper_images: [{ url: '/small-primary.jpg', sort_order: 0 }],
    camper_features: [{ features: { key: 'cassette_wc', name: 'Renamed toilet display label' } }],
  },
]

const prices = [
  { camper_id: 'large-id', season_id: 'peak', price: 50000 },
  { camper_id: 'small-id', season_id: 'peak', price: 35000 },
]

const seasons = [
  { id: 'peak', name: 'Főszezon', from_md: '06-01', to_md: '08-31', sort_order: 1 },
]

let bookings: any[] = []
let discounts = [
  { min_days: 14, discount_pct: 10, active: true, sort_order: 1 },
]
let globalDiscountValue = 'true'

function makeBuilder(table: string, data: unknown) {
  const builder: Record<string, unknown> = {
    data,
    error: null,
  }
  for (const method of ['select', 'eq', 'order', 'single', 'lt', 'gt']) {
    builder[method] = (...args: unknown[]) => {
      supabaseCalls.push({ table, method, args })
      return builder
    }
  }
  return builder
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      supabaseCalls.push({ table, method: 'from', args: [] })
      if (table === 'campers') return makeBuilder(table, campers)
      if (table === 'camper_prices') return makeBuilder(table, prices)
      if (table === 'seasons') return makeBuilder(table, seasons)
      if (table === 'long_stay_tiers') return makeBuilder(table, discounts)
      if (table === 'app_settings') return makeBuilder(table, { value: globalDiscountValue })
      if (table === 'bookings') return makeBuilder(table, bookings)
      return makeBuilder(table, [])
    },
  },
}))

import { evaluateCampers, HARD_CAPABILITY_THRESHOLD } from '@/lib/chat/evaluation'
import {
  buildBackendSelectedRecommendations,
  buildNoResultReasonSummary,
  selectedRecommendationsToCamperResults,
} from '@/lib/chat/evaluationContext'
import { calculateCapabilityMatch, getCapabilityDefinition } from '@/lib/chat/capabilities'

beforeEach(() => {
  supabaseCalls.length = 0
  bookings = []
  discounts = [{ min_days: 14, discount_pct: 10, active: true, sort_order: 1 }]
  globalDiscountValue = 'true'
})

describe('Camper Evaluation Engine', () => {
  it('keeps the hard capability threshold locked at the product-defined 0.8 value', () => {
    expect(HARD_CAPABILITY_THRESHOLD).toBe(0.8)
  })

  it('calculates capability score from matchedWeight / totalWeight generically', () => {
    const definition = getCapabilityDefinition('off_grid')

    expect(definition).toBeDefined()
    expect(calculateCapabilityMatch(
      ['solar_panel', 'lithium_battery', 'inverter'],
      definition!,
    )).toEqual({
      capabilityKey: 'off_grid',
      score: 8 / 30,
      matchedWeight: 8,
      totalWeight: 30,
      matchedFeatures: ['solar_panel', 'lithium_battery', 'inverter'],
      missingFeatures: [
        'leisure_battery',
        'freshwater_tank',
        'cassette_wc',
        'socket_230v',
        'charge_controller',
        'gas_cylinder',
        'diesel_heater',
        'greywater_tank',
        'external_socket_230v',
        'water_level_indicator',
        'water_filter',
      ],
    })
  })

  it('derives capacity hard fail from current state only', async () => {
    const fourPerson = await evaluateCampers({ passengers: 4 })
    const smallForFour = fourPerson.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(smallForFour?.status).toBe('currently_not_eligible')
    expect(smallForFour?.hardFailures).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'capacity' })]),
    )

    const twoPerson = await evaluateCampers({ passengers: 2 })
    const smallForTwo = twoPerson.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(smallForTwo?.status).toBe('eligible')
  })

  it('treats booking end_date as checkout day and available on that date', async () => {
    bookings = [{
      camper_id: 'large-id',
      start_date: '2026-07-01',
      end_date: '2026-07-13',
      status: 'confirmed',
    }]

    const result = await evaluateCampers({
      startDate: '2026-07-13',
      endDate: '2026-07-20',
      durationDays: 8,
      passengers: 4,
    })
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(large?.status).toBe('eligible')
    expect(large?.availableSlots).toEqual([
      { from: '2026-07-13', to: '2026-07-20', days: 8 },
    ])
  })

  it('calculates seasonal pricing and active duration discount in backend', async () => {
    const result = await evaluateCampers({
      month: '2026-07',
      durationDays: 14,
      passengers: 4,
    })
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(large?.pricing).toEqual(
      expect.objectContaining({
        status: 'priced',
        seasonId: 'peak',
        pricePerDay: 50000,
        subtotal: 700000,
        discountPercent: 10,
        discountAmount: 70000,
        total: 630000,
      }),
    )
  })

  it('does not project missing evaluation pricing as a fake zero price', () => {
    const evaluation = {
      camperSlug: 'missing-price-camper',
      camperName: 'Missing Price Camper',
      scoreBreakdown: [],
      hardFailures: [],
      pricing: { status: 'missing_price' },
      imageUrl: '/missing.jpg',
      score: 10,
      type: 'Camper van',
      beds: 2,
      availableSlots: [],
      featureKeys: [],
      attributeFacts: { beds: 2, type: 'Camper van' },
      capabilityMatches: [],
      featureExplanations: [],
      capabilityExplanations: [],
      capabilityFeatureExplanations: [],
    } as any
    const result = {
      topRecommendations: [evaluation],
      branches: [],
    } as any

    const [recommendation] = buildBackendSelectedRecommendations(result)
    const [camperResult] = selectedRecommendationsToCamperResults([recommendation])

    expect(recommendation.pricePerDay).toBeUndefined()
    expect(camperResult.price_per_day).toBeNull()
  })

  it('hard budget pricingPreference excludes campers over the budget limit', async () => {
    const result = await evaluateCampers({
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      pricingPreference: {
        intent: 'budget_limit',
        amount: 300000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 300000',
      },
    })

    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(large?.hardFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'pricing_budget',
          budgetAmount: 300000,
          actualPrice: 350000,
        }),
      ]),
    )
    expect(small?.status).toBe('eligible')
  })

  it('hard budget pricingPreference does not silently pass missing price', async () => {
    const result = await evaluateCampers({
      month: '2026-12',
      durationDays: 7,
      passengers: 2,
      pricingPreference: {
        intent: 'budget_limit',
        amount: 300000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 300000',
      },
    })

    expect(result.evaluations.every(evaluation =>
      evaluation.hardFailures.some(failure => failure.key === 'pricing_budget' && failure.actualPrice == null),
    )).toBe(true)
    expect(buildNoResultReasonSummary(result)).toEqual(
      expect.objectContaining({
        pricingBudgetFailCount: 2,
      }),
    )
  })

  it('soft budget pricingPreference adds score when price is under limit', async () => {
    const result = await evaluateCampers({
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      pricingPreference: {
        intent: 'budget_limit',
        amount: 300000,
        currency: 'HUF',
        strength: 'soft',
        sourceText: 'jó lenne 300000 alatt',
      },
    })

    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(small?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'pricing_preference_match', budgetAmount: 300000, actualPrice: 245000 }),
      ]),
    )
    expect(large?.scoreBreakdown).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'pricing_preference_match' })]),
    )
  })

  it('cheaper pricingPreference ranks lower priced eligible campers first', async () => {
    const result = await evaluateCampers({
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      pricingPreference: {
        intent: 'cheaper',
        strength: 'soft',
        sourceText: 'olcsóbbat',
      },
    })

    expect(result.topRecommendations[0]?.camperSlug).toBe('small-camper')
  })

  it('cheaper pricingPreference with reference price excludes non-cheaper campers', async () => {
    const result = await evaluateCampers({
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      pricingPreference: {
        intent: 'cheaper',
        strength: 'soft',
        sourceText: 'olcsóbbat',
        referencePricePerDay: 50000,
      },
    })

    expect(result.topRecommendations.map(item => item.camperSlug)).not.toContain('large-camper')
    expect(result.evaluations.find(item => item.camperSlug === 'large-camper')?.hardFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'pricing_budget',
          budgetAmount: 50000,
        }),
      ]),
    )
  })

  it('exposes discount opportunity only when longer duration has availability and pricing', async () => {
    const result = await evaluateCampers({
      month: '2026-07',
      durationDays: 13,
      passengers: 4,
    })

    expect(result.discountOpportunities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          camperSlug: 'large-camper',
          currentDurationDays: 13,
          suggestedDurationDays: 14,
          discountPercent: 10,
          availabilityConfirmed: true,
          pricingCalculated: true,
        }),
      ]),
    )
  })

  it('runs flexible month criteria as separate branches with independent evaluation', async () => {
    const result = await evaluateCampers({
      durationDays: 7,
      passengers: 2,
      flexibleCriteria: { months: ['2026-07', '2026-08'] },
    })

    expect(result.branches).toHaveLength(2)
    expect(result.branchSummary.map(branch => branch.label)).toEqual(['2026-07', '2026-08'])
    expect(result.branchSummary.every(branch => branch.eligibleCount > 0)).toBe(true)
  })

  it('hard featurePreferences create hard failure when camper feature key is missing', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell saját wc', detectedLocale: 'hu' },
      ],
    })

    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(large?.status).toBe('currently_not_eligible')
    expect(large?.hardFailures).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'feature_requirement' })]),
    )
    expect(small?.status).toBe('eligible')
  })

  it('hard attributePreferences create hard failure when camper attribute is missing', async () => {
    const result = await evaluateCampers({
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'hard', sourceText: 'automata váltó' },
      ],
    })

    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(small?.status).toBe('currently_not_eligible')
    expect(small?.hardFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'attribute_requirement',
          attributeKey: 'gearbox',
          expectedValue: 'Automata',
          actualValue: 'Manuális',
        }),
      ]),
    )
    expect(large?.status).toBe('eligible')
  })

  it('hard beds attributePreferences use numeric operators', async () => {
    const result = await evaluateCampers({
      attributePreferences: [
        { key: 'beds', value: 4, operator: 'gte', strength: 'hard', sourceText: 'legalább 4 fekhely' },
      ],
    })

    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(small?.hardFailures).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'attribute_requirement', attributeKey: 'beds' })]),
    )
    expect(large?.hardFailures).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'attribute_requirement' })]),
    )
  })

  it('soft attributePreferences add score without hard failure when matched', async () => {
    const result = await evaluateCampers({
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'soft', sourceText: 'jó lenne automata' },
      ],
    })

    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(large?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'attribute_match', attributeKey: 'gearbox', points: 6 }),
      ]),
    )
    expect(small?.hardFailures).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'attribute_requirement' })]),
    )
    expect(small?.scoreBreakdown).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'attribute_match' })]),
    )
  })

  it('noResultReasonSummary includes attributeRequirementFailCount', async () => {
    const result = await evaluateCampers({
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'hard', sourceText: 'automata váltó' },
      ],
    })

    expect(buildNoResultReasonSummary(result)).toEqual(
      expect.objectContaining({
        attributeRequirementFailCount: 1,
      }),
    )
  })

  it('hard featurePreferences keep eligible camper eligible when feature key exists', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell saját wc', detectedLocale: 'hu' },
      ],
      passengers: 2,
    })

    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(small?.status).toBe('eligible')
    expect(small?.hardFailures).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'feature_requirement' })]),
    )
  })

  it('soft featurePreferences add score bonus when feature key exists', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'solar_panel', strength: 'soft', sourceText: 'jó lenne napelem', detectedLocale: 'hu' },
      ],
    })

    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(large?.scoreBreakdown).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'feature_match', points: 6 })]),
    )
    expect(small?.hardFailures).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'feature_requirement' })]),
    )
    expect(small?.scoreBreakdown).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'feature_match' })]),
    )
  })

  it('feature display name changes do not affect canonical feature key scoring', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'solar_panel', strength: 'soft', sourceText: 'solar panel', detectedLocale: 'en' },
      ],
    })

    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(large?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'feature_match',
          label: 'Illeszkedik megadott felszereltségi preferenciához',
        }),
      ]),
    )
  })

  it('legacy raw preference strings do not override canonical featurePreference decisions', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell saját wc', detectedLocale: 'hu' },
      ],
      extraRequirements: ['Renamed solar display label'],
      softPreferences: ['Renamed solar display label'],
    })

    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(large?.status).toBe('currently_not_eligible')
    expect(large?.hardFailures).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'feature_requirement' })]),
    )
    expect(large?.scoreBreakdown ?? []).toEqual([])
    expect(small?.status).toBe('eligible')
  })

  it('noResultReasonSummary includes featureRequirementFailCount', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell saját wc', detectedLocale: 'hu' },
      ],
    })

    expect(buildNoResultReasonSummary(result)).toEqual(
      expect.objectContaining({
        featureRequirementFailCount: 1,
      }),
    )
  })

  it('projects backend-owned feature explainability for selected recommendations', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'solar_panel', strength: 'soft', sourceText: 'jó lenne napelem', detectedLocale: 'hu' },
      ],
    })

    const recommendations = buildBackendSelectedRecommendations(result)
    const large = recommendations.find(recommendation => recommendation.slug === 'large-camper')

    expect(large?.featureExplainability).toEqual(
      expect.objectContaining({
        camperSlug: 'large-camper',
        camperName: 'Large Camper',
        featureExplanations: expect.arrayContaining([
          expect.objectContaining({
            kind: 'soft_preference_matched',
            featureKey: 'solar_panel',
            displayName: 'Renamed solar display label',
            sourceText: 'jó lenne napelem',
            strength: 'soft',
            points: 6,
          }),
        ]),
        scoreExplanations: expect.arrayContaining([
          expect.objectContaining({
            key: 'feature_match',
            relatedFeatureKeys: ['solar_panel'],
          }),
        ]),
      }),
    )
  })

  it('noResultReasonSummary includes feature-level missing hard requirement details', async () => {
    const result = await evaluateCampers({
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell saját wc', detectedLocale: 'hu' },
      ],
    })

    expect(buildNoResultReasonSummary(result)?.featureNoResultExplanation).toEqual(
      expect.objectContaining({
        featureRequirementFailCount: 1,
        missingHardFeatures: [
          {
            featureKey: 'cassette_wc',
            displayName: 'Renamed toilet display label',
            sourceText: 'kell saját wc',
            affectedCamperCount: 1,
          },
        ],
        mostRestrictiveFeatures: [
          {
            featureKey: 'cassette_wc',
            displayName: 'Renamed toilet display label',
            sourceText: 'kell saját wc',
            affectedCamperCount: 1,
          },
        ],
      }),
    )
  })

  it('hard capability does not require 100 percent and passes above global threshold', async () => {
    const result = await evaluateCampers({
      passengers: 2,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'off-grid utazás', detectedLocale: 'hu' },
      ],
    })
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(large?.status).toBe('eligible')
    expect(large?.hardFailures).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'capability_requirement' })]),
    )
    expect(large?.capabilityMatches).toEqual([
      expect.objectContaining({
        capabilityKey: 'off_grid',
        strength: 'hard',
        score: 27 / 30,
        matchedWeight: 27,
        totalWeight: 30,
        missingFeatures: ['cassette_wc'],
        passedThreshold: true,
      }),
    ])
  })

  it('projects capability explainability with display names and weighted feature details', async () => {
    const result = await evaluateCampers({
      passengers: 2,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'off-grid utazás', detectedLocale: 'hu' },
      ],
    })

    const large = buildBackendSelectedRecommendations(result)
      .find(recommendation => recommendation.slug === 'large-camper')

    expect(large?.featureExplainability?.capabilityExplanations).toEqual([
      expect.objectContaining({
        capabilityKey: 'off_grid',
        capabilityDisplayName: 'Off-grid használat',
        strength: 'hard',
        score: 27 / 30,
        threshold: 0.8,
        passedThreshold: true,
        matchedWeight: 27,
        totalWeight: 30,
        explanationType: 'hard_pass',
        matchedFeatures: expect.arrayContaining([
          expect.objectContaining({
            featureKey: 'solar_panel',
            displayName: 'Renamed solar display label',
            weight: 3,
          }),
        ]),
        missingFeatures: expect.arrayContaining([
          expect.objectContaining({
            featureKey: 'cassette_wc',
            displayName: 'Renamed toilet display label',
            weight: 3,
          }),
        ]),
      }),
    ])

    expect(large?.featureExplainability?.capabilityFeatureExplanations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'capability_feature',
          status: 'matched',
          capabilityKey: 'off_grid',
          capabilityDisplayName: 'Off-grid használat',
          featureKey: 'solar_panel',
          displayName: 'Renamed solar display label',
          weight: 3,
        }),
        expect.objectContaining({
          key: 'capability_feature',
          status: 'missing',
          capabilityKey: 'off_grid',
          capabilityDisplayName: 'Off-grid használat',
          featureKey: 'cassette_wc',
          displayName: 'Renamed toilet display label',
          weight: 3,
        }),
      ]),
    )
  })

  it('hard capability fails below global threshold with explainable details', async () => {
    const result = await evaluateCampers({
      passengers: 2,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'off-grid utazás', detectedLocale: 'hu' },
      ],
    })
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(small?.status).toBe('currently_not_eligible')
    expect(small?.hardFailures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'capability_requirement',
          capabilityKey: 'off_grid',
          score: 3 / 30,
          threshold: 0.8,
          matchedWeight: 3,
          totalWeight: 30,
          missingFeatures: expect.arrayContaining(['solar_panel', 'lithium_battery', 'inverter']),
        }),
      ]),
    )
    expect(small?.capabilityMatches).toEqual([
      expect.objectContaining({
        capabilityKey: 'off_grid',
        strength: 'hard',
        matchedFeatures: ['cassette_wc'],
        passedThreshold: false,
      }),
    ])
  })

  it('soft capability never creates hard failure and adds proportional score bonus', async () => {
    const result = await evaluateCampers({
      passengers: 2,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'soft', sourceText: 'jó lenne off-grid', detectedLocale: 'hu' },
      ],
    })
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')
    const small = result.evaluations.find(e => e.camperSlug === 'small-camper')

    expect(small?.hardFailures).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'capability_requirement' })]),
    )
    expect(large?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'capability_match',
          capabilityKey: 'off_grid',
          points: 11,
          score: 27 / 30,
          matchedWeight: 27,
          totalWeight: 30,
        }),
      ]),
    )
    expect(small?.scoreBreakdown).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: 'capability_match',
          capabilityKey: 'off_grid',
          points: 1,
          score: 3 / 30,
          matchedWeight: 3,
          totalWeight: 30,
        }),
      ]),
    )
  })

  it('does not use legacy raw softPreferences as capability scoring input', async () => {
    const result = await evaluateCampers({
      passengers: 2,
      softPreferences: ['jó lenne off-grid'],
    })
    const large = result.evaluations.find(e => e.camperSlug === 'large-camper')

    expect(large?.capabilityMatches ?? []).toHaveLength(0)
    expect(large?.scoreBreakdown).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: 'capability_match' })]),
    )
  })

  it('noResultReasonSummary includes capabilityRequirementFailCount', async () => {
    const result = await evaluateCampers({
      passengers: 2,
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'off-grid utazás', detectedLocale: 'hu' },
      ],
    })

    expect(buildNoResultReasonSummary(result)).toEqual(
      expect.objectContaining({
        capabilityRequirementFailCount: 1,
        capabilityNoResultExplanation: expect.objectContaining({
          capabilityRequirementFailCount: 1,
          failedCapabilities: [
            expect.objectContaining({
              capabilityKey: 'off_grid',
              displayName: 'Off-grid használat',
              threshold: 0.8,
              affectedCamperCount: 1,
              averageScore: 3 / 30,
              mostCommonMissingFeatures: expect.arrayContaining([
                expect.objectContaining({
                  featureKey: 'charge_controller',
                  displayName: 'Charge controller renamed',
                  affectedCamperCount: 1,
                }),
              ]),
            }),
          ],
          mostRestrictiveCapabilities: [
            expect.objectContaining({
              capabilityKey: 'off_grid',
              displayName: 'Off-grid használat',
              threshold: 0.8,
              affectedCamperCount: 1,
              averageScore: 3 / 30,
            }),
          ],
        }),
      }),
    )
  })

  it('ignores unknown capabilityPreferences if validation did not accept them', async () => {
    const baseline = await evaluateCampers({ passengers: 2 })
    const result = await evaluateCampers({
      passengers: 2,
      capabilityPreferences: [
        { key: 'not_in_registry', strength: 'hard', sourceText: 'űrhajó mód', detectedLocale: 'hu' },
      ],
    })

    expect(result.evaluations.map(item => ({
      slug: item.camperSlug,
      status: item.status,
      hardFailures: item.hardFailures,
      scoreBreakdown: item.scoreBreakdown,
      capabilityMatches: item.capabilityMatches,
    }))).toEqual(
      baseline.evaluations.map(item => ({
        slug: item.camperSlug,
        status: item.status,
        hardFailures: item.hardFailures,
        scoreBreakdown: item.scoreBreakdown,
        capabilityMatches: [],
      })),
    )
  })
})
