import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ConversationState } from '@/lib/chat/state'

// ──────────────────────────────────────────────────────────────
// OpenAI mock — must be declared before imports
// ──────────────────────────────────────────────────────────────

const mockGptCreate = vi.fn()
vi.mock('openai', () => ({
  default: class {
    chat = {
      completions: {
        create: (...args: any[]) => mockGptCreate(...args),
      }
    }
  },
}))

process.env.OPENAI_API_KEY = 'test-key'

beforeEach(() => {
  vi.clearAllMocks()
})

import { extractStateFromMessage } from '@/lib/chat/state'
import { extractStateUpdate } from '@/lib/chat/extractState'
import { resolveSeasonalTiming } from '@/lib/chat/seasonalTiming'

function currentMonth(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

// ──────────────────────────────────────────────────────────────
// Task 1 – regex fallback: "segíts" alone should not override intent
// ──────────────────────────────────────────────────────────────
describe('Extraction – regex fallback: "segíts" intent detection', () => {
  it('"segíts" alone does not override existing faq intent', () => {
    const result = extractStateFromMessage('segíts', [], { intent: 'faq' })
    expect(result.intent).toBe('faq')
  })

  it('"segíts nekem" alone does not override existing faq intent', () => {
    const result = extractStateFromMessage('segíts nekem', [], { intent: 'faq' })
    expect(result.intent).toBe('faq')
  })

  it('"segíts lakóautót választani" → recommendation intent', () => {
    const result = extractStateFromMessage('segíts lakóautót választani', [], {})
    expect(result.intent).toBe('recommendation')
  })

  it('"segíts camper választásban" → recommendation intent', () => {
    const result = extractStateFromMessage('segíts camper választásban', [], {})
    expect(result.intent).toBe('recommendation')
  })

  it('"segíts autót bérelni" → recommendation intent', () => {
    const result = extractStateFromMessage('segíts autót bérelni', [], {})
    expect(result.intent).toBe('recommendation')
  })
})

describe('Extraction - rental availability questions', () => {
  it('"tudok még erre a hónapra lakóautót bérelni" is availability with current month', () => {
    const result = extractStateFromMessage('Hello tudok még erre a hónapra lakóautót bérelni?', [], {})

    expect(result.intent).toBe('availability')
    expect(result.month).toBe(currentMonth())
  })

  it('GPT semantic extraction can classify rental availability question', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ intent: 'availability', month: currentMonth() }),
        },
      }],
    })

    const result = await extractStateUpdate('Hello tudok még erre a hónapra lakóautót bérelni?', [], {})

    expect(result.intent).toBe('availability')
    expect(result.month).toBe(currentMonth())
  })
})

describe('Extraction - rental starter intent prompt', () => {
  it('tells GPT that simple camper rental requests start the recommendation checklist', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ intent: 'recommendation' }) } }],
      })
    })

    const result = await extractStateUpdate('Szia szeretnék lakóautót bérelni', [], {})

    expect(result.intent).toBe('recommendation')
    expect(capturedSystemPrompt).toContain('Rental-start messages')
    expect(capturedSystemPrompt).toContain('"Szeretnék lakóautót bérelni." → recommendation')
  })
})

describe('Extraction - seasonal timing', () => {
  it('regex fallback maps summer to flexible months without a concrete month', () => {
    const result = extractStateFromMessage('valamikor nyáron', [], {})

    expect(result.month).toBeUndefined()
    expect(result.flexibleCriteria?.months).toEqual(resolveSeasonalTiming('valamikor nyáron')?.months)
    expect(result.flexibleCriteria?.preferredStartWindows).toEqual(resolveSeasonalTiming('valamikor nyáron')?.preferredStartWindows)
    expect(result.durationDays).toBeUndefined()
    expect(result.passengers).toBeUndefined()
    expect(result.campingType).toBeUndefined()
  })

  it('semantic extraction corrects season-only hallucinated defaults', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'recommendation',
            month: '2026-07',
            durationDays: 7,
            passengers: 2,
            campingType: 'camping_site',
            extraRequirementsAsked: true,
            flexibleCriteria: { months: ['2026-07'] },
          }),
        },
      }],
    })

    const result = await extractStateUpdate('nyáron vagy ősszel valamikor', [], {})

    expect(result.intent).toBe('recommendation')
    expect(result.month).toBeUndefined()
    expect(result.flexibleCriteria?.months).toEqual(resolveSeasonalTiming('nyáron vagy ősszel valamikor')?.months)
    expect(result.flexibleCriteria?.preferredStartWindows).toEqual(resolveSeasonalTiming('nyáron vagy ősszel valamikor')?.preferredStartWindows)
    expect(result.durationDays).toBeUndefined()
    expect(result.passengers).toBeUndefined()
    expect(result.campingType).toBeUndefined()
    expect(result.extraRequirementsAsked).toBeUndefined()
  })

  it('semantic extraction does not accept invented summer months for vague sometime wording', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            flexibleCriteria: {
              months: ['2026-06', '2026-07', '2026-08'],
            },
          }),
        },
      }],
    })

    const result = await extractStateUpdate('Szia, valamikor szeretnénk elutazni', [], {})

    expect(result.intent).toBe('recommendation')
    expect(result.month).toBeUndefined()
    expect(result.flexibleCriteria).toBeUndefined()
  })

  it('prompt tells GPT not to infer months from vague sometime wording', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ intent: 'recommendation' }) } }],
      })
    })

    await extractStateUpdate('Szia, valamikor szeretnénk elutazni', [], {})

    expect(capturedSystemPrompt).toContain('Vague timing alone')
    expect(capturedSystemPrompt).toContain('Valamikor szeretnénk elutazni')
    expect(capturedSystemPrompt).toContain('no month and no flexibleCriteria.months')
  })

  it('keeps explicit duration and passengers with seasonal timing', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'recommendation',
            durationDays: 7,
            passengers: 2,
            flexibleCriteria: { months: ['2026-07'] },
          }),
        },
      }],
    })

    const result = await extractStateUpdate('nyáron 7 napra ketten', [], {})

    expect(result.flexibleCriteria?.months).toEqual(resolveSeasonalTiming('nyáron 7 napra ketten')?.months)
    expect(result.durationDays).toBe(7)
    expect(result.passengers).toBe(2)
  })

  it('regex fallback maps month vicinity to flexible adjacent months', () => {
    const result = extractStateFromMessage('szeptember környékén', [], {})

    expect(result.month).toBeUndefined()
    expect(result.flexibleCriteria?.months).toEqual(resolveSeasonalTiming('szeptember környékén')?.months)
    expect(result.flexibleCriteria?.preferredStartWindows).toEqual(resolveSeasonalTiming('szeptember környékén')?.preferredStartWindows)
  })

  it('semantic extraction corrects month vicinity away from a single exact month', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            intent: 'recommendation',
            month: '2026-09',
          }),
        },
      }],
    })

    const result = await extractStateUpdate('szeptember környékén', [], {})

    expect(result.month).toBeUndefined()
    expect(result.flexibleCriteria?.months).toEqual(resolveSeasonalTiming('szeptember környékén')?.months)
    expect(result.flexibleCriteria?.preferredStartWindows).toEqual(resolveSeasonalTiming('szeptember környékén')?.preferredStartWindows)
  })
})

describe('Extraction - short checklist answer safety net', () => {
  it('fills durationDays from "5." when GPT omits it but lastAskedField is durationDays', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })

    const state: ConversationState = {
      month: '2026-10',
      lastAskedField: 'durationDays',
    }
    const result = await extractStateUpdate('5.', [], state)

    expect(result.durationDays).toBe(5)
  })

  it('fills passengers from a short punctuated answer when GPT omits it', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })

    const state: ConversationState = {
      month: '2026-10',
      durationDays: 5,
      lastAskedField: 'passengers',
    }
    const result = await extractStateUpdate('4 fővel.', [], state)

    expect(result.passengers).toBe(4)
  })

  it('does not turn FAQ side-topic answers into checklist fallback values', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ intent: 'faq' }) } }],
    })

    const state: ConversationState = {
      lastAskedField: 'extraRequirements',
    }
    const result = await extractStateUpdate('mi számít extra igénynek?', [], state)

    expect(result.intent).toBe('faq')
    expect(result.extraRequirementsAsked).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────
// Task 3 – GPT semantic extraction preserves data on skip
// ──────────────────────────────────────────────────────────────
describe('Extraction – semantic skip extraction preserves other data', () => {
  it('GPT skipCurrentField + raw soft attribute → skip plus canonical attribute', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            skipCurrentField: true,
            softPreferences: ['automata váltós'],
          }),
        },
      }],
    })

    const state: ConversationState = { lastAskedField: 'campingType' }
    const result = await extractStateUpdate('Mindegy, csak legyen automata', [], state)

    expect(result.skippedChecklist).toContain('campingType')
    expect(result.attributePreferences).toEqual([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'soft',
        sourceText: 'automata váltós',
        detectedLocale: 'hu',
      },
    ])
    expect(result.softPreferences ?? []).toHaveLength(0)
  })

  it('GPT skipCurrentField + month → both in result', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            skipCurrentField: true,
            month: '2026-07',
          }),
        },
      }],
    })

    const state: ConversationState = { lastAskedField: 'durationDays' }
    const result = await extractStateUpdate('Mindegy, de júliusban mennénk', [], state)

    expect(result.skippedChecklist).toContain('durationDays')
    expect(result.month).toBe('2026-07')
  })

  it('"Mindegy, nincs más szempont" for extraRequirements → skipped + extraRequirementsAsked, no new requirement', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ skipCurrentField: true }) } }],
    })

    const state: ConversationState = { lastAskedField: 'extraRequirements' }
    const result = await extractStateUpdate('Mindegy, nincs más igény', [], state)

    expect(result.skippedChecklist).toContain('extraRequirements')
    expect(result.extraRequirementsAsked).toBe(true)
    expect((result.extraRequirements ?? []).length).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────
// Task 2 – positiveAcknowledgement does not suppress refinement
// ──────────────────────────────────────────────────────────────
describe('Extraction – positiveAcknowledgement + refinement extracted together', () => {
  it('"Ez jó, van olcsóbb?" → positiveAcknowledgement + refinement=cheaper', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            positiveAcknowledgement: true,
            refinementPreference: 'cheaper',
          }),
        },
      }],
    })

    const state: ConversationState = { lastShownCamperSlug: 'hobby-t75hf' }
    const result = await extractStateUpdate('Ez jó, van olcsóbb?', [], state)

    expect(result.positiveAcknowledgement).toBe(true)
    expect(result.refinementIntent).toEqual({
      intent: 'cheaper',
      sourceText: 'Ez jó, van olcsóbb?',
    })
    expect(result.refinementPreference).toBeUndefined()
  })

  it('"Ez tetszik, mutass másikat" → positiveAcknowledgement + refinement=different', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            positiveAcknowledgement: true,
            refinementPreference: 'different',
          }),
        },
      }],
    })

    const state: ConversationState = { lastShownCamperSlug: 'hobby-t75hf' }
    const result = await extractStateUpdate('Ez tetszik, mutass másikat', [], state)

    expect(result.positiveAcknowledgement).toBe(true)
    expect(result.refinementIntent).toEqual({
      intent: 'different',
      sourceText: 'Ez tetszik, mutass másikat',
    })
    expect(result.refinementPreference).toBeUndefined()
  })

  it('prompt tells GPT that dislike after a shown recommendation means different, not a new checklist', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ refinementPreference: 'different' }) } }],
      })
    })

    const state: ConversationState = { lastShownCamperSlug: 'hobby-t75hf' }
    const result = await extractStateUpdate('nem tetszik, mutass másikat', [], state)

    expect(result.refinementIntent).toEqual({
      intent: 'different',
      sourceText: 'nem tetszik, mutass másikat',
    })
    expect(result.refinementPreference).toBeUndefined()
    expect(capturedSystemPrompt).toContain('If a recommendation was already shown')
    expect(capturedSystemPrompt).toContain('refinementIntent.intent = different')
  })

  it('"van olcsóbb?" → canonical refinementIntent cheaper', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })
    const result = await extractStateUpdate('van olcsóbb?', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(result.refinementIntent).toEqual({
      intent: 'cheaper',
      sourceText: 'van olcsóbb?',
    })
    expect(result.refinementPreference).toBeUndefined()
  })

  it('"inkább nagyobbat" → canonical refinementIntent bigger', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })
    const result = await extractStateUpdate('inkább nagyobbat', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(result.refinementIntent).toEqual({
      intent: 'bigger',
      sourceText: 'inkább nagyobbat',
    })
    expect(result.refinementPreference).toBeUndefined()
  })

  it('"mutass mást" → canonical refinementIntent different', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })
    const result = await extractStateUpdate('mutass mást', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(result.refinementIntent).toEqual({
      intent: 'different',
      sourceText: 'mutass mást',
    })
    expect(result.refinementPreference).toBeUndefined()
  })

  it('"maradjunk ennél" → canonical refinementIntent keep_current', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })
    const result = await extractStateUpdate('maradjunk ennél', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(result.refinementIntent).toEqual({
      intent: 'keep_current',
      targetReference: 'lastRecommendation',
      sourceText: 'maradjunk ennél',
    })
    expect(result.recommendationInteraction).toEqual({
      type: 'selected',
      targetReference: 'lastRecommendation',
      sourceText: 'maradjunk ennél',
    })
    expect(result.referenceTarget).toBe('lastRecommendation')
    expect(result.refinementPreference).toBeUndefined()
  })

  it('"az előző jobban tetszett" → canonical refinementIntent prefer_previous', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{ message: { content: JSON.stringify({}) } }],
    })
    const result = await extractStateUpdate('az előző jobban tetszett', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(result.refinementIntent).toEqual({
      intent: 'prefer_previous',
      targetReference: 'lastRecommendation',
      sourceText: 'az előző jobban tetszett',
    })
    expect(result.referenceTarget).toBe('lastRecommendation')
    expect(result.refinementPreference).toBeUndefined()
  })

  it('accepts structured refinementIntent from extractor output', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            refinementIntent: {
              intent: 'similar',
              targetReference: 'lastShownOption',
              sourceText: 'valami hasonlót',
              strength: 'soft',
            },
          }),
        },
      }],
    })
    const result = await extractStateUpdate('valami hasonlót', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(result.refinementIntent).toEqual({
      intent: 'similar',
      targetReference: 'lastShownOption',
      sourceText: 'valami hasonlót',
      strength: 'soft',
    })
  })

  it('accepts valid fact-based recommendationReference and rejects unknown feature keys', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
          }),
        },
      }],
    })
    const validResult = await extractStateUpdate('a napelemes', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(validResult.recommendationReference).toEqual({ kind: 'feature', featureKey: 'solar_panel' })

    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationReference: { kind: 'feature', featureKey: 'made_up_feature' },
          }),
        },
      }],
    })
    const invalidResult = await extractStateUpdate('a kitalált feature-ös', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(invalidResult.recommendationReference).toBeUndefined()
  })

  it('accepts valid capability recommendationReference and rejects unknown capability keys', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationReference: { kind: 'capability', capabilityKey: 'off_grid' },
          }),
        },
      }],
    })
    const validResult = await extractStateUpdate('az off-grides', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(validResult.recommendationReference).toEqual({ kind: 'capability', capabilityKey: 'off_grid' })

    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationReference: { kind: 'capability', capabilityKey: 'made_up_capability' },
          }),
        },
      }],
    })
    const invalidResult = await extractStateUpdate('a kitalált képességes', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(invalidResult.recommendationReference).toBeUndefined()
  })

  it('requires a deterministic target for recommendationInteraction selected/dismissed', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationInteraction: {
              type: 'selected',
              targetReference: 'firstShownOption',
              sourceText: 'az első jó lesz',
            },
          }),
        },
      }],
    })
    const validResult = await extractStateUpdate('az első jó lesz', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(validResult.recommendationInteraction).toEqual({
      type: 'selected',
      targetReference: 'firstShownOption',
      targetRecommendationReference: undefined,
      secondaryTargetReference: undefined,
      secondaryRecommendationReference: undefined,
      sourceText: 'az első jó lesz',
    })

    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationInteraction: {
              type: 'dismissed',
              sourceText: 'ez nem jó',
            },
          }),
        },
      }],
    })
    const invalidResult = await extractStateUpdate('ez nem jó', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(invalidResult.recommendationInteraction).toBeUndefined()
  })

  it('requires two deterministic targets for compared recommendationInteraction', async () => {
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationInteraction: {
              type: 'compared',
              targetReference: 'firstShownOption',
              secondaryTargetReference: 'lastShownOption',
              sourceText: 'az első jobb mint az utolsó',
            },
          }),
        },
      }],
    })
    const validResult = await extractStateUpdate('az első jobb mint az utolsó', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(validResult.recommendationInteraction).toEqual({
      type: 'compared',
      targetReference: 'firstShownOption',
      targetRecommendationReference: undefined,
      secondaryTargetReference: 'lastShownOption',
      secondaryRecommendationReference: undefined,
      sourceText: 'az első jobb mint az utolsó',
    })

    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            recommendationInteraction: {
              type: 'compared',
              targetReference: 'firstShownOption',
              sourceText: 'az első jobb',
            },
          }),
        },
      }],
    })
    const invalidResult = await extractStateUpdate('az első jobb', [], { lastShownCamperSlug: 'hobby-t75hf' })

    expect(invalidResult.recommendationInteraction).toBeUndefined()
  })

  it('prompt tells GPT that condition changes after recommendation update fields only', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ durationDays: 20 }) } }],
      })
    })

    const state: ConversationState = {
      lastShownCamperSlug: 'hobby-t75hf',
      durationDays: 25,
    }
    const result = await extractStateUpdate('akkor inkább 20 napra', [], state)

    expect(result.durationDays).toBe(20)
    expect(capturedSystemPrompt).toContain('changes a trip condition after a recommendation')
    expect(capturedSystemPrompt).toContain('Keep the rest of the current state')
  })
})

describe('Extraction - semantic availability follow-ups', () => {
  it('pending availability confirmation can be accepted semantically', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ positiveAcknowledgement: true }),
        },
      }],
    })

    const state: ConversationState = {
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-12',
      },
    }
    const result = await extractStateUpdate('jó lesz', [], state)

    expect(result.positiveAcknowledgement).toBe(true)
  })

  it('prompt tells GPT to interpret minor typos in pending confirmations by meaning', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ positiveAcknowledgement: true }) } }],
      })
    })

    const state: ConversationState = {
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      },
    }
    const result = await extractStateUpdate('igen jó lezs', [], state)

    expect(result.positiveAcknowledgement).toBe(true)
    expect(capturedSystemPrompt).toContain('minor typos')
    expect(capturedSystemPrompt).toContain('pending-confirmation context')
  })

  it('longest availability question is extracted as a semantic availabilityQuestion', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ availabilityQuestion: 'longest_duration' }),
        },
      }],
    })

    const state: ConversationState = { intent: 'availability', month: '2026-07', durationDays: 27 }
    const result = await extractStateUpdate('mi a leghosszabb idő ami foglalható?', [], state)

    expect(result.availabilityQuestion).toBe('longest_duration')
  })

  it('extracts referenceTarget for previous availability follow-ups', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            availabilityQuestion: 'remembered_slot_duration',
            referenceTarget: 'previousAvailability',
          }),
        },
      }],
    })

    const state: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      },
    }
    const result = await extractStateUpdate('a korábbi időpontban hány napra lehetne?', [], state)

    expect(result.availabilityQuestion).toBe('remembered_slot_duration')
    expect(result.referenceTarget).toBe('previousAvailability')
  })
})

describe('Extraction - general conversation memory notes', () => {
  it('extracts durable memoryNotes beyond strict checklist fields', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            refinementPreference: 'different',
            memoryNotes: [
              {
                type: 'rejection',
                subject: 'last shown camper',
                text: 'User disliked the last shown camper.',
              },
              {
                type: 'concern',
                subject: 'size',
                text: 'User is concerned the camper is too large.',
              },
            ],
          }),
        },
      }],
    })

    const state: ConversationState = { lastShownCamperSlug: 'hobby-t75hf' }
    const result = await extractStateUpdate('nem tetszik, túl nagy', [], state)

    expect(result.refinementIntent).toEqual({
      intent: 'different',
      sourceText: 'nem tetszik, túl nagy',
    })
    expect(result.refinementPreference).toBeUndefined()
    expect(result.conversationMemory?.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'rejection',
          subject: 'last shown camper',
        }),
        expect.objectContaining({
          type: 'concern',
          subject: 'size',
        }),
      ]),
    )
  })

  it('prompt asks GPT for general memoryNotes, not only availability memory', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ memoryNotes: null }) } }],
      })
    })

    await extractStateUpdate('A tópartos megállás fontos lenne', [], {})

    expect(capturedSystemPrompt).toContain('GENERAL MEMORY NOTES')
    expect(capturedSystemPrompt).toContain('This is the general memory layer')
    expect(capturedSystemPrompt).toContain('not limited to availability')
  })
})

describe('Extraction - campingType after FAQ detours', () => {
  it('prompt tells GPT to treat practical lakeside/forest stops as wild_camping capability after FAQ', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ campingType: 'wild' }) } }],
      })
    })

    const state: ConversationState = {
      intent: 'recommendation',
      lastAskedField: 'campingType',
    }
    const result = await extractStateUpdate(
      'hát azért lehet hogy egy tóparton vagy erdő mélyén megállnánk',
      [],
      state,
    )

    expect(result.campingType).toBeUndefined()
    expect(result.capabilityPreferences).toEqual([
      {
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'hát azért lehet hogy egy tóparton vagy erdő mélyén megállnánk',
        detectedLocale: 'hu',
      },
    ])
    expect(result.skippedChecklist).toContain('campingType')
    expect(capturedSystemPrompt).toContain('practical statement like')
    expect(capturedSystemPrompt).toContain('capabilityPreferences key = "wild_camping"')
  })

  it('prompt tells GPT to treat backing away from existing wild camping as camping_site', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ campingType: 'camping_site' }) } }],
      })
    })

    const state: ConversationState = {
      intent: 'recommendation',
      campingType: 'wild',
      extraRequirementsAsked: true,
    }
    const result = await extractStateUpdate('és ha nem vadkemp?', [], state)

    expect(result.campingType).toBe('camping_site')
    expect(capturedSystemPrompt).toContain('CURRENT STATE already has campingType = "wild"')
    expect(capturedSystemPrompt).toContain('Infer the correction from the conversation meaning')
  })
})

// ──────────────────────────────────────────────────────────────
// Task 4 – hard vs soft preference extraction
// ──────────────────────────────────────────────────────────────
describe('Extraction – hard vs soft preference classification', () => {
  it('"jó lenne automata" raw soft → canonical attributePreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ softPreferences: ['automata váltós'] }),
        },
      }],
    })

    const state: ConversationState = {}
    const result = await extractStateUpdate('Jó lenne automata', [], state)

    expect(result.attributePreferences).toEqual([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'soft',
        sourceText: 'automata váltós',
        detectedLocale: 'hu',
      },
    ])
    expect(result.softPreferences ?? []).toHaveLength(0)
    expect((result.extraRequirements ?? []).length).toBe(0)
  })

  it('moves capability-like softPreferences to canonical capabilityPreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ softPreferences: ['jó lenne off-grid módon menni'] }),
        },
      }],
    })

    const result = await extractStateUpdate('Jó lenne off-grid módon menni', [], {})

    expect(result.capabilityPreferences).toEqual([
      {
        key: 'off_grid',
        strength: 'soft',
        sourceText: 'jó lenne off-grid módon menni',
        detectedLocale: 'hu',
      },
    ])
    expect(result.softPreferences ?? []).toHaveLength(0)
  })

  it('keeps ambiguous capability-like softPreferences out of raw softPreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ softPreferences: ['szabadon állnánk meg'] }),
        },
      }],
    })

    const result = await extractStateUpdate('Jó lenne, ha szabadon állnánk meg', [], {})

    expect(result.capabilityPreferences ?? []).toHaveLength(0)
    expect(result.softPreferences ?? []).toHaveLength(0)
    expect(result.ambiguousPreferences).toEqual([
      {
        sourceText: 'szabadon állnánk meg',
        candidates: ['wild_camping'],
        strength: 'soft',
        detectedLocale: 'hu',
        reason: 'ambiguous_capability',
      },
    ])
  })

  it('"mindenképpen automata" → extraRequirements', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ extraRequirements: ['automata váltós'] }),
        },
      }],
    })

    const state: ConversationState = {}
    const result = await extractStateUpdate('Mindenképpen automata', [], state)

    expect(result.extraRequirements).toContain('automata váltós')
    expect(result.attributePreferences).toEqual([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'hard',
        sourceText: 'automata váltós',
        detectedLocale: 'hu',
      },
    ])
    expect((result.softPreferences ?? []).length).toBe(0)
  })

  it('feature-like raw softPreferences are canonicalized into featurePreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ softPreferences: ['saját wc'] }),
        },
      }],
    })

    const result = await extractStateUpdate('Jó lenne saját WC', [], {})

    expect(result.featurePreferences).toEqual([
      {
        key: 'cassette_wc',
        strength: 'soft',
        sourceText: 'saját wc',
        detectedLocale: 'hu',
      },
    ])
    expect(result.softPreferences ?? []).toHaveLength(0)
  })

  it('pricing-like raw softPreferences are canonicalized into pricingPreference', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ softPreferences: ['olcsóbbat szeretnék'] }),
        },
      }],
    })

    const result = await extractStateUpdate('olcsóbbat szeretnék', [], {})

    expect(result.pricingPreference).toEqual({
      intent: 'cheaper',
      strength: 'soft',
      sourceText: 'olcsóbbat szeretnék',
    })
    expect(result.softPreferences ?? []).toHaveLength(0)
  })
})

describe('Extraction - canonical preference schema', () => {
  it('parses featurePreferences and validates feature aliases', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            featurePreferences: [
              { key: null, strength: 'hard', sourceText: 'kell saját wc', detectedLocale: 'hu' },
            ],
          }),
        },
      }],
    })

    const result = await extractStateUpdate('kell saját wc', [], {})

    expect(result.featurePreferences).toEqual([
      {
        key: 'cassette_wc',
        strength: 'hard',
        sourceText: 'kell saját wc',
        detectedLocale: 'hu',
      },
    ])
  })

  it('keeps automata valto in attributePreferences, not featurePreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            featurePreferences: [
              { key: 'automatic_transmission', strength: 'hard', sourceText: 'automata váltó', detectedLocale: 'hu' },
            ],
            attributePreferences: [
              { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'hard', sourceText: 'automata váltó', detectedLocale: 'hu' },
            ],
          }),
        },
      }],
    })

    const result = await extractStateUpdate('mindenképpen automata váltó legyen', [], {})

    expect(result.featurePreferences ?? []).toHaveLength(0)
    expect(result.unmappedPreferences).toEqual([
      { sourceText: 'automata váltó', strength: 'hard', detectedLocale: 'hu', reason: 'unknown_feature' },
    ])
    expect(result.attributePreferences).toEqual([
      {
        key: 'gearbox',
        value: 'Automata',
        operator: 'eq',
        strength: 'hard',
        sourceText: 'automata váltó',
        detectedLocale: 'hu',
      },
    ])
  })

  it('keeps wild camping in capabilityPreferences, not featurePreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            campingType: 'wild',
            capabilityPreferences: [
              { key: 'wild_camping', strength: 'hard', sourceText: 'vadkempingeznénk', detectedLocale: 'hu' },
            ],
          }),
        },
      }],
    })

    const result = await extractStateUpdate('vadkempingeznénk', [], {})

    expect(result.campingType).toBeUndefined()
    expect(result.capabilityPreferences).toEqual([
      {
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'vadkempingeznénk',
        detectedLocale: 'hu',
      },
    ])
    expect(result.skippedChecklist).toContain('campingType')
    expect(result.featurePreferences ?? []).toHaveLength(0)
  })

  it('keeps cheaper/budget language in pricingPreference', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            pricingPreference: {
              intent: 'cheaper',
              strength: 'soft',
              sourceText: 'olcsóbbat szeretnék',
            },
          }),
        },
      }],
    })

    const result = await extractStateUpdate('olcsóbbat szeretnék', [], {})

    expect(result.pricingPreference).toEqual({
      intent: 'cheaper',
      amount: undefined,
      currency: undefined,
      strength: 'soft',
      sourceText: 'olcsóbbat szeretnék',
    })
    expect(result.featurePreferences ?? []).toHaveLength(0)
  })

  it('keeps canonical featurePreferences when legacy raw mirror is also present', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            featurePreferences: [
              { key: 'solar_panel', strength: 'soft', sourceText: 'napelem', detectedLocale: 'hu' },
            ],
            softPreferences: ['napelem'],
          }),
        },
      }],
    })

    const result = await extractStateUpdate('jó lenne napelem', [], {})

    expect(result.featurePreferences).toEqual([
      {
        key: 'solar_panel',
        strength: 'soft',
        sourceText: 'napelem',
        detectedLocale: 'hu',
      },
    ])
    expect(result.softPreferences ?? []).toHaveLength(0)
  })

  it('moves ambiguous feature sourceText into ambiguousPreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            featurePreferences: [
              { key: 'living_area_ac', strength: 'soft', sourceText: 'klíma', detectedLocale: 'hu' },
            ],
          }),
        },
      }],
    })

    const result = await extractStateUpdate('jó lenne klíma', [], {})

    expect(result.featurePreferences ?? []).toHaveLength(0)
    expect(result.ambiguousPreferences).toEqual([
      {
        sourceText: 'klíma',
        candidates: expect.arrayContaining(['cab_ac', 'living_area_ac']),
        strength: 'soft',
        detectedLocale: 'hu',
        reason: 'ambiguous_feature',
      },
    ])
  })

  it('prompt documents the canonical preference buckets', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      capturedSystemPrompt = params.messages?.[0]?.content ?? ''
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({}) } }],
      })
    })

    await extractStateUpdate('kell wc és automata', [], {})

    expect(capturedSystemPrompt).toContain('featurePreferences')
    expect(capturedSystemPrompt).toContain('attributePreferences')
    expect(capturedSystemPrompt).toContain('capabilityPreferences')
    expect(capturedSystemPrompt).toContain('pricingPreference')
    expect(capturedSystemPrompt).toContain('automatic transmission')
    expect(capturedSystemPrompt).toContain('never featurePreferences')
    expect(capturedSystemPrompt).toContain('Legacy raw fields may mirror text')
    expect(capturedSystemPrompt).toContain('not the primary structured truth source')
  })
})
describe('Extraction - campingType correction fallback', () => {
  it('bare "nem" after campingType question means camping_site, not skipped campingType', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ skippedChecklist: ['campingType'] }) } }],
    })

    const result = await extractStateUpdate('nem', [], { lastAskedField: 'campingType' })

    expect(result.campingType).toBe('camping_site')
    expect(result.skippedChecklist ?? []).not.toContain('campingType')
  })

  it('GPT semantic extraction maps "nem lesz vadkemp" to camping_site, not skippedChecklist', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ campingType: 'camping_site' }) } }],
    })

    const state: ConversationState = { lastAskedField: 'campingType' }
    const result = await extractStateUpdate('nem lesz vadkemp', [], state)

    expect(result.campingType).toBe('camping_site')
    expect(result.skippedChecklist ?? []).not.toContain('campingType')
  })

  it('clearCampingType does not erase a new concrete campingType from GPT', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            campingType: 'camping_site',
            clearCampingType: true,
          }),
        },
      }],
    })

    const result = await extractStateUpdate(
      'es mi van ha nem akarok vadkempelni?',
      [],
      { campingType: 'wild' },
    )

    expect(result.campingType).toBe('camping_site')
  })

  it('regex-only fallback treats "nem lesz vadkemp" as camping_site over existing wild state', () => {
    const result = extractStateFromMessage(
      'nem lesz vadkemp',
      [{ role: 'user', content: 'vadkempingeznenk' }],
      { campingType: 'wild' },
    )

    expect(result.campingType).toBe('camping_site')
  })

  it('semantic wild camping extraction sets capability without regex-only fallback', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ campingType: 'wild' }) } }],
    })

    const state: ConversationState = { lastAskedField: 'campingType' }
    const result = await extractStateUpdate(
      'lehet megállunk néha útszélen vagy egy tóparton éjszakára',
      [],
      state,
    )

    expect(result.campingType).toBeUndefined()
    expect(result.capabilityPreferences).toEqual([
      {
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'lehet megállunk néha útszélen vagy egy tóparton éjszakára',
        detectedLocale: 'hu',
      },
    ])
    expect(result.skippedChecklist).toContain('campingType')
  })
})
