import { describe, expect, it } from 'vitest'

import {
  evaluateHardAttributeRequirements,
  scoreAttributePreferences,
} from '@/lib/chat/attributeEvaluation'
import type { CamperFact } from '@/lib/chat/evaluationFacts'

function createCamper(overrides: Partial<CamperFact> = {}): CamperFact {
  return {
    id: 'camper-1',
    slug: 'camper-one',
    name: 'Camper One',
    imageUrl: '/camper.jpg',
    type: 'Camper van',
    gearbox: 'Automata',
    fuelType: 'Dízel',
    year: 2024,
    beds: 4,
    features: [],
    featureKeys: new Set(),
    ...overrides,
  }
}

describe('attribute evaluation', () => {
  it('creates hard failure for missing gearbox equality', () => {
    expect(evaluateHardAttributeRequirements(createCamper({ gearbox: 'Manuális' }), {
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'hard', sourceText: 'automata' },
      ],
    })).toEqual([
      expect.objectContaining({
        key: 'attribute_requirement',
        attributeKey: 'gearbox',
        operator: 'eq',
        expectedValue: 'Automata',
        actualValue: 'Manuális',
      }),
    ])
  })

  it('keeps hard beds gte eligible when camper satisfies the threshold', () => {
    expect(evaluateHardAttributeRequirements(createCamper({ beds: 5 }), {
      attributePreferences: [
        { key: 'beds', value: 4, operator: 'gte', strength: 'hard', sourceText: 'legalább 4 fekhely' },
      ],
    })).toEqual([])
  })

  it('scores soft attribute matches', () => {
    expect(scoreAttributePreferences(createCamper(), {
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'soft', sourceText: 'jó lenne automata' },
      ],
    })).toEqual([
      {
        key: 'attribute_match',
        label: 'Illeszkedik megadott járműattribútum preferenciához',
        points: 6,
        attributeKey: 'gearbox',
      },
    ])
  })

  it('does not score soft attribute misses', () => {
    expect(scoreAttributePreferences(createCamper({ gearbox: 'Manuális' }), {
      attributePreferences: [
        { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'soft', sourceText: 'jó lenne automata' },
      ],
    })).toEqual([])
  })
})
