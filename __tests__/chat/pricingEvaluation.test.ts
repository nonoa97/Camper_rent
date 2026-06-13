import { describe, expect, it, vi } from 'vitest'

import type { CamperFact, EvaluationFacts } from '@/lib/chat/evaluationFacts'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

import {
  buildDiscountOpportunity,
  calculatePricing,
  evaluatePricingPreferenceRequirement,
  resolveSeason,
  scorePricingPreference,
} from '@/lib/chat/pricingEvaluation'

const camper: CamperFact = {
  id: 'camper-1',
  slug: 'camper-one',
  name: 'Camper One',
  imageUrl: '/camper.jpg',
  type: 'Camper van',
  gearbox: 'Automata',
  fuelType: 'Dizel',
  year: 2024,
  beds: 4,
  features: [],
  featureKeys: new Set(),
}

function createFacts(overrides: Partial<EvaluationFacts> = {}): EvaluationFacts {
  return {
    campers: [camper],
    bookingsByCamperId: { [camper.id]: [] },
    pricesByCamperSeason: { [camper.id]: { peak: 50000 } },
    seasons: [
      { id: 'peak', name: 'Foszezon', fromMd: '06-01', toMd: '08-31', sortOrder: 1 },
      { id: 'winter', name: 'Tel', fromMd: '12-01', toMd: '02-28', sortOrder: 2 },
    ],
    discounts: [{ minDays: 14, discountPercent: 10, active: true }],
    globalDiscountsActive: true,
    featureDisplayNames: {},
    ...overrides,
  }
}

describe('pricing evaluation', () => {
  it('resolves regular and year-wrapping seasons', () => {
    const facts = createFacts()

    expect(resolveSeason(facts.seasons, '2026-07-10')?.id).toBe('peak')
    expect(resolveSeason(facts.seasons, '2026-01-10')?.id).toBe('winter')
  })

  it('calculates seasonal pricing with active duration discount', () => {
    expect(calculatePricing(createFacts(), camper, {
      month: '2026-07',
      durationDays: 14,
    })).toEqual({
      status: 'priced',
      seasonId: 'peak',
      seasonName: 'Foszezon',
      pricePerDay: 50000,
      durationDays: 14,
      subtotal: 700000,
      discountPercent: 10,
      discountAmount: 70000,
      total: 630000,
    })
  })

  it('returns missing_price when the season has no camper price', () => {
    expect(calculatePricing(createFacts({
      pricesByCamperSeason: { [camper.id]: {} },
    }), camper, {
      month: '2026-07',
      durationDays: 7,
    })).toEqual({
      status: 'missing_price',
      seasonId: 'peak',
      seasonName: 'Foszezon',
      durationDays: 7,
    })
  })

  it('builds discount opportunity only when longer duration has availability and pricing', () => {
    expect(buildDiscountOpportunity(createFacts(), camper, {
      month: '2026-07',
      durationDays: 13,
    }, [
      { from: '2026-07-01', to: '2026-07-20', days: 20 },
    ])).toEqual({
      type: 'duration_discount_opportunity',
      currentDurationDays: 13,
      suggestedDurationDays: 14,
      discountPercent: 10,
      availabilityConfirmed: true,
      pricingCalculated: true,
    })
  })

  it('creates hard budget failure when known price is over limit', () => {
    const pricing = calculatePricing(createFacts(), camper, {
      month: '2026-07',
      durationDays: 14,
    })

    expect(evaluatePricingPreferenceRequirement(pricing, {
      pricingPreference: {
        intent: 'budget_limit',
        amount: 500000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 500000',
      },
    })).toEqual([
      {
        key: 'pricing_budget',
        label: 'Nem teljesíti a megadott árkeretet',
        budgetAmount: 500000,
        actualPrice: 630000,
      },
    ])
  })

  it('creates hard budget failure when price is missing', () => {
    expect(evaluatePricingPreferenceRequirement({
      status: 'missing_price',
      durationDays: 7,
    }, {
      pricingPreference: {
        intent: 'budget_limit',
        amount: 300000,
        currency: 'HUF',
        strength: 'hard',
        sourceText: 'max 300000',
      },
    })).toEqual([
      {
        key: 'pricing_budget',
        label: 'Nem teljesíti a megadott árkeretet',
        budgetAmount: 300000,
        actualPrice: null,
      },
    ])
  })

  it('scores soft budget preference when price is under limit', () => {
    expect(scorePricingPreference({
      status: 'priced',
      total: 245000,
    }, {
      pricingPreference: {
        intent: 'budget_limit',
        amount: 300000,
        currency: 'HUF',
        strength: 'soft',
        sourceText: 'jó lenne 300000 alatt',
      },
    })).toEqual([
      {
        key: 'pricing_preference_match',
        label: 'Illeszkedik megadott árpreferenciához',
        points: 10,
        budgetAmount: 300000,
        actualPrice: 245000,
      },
    ])
  })
})
