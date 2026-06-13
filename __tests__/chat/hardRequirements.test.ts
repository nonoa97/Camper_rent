import { describe, expect, it } from 'vitest'

import {
  evaluateCapabilityPreferences,
  evaluateHardRequirements,
} from '@/lib/chat/hardRequirements'
import type { CamperFact } from '@/lib/chat/evaluationFacts'

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

describe('hard requirements', () => {
  it('creates capacity hard failure when beds are below passengers', () => {
    const camper = createCamper([], 2)

    expect(evaluateHardRequirements(camper, { passengers: 4 }, [])).toEqual([
      { key: 'capacity', label: 'Kevesebb fekvőhely van, mint az utasok száma' },
    ])
  })

  it('creates hard feature failure when required feature key is missing', () => {
    const camper = createCamper(['solar_panel'])

    expect(evaluateHardRequirements(camper, {
      featurePreferences: [
        { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc', detectedLocale: 'hu' },
      ],
    }, [])).toEqual([
      { key: 'feature_requirement', label: 'Hiányzik kötelezően kért felszereltség' },
    ])
  })

  it('creates hard capability failure when score is below threshold', () => {
    const camper = createCamper(['solar_panel'])
    const capabilityMatches = evaluateCapabilityPreferences(camper, {
      capabilityPreferences: [
        { key: 'off_grid', strength: 'hard', sourceText: 'vadkemping', detectedLocale: 'hu' },
      ],
    })

    expect(evaluateHardRequirements(camper, {}, capabilityMatches)).toEqual([
      expect.objectContaining({
        key: 'capability_requirement',
        label: 'Nem éri el a kötelezően kért használati célhoz szükséges megfelelési szintet',
        capabilityKey: 'off_grid',
        threshold: 0.8,
      }),
    ])
  })

  it('does not turn soft capability mismatch into hard failure', () => {
    const camper = createCamper(['solar_panel'])
    const capabilityMatches = evaluateCapabilityPreferences(camper, {
      capabilityPreferences: [
        { key: 'off_grid', strength: 'soft', sourceText: 'off-grid jo lenne', detectedLocale: 'hu' },
      ],
    })

    expect(evaluateHardRequirements(camper, {}, capabilityMatches)).toEqual([])
  })
})
