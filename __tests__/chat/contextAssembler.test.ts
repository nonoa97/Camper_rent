import { describe, expect, it } from 'vitest'
import { assembleGptContext } from '@/lib/chat/contextAssembler'
import { buildContextBlock } from '@/lib/chat/prompts'
import { CamperResult } from '@/lib/chat/availability'

const camper: CamperResult = {
  slug: 'hobby-t75hf',
  name: 'Hobby T75HF',
  image_url: '/hobby.jpg',
  price_per_day: 58000,
  type: 'Alkóvos',
  beds: 4,
  availableSlots: [{ from: '2026-07-13', to: '2026-07-20', days: 7 }],
}

describe('contextAssembler', () => {
  it('assembles the existing GPT context shape', () => {
    const ctx = assembleGptContext({
      state: { positiveAcknowledgement: true },
      flowState: { activeFlow: 'recommendation' },
      sessionMemory: {},
      nextQuestion: 'Hány napra tervezed?',
      camperResults: [camper],
      allowedCamperSlugs: ['hobby-t75hf'],
      mode: 'recommend',
      effectiveMode: 'recommend',
      searchType: 'specific',
      requestedMonth: '2026-07',
      refinementNote: 'note',
      offerExtras: true,
      extrasItems: [{ name: 'Kerékpártartó', category: 'Kiegészítő', price_per_day: 1000 }],
      shouldSummarize: true,
    })

    expect(ctx).toMatchObject({
      state: { positiveAcknowledgement: true },
      flowState: { activeFlow: 'recommendation' },
      sessionMemory: {},
      nextQuestion: 'Hány napra tervezed?',
      camperResults: [camper],
      allowedCamperSlugs: ['hobby-t75hf'],
      mode: 'recommend',
      searchType: 'specific',
      requestedMonth: '2026-07',
      refinementNote: 'note',
      offerExtras: true,
      positiveAcknowledgement: true,
      shouldSummarize: true,
    })
    expect(ctx.explainabilityPresentation?.invariants).toEqual({
      recommendationTruthSource: 'evaluation_engine',
      gptMayChooseCamper: false,
      memoryMayChooseCamper: false,
    })
  })

  it('hides camperResults in engine-primary recommendation context', () => {
    const ctx = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [camper],
      allowedCamperSlugs: ['hobby-t75hf'],
      mode: 'recommend',
      effectiveMode: 'recommend',
      enginePrimaryRecommendations: true,
      backendSelectedRecommendations: [],
    })

    expect(ctx.camperResults).toEqual([])
    expect(ctx.backendSelectedRecommendations).toEqual([])
    expect(ctx.explainabilityPresentation?.recommendations).toEqual([])
  })

  it('adds non-decisive explainability presentation to GPT context', () => {
    const ctx = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [],
      allowedCamperSlugs: ['hobby-t75hf'],
      mode: 'recommend',
      effectiveMode: 'recommend',
      backendSelectedRecommendations: [{
        slug: 'hobby-t75hf',
        name: 'Hobby T75HF',
        score: 20,
        scoreBreakdown: [{ key: 'capacity', label: 'Megfelel a létszámnak', points: 20 }],
        hardFailures: [],
        pricing: {
          status: 'priced',
          pricePerDay: 58000,
          durationDays: 7,
          subtotal: 406000,
          discountPercent: 0,
          discountAmount: 0,
          total: 406000,
        },
        imageUrl: '/hobby.jpg',
        pricePerDay: 58000,
        type: 'Alkóvos',
        beds: 4,
        availableSlots: [],
        featureKeys: [],
        attributeFacts: { beds: 4 },
        capabilityMatches: [],
      }],
    })

    const contextBlock = buildContextBlock(ctx)

    expect(contextBlock).toContain('EXPLAINABILITY PRESENTATION')
    expect(contextBlock).toContain('recommendationTruthSource')
    expect(contextBlock).toContain('gptMayChooseCamper')
    expect(contextBlock).toContain('Megfelel a létszámnak')
    expect(contextBlock).toContain('Do not choose, rank, replace, or add campers from this block.')
  })

  it('uses one structured legacy compatibility context without duplicate raw legacy prompt blocks', () => {
    const contextBlock = buildContextBlock({
      state: {
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        extraRequirements: ['automata váltós'],
        softPreferences: ['olcsóbb'],
        refinementPreference: 'cheaper',
      },
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [],
      allowedCamperSlugs: [],
      mode: 'recommend',
      refinementNote: 'Olcsóbb opciót keresünk.',
      extrasItems: [{ name: 'Kerékpártartó', category: 'Kiegészítő', price_per_day: 1000 }],
      offerExtras: true,
    })

    expect(contextBlock).toContain('legacyCompatibilityContext')
    expect(contextBlock).toContain('extraRequirements')
    expect(contextBlock).toContain('softPreferences')
    expect(contextBlock).toContain('refinementPreference')
    expect(contextBlock).not.toContain('legacyRefinementPreferenceContext')
    expect(contextBlock).not.toContain('legacyHardRequirementsContext')
  })

  it('sets nextQuestion to null in FAQ mode', () => {
    const ctx = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: 'Hány napra tervezed?',
      camperResults: [],
      allowedCamperSlugs: [],
      mode: 'ask_next_question',
      effectiveMode: 'faq',
    })

    expect(ctx.mode).toBe('faq')
    expect(ctx.nextQuestion).toBeNull()
  })

  it('keeps specific camper slug only for specific camper queries', () => {
    const specific = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [],
      allowedCamperSlugs: [],
      mode: 'availability',
      effectiveMode: 'availability',
      isSpecificCamperQuery: true,
      specificCamperSlug: 'hobby-t75hf',
    })

    const generic = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [],
      allowedCamperSlugs: [],
      mode: 'availability',
      effectiveMode: 'availability',
      isSpecificCamperQuery: false,
      specificCamperSlug: 'hobby-t75hf',
    })

    expect(specific.specificCamperSlug).toBe('hobby-t75hf')
    expect(generic.specificCamperSlug).toBeUndefined()
  })

  it('builds the same skipNote text from justSkippedField', () => {
    const ctx = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [],
      allowedCamperSlugs: [],
      mode: 'ask_next_question',
      effectiveMode: 'ask_next_question',
      justSkippedField: 'campingType',
    })

    expect(ctx.skipNote).toBe('A user nem tudott/akart válaszolni a "campingType" kérdésre — fogadd el természetesen, ne kérdezd újra.')
  })

  it('passes safe recommendation reference explanation to GPT context', () => {
    const ctx = assembleGptContext({
      state: {},
      flowState: {},
      sessionMemory: {},
      nextQuestion: null,
      camperResults: [],
      allowedCamperSlugs: [],
      mode: 'recommend',
      effectiveMode: 'recommend',
      recommendationReferenceResult: {
        status: 'resolved',
        target: {
          index: 1,
          optionId: 'rec_1',
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          criteria: { month: '2026-07' },
          criteriaHash: 'hash',
          featureKeys: ['solar_panel'],
          attributeFacts: { beds: 4 },
        },
        reasons: ['feature_reference_resolved'],
      },
      recommendationReferenceExplanation: {
        status: 'resolved',
        target: {
          optionId: 'rec_1',
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          shownIndex: 1,
        },
        reasons: ['feature_reference_resolved'],
        communicationAction: 'confirm_resolved_reference',
        safeForGpt: true,
      },
    })
    const contextBlock = buildContextBlock(ctx)

    expect(contextBlock).toContain('recommendationReferenceExplanation:')
    expect(contextBlock).toContain('confirm_resolved_reference')
    expect(contextBlock).not.toContain('recommendationReferenceResult:')
    expect(contextBlock).not.toContain('featureKeys')
    expect(contextBlock).not.toContain('attributeFacts')
    expect(contextBlock).not.toContain('criteriaHash')
  })
})
