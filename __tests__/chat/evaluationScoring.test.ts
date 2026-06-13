import { describe, expect, it, vi } from 'vitest'

import type { CapabilityEvaluationMatch } from '@/lib/chat/evaluation'
import type { CamperFact } from '@/lib/chat/evaluationFacts'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

import { scoreCamper } from '@/lib/chat/evaluationScoring'

function createCamper(featureKeys: string[] = [], beds = 4): CamperFact {
  return {
    id: 'camper-1',
    slug: 'camper-one',
    name: 'Camper One',
    imageUrl: '/camper.jpg',
    type: 'Camper van',
    gearbox: 'Automata',
    fuelType: 'Dizel',
    year: 2024,
    beds,
    features: featureKeys.map(key => ({ key, name: key })),
    featureKeys: new Set(featureKeys),
  }
}

describe('evaluation scoring', () => {
  it('adds capacity and priced scoring items', () => {
    expect(scoreCamper(createCamper([], 4), {
      passengers: 4,
    }, {
      status: 'priced',
      total: 100000,
    }, [])).toEqual([
      { key: 'capacity', label: 'Megfelel a létszámnak', points: 20 },
      { key: 'price_available', label: 'Van számolható szezonár', points: 8 },
    ])
  })

  it('adds soft feature score based on canonical feature key matches', () => {
    expect(scoreCamper(createCamper(['solar_panel', 'cassette_wc']), {
      featurePreferences: [
        { key: 'solar_panel', strength: 'soft', sourceText: 'napelem', detectedLocale: 'hu' },
        { key: 'cassette_wc', strength: 'soft', sourceText: 'wc', detectedLocale: 'hu' },
      ],
    }, {
      status: 'not_applicable',
    }, [])).toEqual([
      {
        key: 'feature_match',
        label: 'Illeszkedik megadott felszereltségi preferenciához',
        points: 12,
      },
    ])
  })

  it('caps soft feature score at policy max', () => {
    expect(scoreCamper(createCamper(['a', 'b', 'c', 'd']), {
      featurePreferences: [
        { key: 'a', strength: 'soft', sourceText: 'a', detectedLocale: 'hu' },
        { key: 'b', strength: 'soft', sourceText: 'b', detectedLocale: 'hu' },
        { key: 'c', strength: 'soft', sourceText: 'c', detectedLocale: 'hu' },
        { key: 'd', strength: 'soft', sourceText: 'd', detectedLocale: 'hu' },
      ],
    }, {
      status: 'not_applicable',
    }, [])).toEqual([
      {
        key: 'feature_match',
        label: 'Illeszkedik megadott felszereltségi preferenciához',
        points: 18,
      },
    ])
  })

  it('adds soft capability score proportionally', () => {
    const capabilityMatches: CapabilityEvaluationMatch[] = [{
      capabilityKey: 'off_grid',
      strength: 'soft',
      score: 0.5,
      matchedWeight: 5,
      totalWeight: 10,
      matchedFeatures: ['solar_panel'],
      missingFeatures: ['lithium_battery'],
    }]

    expect(scoreCamper(createCamper(), {}, { status: 'not_applicable' }, capabilityMatches)).toEqual([
      {
        key: 'capability_match',
        label: 'Illeszkedik megadott használati célhoz',
        points: 6,
        capabilityKey: 'off_grid',
        score: 0.5,
        matchedWeight: 5,
        totalWeight: 10,
      },
    ])
  })
})
