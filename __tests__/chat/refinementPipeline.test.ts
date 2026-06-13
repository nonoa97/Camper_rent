import { describe, expect, it } from 'vitest'
import type { ConversationState } from '@/lib/chat/state'
import type { CamperResult } from '@/lib/chat/availability'
import type { RecommendationReferenceResult } from '@/lib/chat/recommendationReference'
import {
  applyLegacyRefinement,
  applyRefinementIntentDelta,
  buildLegacyRefinementNote,
  inferRefinementConcernType,
  legacyRefinementPreferenceFromUpdate,
  refinementIntentFromLegacy,
} from '@/lib/chat/refinementPipeline'

const camper = (slug: string, price: number, beds: number): CamperResult => ({
  slug,
  name: slug,
  image_url: `/${slug}.jpg`,
  price_per_day: price,
  type: 'Camper van',
  beds,
  availableSlots: [],
})

const resolvedReference: RecommendationReferenceResult = {
  status: 'resolved',
  reasons: ['last_recommendation_resolved'],
  target: {
    optionId: 'rec_1',
    camperSlug: 'hobby-t75hf',
    camperName: 'Hobby T75HF',
    pricePerDay: 58000,
    attributeFacts: { beds: 4 },
  } as RecommendationReferenceResult['target'],
  compatibility: {
    status: 'compatible',
    reasons: [],
  },
}

describe('refinementPipeline', () => {
  it('converts legacy refinementPreference to canonical refinementIntent', () => {
    expect(refinementIntentFromLegacy('cheaper', 'van olcsóbb?')).toEqual({
      intent: 'cheaper',
      sourceText: 'van olcsóbb?',
    })
    expect(refinementIntentFromLegacy(undefined, 'semmi')).toBeUndefined()
  })

  it('prefers canonical refinementIntent when deriving legacy fallback preference', () => {
    expect(legacyRefinementPreferenceFromUpdate({
      refinementPreference: 'cheaper',
      refinementIntent: { intent: 'bigger', sourceText: 'nagyobbat' },
    })).toBe('bigger')
    expect(legacyRefinementPreferenceFromUpdate({
      refinementIntent: { intent: 'keep_current', sourceText: 'maradjunk ennél' },
    })).toBeUndefined()
  })

  it('applies cheaper refinement as pricingPreference state delta', () => {
    const state: ConversationState = {
      refinementIntent: { intent: 'cheaper', sourceText: 'abból olcsóbbat' },
    }

    const delta = applyRefinementIntentDelta(state, resolvedReference)

    expect(state.pricingPreference).toEqual({
      intent: 'cheaper',
      strength: 'soft',
      sourceText: 'abból olcsóbbat',
      referencePricePerDay: 58000,
    })
    expect(state.lastShownCamperSlug).toBe('hobby-t75hf')
    expect(state.lastShownPrice).toBe(58000)
    expect(delta?.stateDeltaSummary).toEqual(['pricingPreference.intent=cheaper'])
  })

  it('applies bigger refinement as canonical attribute preference delta', () => {
    const state: ConversationState = {
      passengers: 2,
      refinementIntent: { intent: 'bigger', sourceText: 'nagyobbat' },
    }

    const delta = applyRefinementIntentDelta(state, resolvedReference)

    expect(state.attributePreferences).toEqual([
      {
        key: 'beds',
        operator: 'gte',
        value: 5,
        strength: 'soft',
        sourceText: 'nagyobbat',
      },
    ])
    expect(delta?.stateDeltaSummary).toEqual(['attributePreferences.beds=gte:5'])
  })

  it('applies different refinement as exclusion state delta', () => {
    const state: ConversationState = {
      alreadyRecommendedSlugs: ['other-camper'],
      refinementIntent: { intent: 'different', sourceText: 'mást' },
    }

    const delta = applyRefinementIntentDelta(state, resolvedReference)

    expect(state.alreadyRecommendedSlugs).toEqual(['other-camper', 'hobby-t75hf'])
    expect(delta?.stateDeltaSummary).toEqual(['alreadyRecommendedSlugs+=hobby-t75hf'])
  })

  it('keeps legacy refinement fallback behavior isolated', () => {
    const results = [
      camper('cheap', 30000, 2),
      camper('middle', 50000, 4),
      camper('premium', 70000, 6),
    ]

    expect(applyLegacyRefinement(results, 'cheaper', 60000).refined.map(item => item.slug)).toEqual(['middle', 'cheap'])
    expect(applyLegacyRefinement(results, 'bigger').refined.map(item => item.slug)).toEqual(['premium', 'middle', 'cheap'])
    expect(applyLegacyRefinement(results, 'cheaper', 20000)).toEqual({
      refined: [],
      boundaryReached: true,
    })
  })

  it('builds legacy refinement notes without route-local strings', () => {
    const note = buildLegacyRefinementNote('cheaper', {
      boundaryReached: false,
      lastPrice: 58000,
    })
    expect(note).toBe('User olcsóbbat kért (előző ár: 58 000 Ft/nap). Csak a backend által engedélyezett allowedCamperSlugs opciókat kommunikáld.')
    expect(note).not.toContain('Válassz az allowedCamperSlugs-ból')
    expect(buildLegacyRefinementNote('bigger', { boundaryReached: true })).toBe(
      'HATÁRESET: nincs nagyobb megfelelő opció. Mondd el röviden.',
    )
  })

  it('infers concern type from canonical refinementIntent before legacy bridge', () => {
    expect(inferRefinementConcernType({
      refinementIntent: { intent: 'cheaper', sourceText: 'olcsóbbat' },
    })).toBe('price')
    expect(inferRefinementConcernType({
      refinementIntent: { intent: 'bigger', sourceText: 'nagyobbat' },
    })).toBe('size')
    expect(inferRefinementConcernType({
      refinementPreference: 'different',
    })).toBe('preference')
    expect(inferRefinementConcernType({
      refinementIntent: { intent: 'keep_current', sourceText: 'maradjunk' },
    })).toBeNull()
  })
})
