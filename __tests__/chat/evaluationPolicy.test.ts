import { describe, expect, it } from 'vitest'
import {
  EVALUATION_SCORE_POLICY,
  HARD_CAPABILITY_THRESHOLD,
  HARD_FAILURE_LABELS,
  MAX_EVALUATION_BRANCHES,
  MAX_SOFT_CAPABILITY_POINTS,
  MIN_RENTAL_DAYS,
} from '@/lib/chat/evaluationPolicy'

describe('evaluation policy contract', () => {
  it('keeps product-owned evaluation constants stable', () => {
    expect(MAX_EVALUATION_BRANCHES).toBe(3)
    expect(MIN_RENTAL_DAYS).toBe(3)
    expect(HARD_CAPABILITY_THRESHOLD).toBe(0.8)
    expect(MAX_SOFT_CAPABILITY_POINTS).toBe(12)
  })

  it('documents the current score policy without changing scoring behavior', () => {
    expect(EVALUATION_SCORE_POLICY).toEqual({
      capacity: {
        key: 'capacity',
        label: 'Megfelel a létszámnak',
        points: 20,
      },
      priceAvailable: {
        key: 'price_available',
        label: 'Van számolható szezonár',
        points: 8,
      },
      featureMatch: {
        key: 'feature_match',
        label: 'Illeszkedik megadott felszereltségi preferenciához',
        pointsPerMatchedFeature: 6,
        maxPoints: 18,
      },
      attributeMatch: {
        key: 'attribute_match',
        label: 'Illeszkedik megadott járműattribútum preferenciához',
        pointsPerMatchedAttribute: 6,
        maxPoints: 12,
      },
      pricingPreferenceMatch: {
        key: 'pricing_preference_match',
        label: 'Illeszkedik megadott árpreferenciához',
        points: 10,
      },
      capabilityMatch: {
        key: 'capability_match',
        label: 'Illeszkedik megadott használati célhoz',
        maxPoints: 12,
      },
    })
  })

  it('keeps hard failure labels backend-owned', () => {
    expect(HARD_FAILURE_LABELS).toEqual(
      expect.objectContaining({
        capacity: 'Kevesebb fekvőhely van, mint az utasok száma',
        feature_requirement: 'Hiányzik kötelezően kért felszereltség',
        attribute_requirement: 'Nem teljesíti a kötelezően kért járműattribútumot',
        pricing_budget: 'Nem teljesíti a megadott árkeretet',
        capability_requirement: 'Nem éri el a kötelezően kért használati célhoz szükséges megfelelési szintet',
      }),
    )
  })
})
