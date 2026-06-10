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
  it('GPT skipCurrentField + softPreferences → both in result', async () => {
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
    expect(result.softPreferences).toContain('automata váltós')
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
    expect(result.refinementPreference).toBe('cheaper')
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
    expect(result.refinementPreference).toBe('different')
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

    expect(result.refinementPreference).toBe('different')
    expect(capturedSystemPrompt).toContain('If a recommendation was already shown')
    expect(capturedSystemPrompt).toContain('refinementPreference = different')
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

    expect(result.refinementPreference).toBe('different')
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
  it('prompt tells GPT to treat practical lakeside/forest stops as campingType answer after FAQ', async () => {
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

    expect(result.campingType).toBe('wild')
    expect(capturedSystemPrompt).toContain('practical statement like')
    expect(capturedSystemPrompt).toContain('is a concrete campingType answer: wild')
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
  it('"jó lenne automata" → softPreferences', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({ softPreferences: ['automata váltós'] }),
        },
      }],
    })

    const state: ConversationState = {}
    const result = await extractStateUpdate('Jó lenne automata', [], state)

    expect(result.softPreferences).toContain('automata váltós')
    expect((result.extraRequirements ?? []).length).toBe(0)
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
    expect((result.softPreferences ?? []).length).toBe(0)
  })
})
describe('Extraction - campingType correction fallback', () => {
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

  it('semantic campingType extraction can set wild without regex-only fallback', async () => {
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ campingType: 'wild' }) } }],
    })

    const state: ConversationState = { lastAskedField: 'campingType' }
    const result = await extractStateUpdate(
      'lehet megállunk néha útszélen vagy egy tóparton éjszakára',
      [],
      state,
    )

    expect(result.campingType).toBe('wild')
    expect(result.skippedChecklist ?? []).not.toContain('campingType')
  })
})
