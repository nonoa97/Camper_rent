import { describe, expect, it } from 'vitest'
import {
  parseRecommendationInteractionSignal,
  parseRecommendationReferenceHint,
} from '@/lib/chat/extractorReferenceParsing'

describe('extractorReferenceParsing', () => {
  it('accepts known feature references and rejects unknown feature keys', () => {
    expect(parseRecommendationReferenceHint({ kind: 'feature', featureKey: 'solar_panel' })).toEqual({
      kind: 'feature',
      featureKey: 'solar_panel',
    })

    expect(parseRecommendationReferenceHint({ kind: 'feature', featureKey: 'made_up_feature' })).toBeUndefined()
  })

  it('accepts known capability references and rejects unknown capability keys', () => {
    expect(parseRecommendationReferenceHint({ kind: 'capability', capabilityKey: 'off_grid' })).toEqual({
      kind: 'capability',
      capabilityKey: 'off_grid',
      minScore: undefined,
    })

    expect(parseRecommendationReferenceHint({ kind: 'capability', capabilityKey: 'made_up_capability' })).toBeUndefined()
  })

  it('parses attribute and price references through the extractor contract', () => {
    expect(parseRecommendationReferenceHint({
      kind: 'attribute',
      attributeKey: 'beds',
      relation: 'max',
    })).toEqual({
      kind: 'attribute',
      attributeKey: 'beds',
      value: undefined,
      relation: 'max',
    })

    expect(parseRecommendationReferenceHint({
      kind: 'price',
      relation: 'cheapest',
      priceField: 'totalPrice',
    })).toEqual({
      kind: 'price',
      relation: 'cheapest',
      priceField: 'totalPrice',
    })
  })

  it('requires a primary target for selected and dismissed interactions', () => {
    expect(parseRecommendationInteractionSignal({
      type: 'selected',
      targetReference: 'firstShownOption',
      sourceText: 'az első jó lesz',
    })).toEqual({
      type: 'selected',
      targetReference: 'firstShownOption',
      targetRecommendationReference: undefined,
      secondaryTargetReference: undefined,
      secondaryRecommendationReference: undefined,
      sourceText: 'az első jó lesz',
    })

    expect(parseRecommendationInteractionSignal({
      type: 'dismissed',
      sourceText: 'ez nem jó',
    })).toBeUndefined()
  })

  it('requires primary and secondary targets for compared interactions', () => {
    expect(parseRecommendationInteractionSignal({
      type: 'compared',
      targetReference: 'firstShownOption',
      secondaryTargetReference: 'lastShownOption',
      sourceText: 'az első jobb mint az utolsó',
    })).toEqual({
      type: 'compared',
      targetReference: 'firstShownOption',
      targetRecommendationReference: undefined,
      secondaryTargetReference: 'lastShownOption',
      secondaryRecommendationReference: undefined,
      sourceText: 'az első jobb mint az utolsó',
    })

    expect(parseRecommendationInteractionSignal({
      type: 'compared',
      targetReference: 'firstShownOption',
      sourceText: 'az első jobb',
    })).toBeUndefined()
  })
})
