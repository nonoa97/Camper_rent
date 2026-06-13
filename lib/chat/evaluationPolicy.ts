import type { HardFailureKey } from './evaluation'

export const MAX_EVALUATION_BRANCHES = 3
export const MIN_RENTAL_DAYS = 3
export const HARD_CAPABILITY_THRESHOLD = 0.8
export const MAX_SOFT_CAPABILITY_POINTS = 12

export const EVALUATION_SCORE_POLICY = {
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
    maxPoints: MAX_SOFT_CAPABILITY_POINTS,
  },
} as const

export const HARD_FAILURE_LABELS: Record<HardFailureKey, string> = {
  capacity: 'Kevesebb fekvőhely van, mint az utasok száma',
  availability: 'A megadott időszakban nincs szabad idő',
  duration_availability: 'Nincs elég hosszú folyamatos szabad időszak',
  feature_requirement: 'Hiányzik kötelezően kért felszereltség',
  attribute_requirement: 'Nem teljesíti a kötelezően kért járműattribútumot',
  pricing_budget: 'Nem teljesíti a megadott árkeretet',
  capability_requirement: 'Nem éri el a kötelezően kért használati célhoz szükséges megfelelési szintet',
}
