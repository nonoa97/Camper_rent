import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConversationState } from '@/lib/chat/state'
import type { CamperResult } from '@/lib/chat/availability'

// ──────────────────────────────────────────────────────────────
// Module mocks — declared before any imports that use them
// ──────────────────────────────────────────────────────────────

const mockExtract = vi.fn()
vi.mock('@/lib/chat/extractState', () => ({
  extractStateUpdate: (...args: any[]) => mockExtract(...args),
}))

const mockSearchCampers = vi.fn()
const mockFindEarliest = vi.fn()
const mockGetSpecific = vi.fn()
vi.mock('@/lib/chat/availability', () => ({
  searchAvailableCampers: (...args: any[]) => mockSearchCampers(...args),
  findEarliestAvailableCamper: (...args: any[]) => mockFindEarliest(...args),
  getSpecificCamperAvailability: (...args: any[]) => mockGetSpecific(...args),
}))

const mockLoadFaq = vi.fn()
vi.mock('@/lib/chat/faq', () => ({
  loadFaqItems: (...args: any[]) => mockLoadFaq(...args),
}))

// Controllable OpenAI mock — default returns empty recommendations, can be overridden per-test
const mockGptCreate = vi.fn()
const defaultGptResponse = {
  choices: [{
    message: {
      content: JSON.stringify({
        reply: 'Mikor szeretnétek menni? Elég a hónap is.',
        recommendations: [],
        links: [],
      }),
    },
  }],
}

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
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key'

// Reset all mocks before every test — prevents call history bleed AND restores default GPT response
beforeEach(() => {
  vi.clearAllMocks()
  mockGptCreate.mockResolvedValue(defaultGptResponse)
})

// Import route handler after mocks
import { POST } from '@/app/api/chat/route'
import { NextRequest } from 'next/server'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function makeRequest(message: string, state: ConversationState = {}, history: any[] = []) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, state, history }),
  })
}

const mockCamper: CamperResult = {
  slug: 'hobby-t75hf',
  name: 'Hobby T75HF',
  image_url: 'https://example.com/hobby.jpg',
  price_per_day: 35000,
  type: 'Alkóvos',
  capacity: '1-6 fő',
  wildCampingSuitable: true,
  availableSlots: [{ from: '2026-08-01', to: '2026-08-07', days: 7 }],
}

// ──────────────────────────────────────────────────────────────
// FLOW 1: "Segíts választani" → intent=recommendation, bot kérdez
// ──────────────────────────────────────────────────────────────
describe('Flow 1 – "Segíts választani" starts checklist', () => {
  beforeEach(() => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockGetSpecific.mockResolvedValue([])
  })

  it('responds with a question, not just an acknowledgement', async () => {
    const res = await POST(makeRequest('Segíts választani'))
    const body = await res.json()

    // Bot should ask something (reply contains a question mark or the first checklist question)
    expect(body.reply.length).toBeGreaterThan(0)
    expect(body.updatedState?.intent).toBe('recommendation')
  })

  it('does NOT call Supabase when checklist starts', async () => {
    await POST(makeRequest('Segíts választani'))

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(mockGetSpecific).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 2: "4" after "Hány napra?" → durationDays=4, next ≠ durationDays
// ──────────────────────────────────────────────────────────────
describe('Flow 2 – bare number answer advances checklist', () => {
  const incomingState: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    lastAskedField: 'durationDays',
  }

  beforeEach(() => {
    mockExtract.mockResolvedValue({ durationDays: 4 })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
  })

  it('updatedState.durationDays equals 4', async () => {
    const res = await POST(makeRequest('4', incomingState))
    const body = await res.json()
    expect(body.updatedState?.durationDays).toBe(4)
  })

  it('updatedState.lastAskedField is NOT durationDays after answering it', async () => {
    const res = await POST(makeRequest('4', incomingState))
    const body = await res.json()
    // Next asked field should be passengers (or further), not durationDays again
    expect(body.updatedState?.lastAskedField).not.toBe('durationDays')
  })

  it('does NOT call Supabase (checklist still incomplete: no passengers)', async () => {
    await POST(makeRequest('4', incomingState))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 3: "ez mikor elérhető?" after recommendation → specific camper query
// ──────────────────────────────────────────────────────────────
describe('Flow 3 – proximal availability question targets lastShownCamperSlug', () => {
  const incomingState: ConversationState = {
    intent: 'recommendation',
    lastShownCamperSlug: 'hobby-t75hf',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
  }

  beforeEach(() => {
    mockExtract.mockResolvedValue({ intent: 'availability' })
    mockGetSpecific.mockResolvedValue([mockCamper])
    mockSearchCampers.mockResolvedValue([])
  })

  it('calls getSpecificCamperAvailability with the lastShownCamperSlug', async () => {
    await POST(makeRequest('ez mikor elérhető?', incomingState))
    expect(mockGetSpecific).toHaveBeenCalledWith(
      'hobby-t75hf',
      expect.objectContaining({ lastShownCamperSlug: 'hobby-t75hf' }),
    )
  })

  it('does NOT call general searchAvailableCampers', async () => {
    await POST(makeRequest('ez mikor elérhető?', incomingState))
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('response.recommendations is empty (no chips for specific query)', async () => {
    const res = await POST(makeRequest('ez mikor elérhető?', incomingState))
    const body = await res.json()
    expect(body.recommendations).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 4: nextQuestion present → Supabase TILOS
// ──────────────────────────────────────────────────────────────
describe('Flow 4 – incomplete checklist blocks Supabase', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockGetSpecific.mockResolvedValue([])
  })

  it('no Supabase when month missing', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    await POST(makeRequest('Lakóautót szeretnék bérelni', {}))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('no Supabase when passengers missing (month + duration known)', async () => {
    mockExtract.mockResolvedValue({})
    const state: ConversationState = { intent: 'recommendation', month: '2026-07', durationDays: 7 }
    await POST(makeRequest('igen', state))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('Supabase IS called when checklist is complete', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    const full: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }
    await POST(makeRequest('mutasd az ajánlásokat', full))
    expect(mockSearchCampers).toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 5: no specific date → findEarliestAvailableCamper runs, not empty reply
// ──────────────────────────────────────────────────────────────
describe('Flow 5 – no specific date → findEarliestAvailableCamper', () => {
  // "mindegy mikor" / "leghamarabb" → earliestAvailable=true
  const stateEarliest: ConversationState = {
    intent: 'recommendation',
    earliestAvailable: true,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
  }

  // Month specified but full → fallback to earliest
  const stateWithFullMonth: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
  }

  beforeEach(() => {
    mockExtract.mockResolvedValue({})
  })

  it('calls findEarliestAvailableCamper when earliestAvailable=true', async () => {
    mockFindEarliest.mockResolvedValue([mockCamper])
    await POST(makeRequest('mutasd', stateEarliest))
    expect(mockFindEarliest).toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('calls findEarliestAvailableCamper when month search returns empty (fallback)', async () => {
    mockSearchCampers.mockResolvedValue([]) // requested month is full
    mockFindEarliest.mockResolvedValue([mockCamper])
    await POST(makeRequest('mutasd', stateWithFullMonth))
    expect(mockFindEarliest).toHaveBeenCalled()
  })

  it('response is not an empty error when findEarliest returns results', async () => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([mockCamper])
    const res = await POST(makeRequest('mutasd', stateWithFullMonth))
    const body = await res.json()
    expect(body.reply.length).toBeGreaterThan(0)
    expect(body.reply).not.toContain('nem vagyok teljesen biztos')
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 6: "Milyen autók vannak?" → intent=catalog, no checklist, no Supabase
// ──────────────────────────────────────────────────────────────
describe('Flow 6 – catalog intent: general browsing, no checklist, no Supabase', () => {
  beforeEach(() => {
    mockExtract.mockResolvedValue({ intent: 'catalog' })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockGetSpecific.mockResolvedValue([])
  })

  it('does NOT call any Supabase function', async () => {
    await POST(makeRequest('Milyen autók vannak?'))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(mockGetSpecific).not.toHaveBeenCalled()
  })

  it('updatedState.intent is "catalog"', async () => {
    const res = await POST(makeRequest('Milyen autók vannak?'))
    const body = await res.json()
    expect(body.updatedState?.intent).toBe('catalog')
  })

  it('recommendations is empty (no vehicle chips for general browsing)', async () => {
    const res = await POST(makeRequest('Milyen autók vannak?'))
    const body = await res.json()
    expect(body.recommendations).toEqual([])
  })

  it('checklist NOT started — lastAskedField is undefined', async () => {
    const res = await POST(makeRequest('Milyen autók vannak?'))
    const body = await res.json()
    expect(body.updatedState?.lastAskedField).toBeUndefined()
  })

  it('also works for multilingual catalog queries', async () => {
    await POST(makeRequest('What campers do you have?'))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 7: catalog → recommendation intent switch, checklist starts, state preserved
// ──────────────────────────────────────────────────────────────
describe('Flow 7 – intent switch: catalog → recommendation starts checklist', () => {
  const catalogState: ConversationState = {
    intent: 'catalog',
  }

  beforeEach(() => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
  })

  it('intent switches to "recommendation"', async () => {
    const res = await POST(makeRequest('Segíts választani', catalogState))
    const body = await res.json()
    expect(body.updatedState?.intent).toBe('recommendation')
  })

  it('Supabase NOT called — checklist incomplete after switch', async () => {
    await POST(makeRequest('Segíts választani', catalogState))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('checklist starts — lastAskedField is "month" (first required field)', async () => {
    const res = await POST(makeRequest('Segíts választani', catalogState))
    const body = await res.json()
    expect(body.updatedState?.lastAskedField).toBe('month')
  })

  it('existing state fields preserved after switch', async () => {
    const stateWithPassengers: ConversationState = { intent: 'catalog', passengers: 3 }
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    const res = await POST(makeRequest('Segíts választani', stateWithPassengers))
    const body = await res.json()
    expect(body.updatedState?.passengers).toBe(3)
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 8: Iterative refinement — "túl drága", "mutass másikat", boundary
// ──────────────────────────────────────────────────────────────
describe('Flow 8 – iterative recommendation refinement', () => {
  const cheapCamper: CamperResult = {
    ...mockCamper,
    slug: 'cheap-one',
    price_per_day: 28000,
  }
  const expensiveCamper: CamperResult = {
    ...mockCamper,
    slug: 'expensive-one',
    price_per_day: 50000,
  }

  const fullState: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
  }

  it('refinementPreference "cheaper" is preserved in updatedState', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    mockSearchCampers.mockResolvedValue([cheapCamper])

    const res = await POST(makeRequest('ez túl drága', { ...fullState, lastShownPrice: 35000 }))
    const body = await res.json()
    expect(body.updatedState?.refinementPreference).toBe('cheaper')
  })

  it('Supabase IS called even with refinement (checklist complete)', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    mockSearchCampers.mockResolvedValue([cheapCamper])

    await POST(makeRequest('ez túl drága', { ...fullState, lastShownPrice: 35000 }))
    expect(mockSearchCampers).toHaveBeenCalled()
  })

  it('lastShownPrice is updated in updatedState after a recommendation', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([cheapCamper])
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Íme egy jó lehetőség.',
            recommendations: [{ slug: 'cheap-one', reason: 'Megfelelő opció' }],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest('mutasd az ajánlásokat', fullState))
    const body = await res.json()
    expect(body.updatedState?.lastShownPrice).toBe(28000)
  })

  it('boundary: no cheaper option → reply still has content (no crash)', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    // Only expensive car available → boundary (price > lastShownPrice)
    mockSearchCampers.mockResolvedValue([expensiveCamper])

    const state = { ...fullState, lastShownPrice: 35000 }
    const res = await POST(makeRequest('legyen olcsóbb', state))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.reply.length).toBeGreaterThan(0)
    expect(body.recommendations).toEqual([])
  })

  it('already-shown slug is excluded from allowedSlugs (different preference)', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'different' })
    // Both campers from Supabase, but mockCamper is already shown
    mockSearchCampers.mockResolvedValue([mockCamper, cheapCamper])
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Íme egy másik lehetőség.',
            recommendations: [{ slug: 'cheap-one', reason: 'Más opció' }],
            links: [],
          }),
        },
      }],
    })

    const stateWithShown: ConversationState = { ...fullState, alreadyRecommendedSlugs: ['hobby-t75hf'] }
    const res = await POST(makeRequest('mutass másikat', stateWithShown))
    const body = await res.json()

    // hobby-t75hf should not appear in recommendations (it was already shown)
    const slugs = body.recommendations.map((r: { slug: string }) => r.slug)
    expect(slugs).not.toContain('hobby-t75hf')
  })

  it('refinementPreference resets to undefined on next turn without refinement', async () => {
    // First turn: set refinementPreference
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    mockSearchCampers.mockResolvedValue([cheapCamper])
    const stateAfterRefinement: ConversationState = { ...fullState, lastShownPrice: 35000 }
    const res1 = await POST(makeRequest('ez túl drága', stateAfterRefinement))
    const body1 = await res1.json()
    expect(body1.updatedState?.refinementPreference).toBe('cheaper')

    // Second turn: no refinement extracted → should reset
    mockExtract.mockResolvedValue({ month: '2026-08' })  // new info, no refinement
    mockSearchCampers.mockResolvedValue([cheapCamper])
    const res2 = await POST(makeRequest('inkább augusztusban', body1.updatedState))
    const body2 = await res2.json()
    expect(body2.updatedState?.refinementPreference).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 9: Extras upsell — only on first recommendation, never again
// ──────────────────────────────────────────────────────────────
describe('Flow 9 – extras offered only on first successful recommendation', () => {
  const fullState: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
  }

  let capturedSystemPrompt = ''
  beforeEach(() => {
    mockGptCreate.mockImplementation(async (params: any) => {
      capturedSystemPrompt = params.messages[0]?.content ?? ''
      return defaultGptResponse
    })
  })

  it('extras block included in context on first recommendation (results available)', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    await POST(makeRequest('mutasd az ajánlást', fullState))
    // 'Elérhető extrák' is unique to the extras context block (not in the system prompt)
    expect(capturedSystemPrompt).toContain('Elérhető extrák')
  })

  it('extras block NOT included when extrasOffered is already true', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    const stateWithExtras: ConversationState = { ...fullState, extrasOffered: true }
    await POST(makeRequest('mutass másikat', stateWithExtras))
    expect(capturedSystemPrompt).not.toContain('Elérhető extrák')
  })

  it('extrasOffered set true in updatedState after first recommendation with GPT returning a slug', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Íme egy ajánlás és pár extra.',
            recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó választás' }],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest('mutasd az ajánlást', fullState))
    const body = await res.json()
    expect(body.updatedState?.extrasOffered).toBe(true)
  })

  it('extrasOffered NOT set when GPT returns no recommendations (empty results)', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([])  // no campers available

    const res = await POST(makeRequest('mutasd az ajánlást', fullState))
    const body = await res.json()
    expect(body.updatedState?.extrasOffered).toBeFalsy()
  })

  it('extras block NOT included for ask_next_question mode (checklist still running)', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    mockSearchCampers.mockResolvedValue([mockCamper])

    // Checklist incomplete — bot is asking questions, not recommending
    const incomplete: ConversationState = { intent: 'recommendation', month: '2026-07' }
    await POST(makeRequest('júliusban mennénk', incomplete))
    expect(capturedSystemPrompt).not.toContain('Elérhető extrák')
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 10: Dynamic FAQ system
// ──────────────────────────────────────────────────────────────
describe('Flow 10 – Dynamic FAQ system', () => {
  const faqState: ConversationState = { intent: 'faq' }

  const mockFaqData = [
    { id: 1, question: 'Kell-e B kategóriás jogosítvány?', answer: 'Igen, elegendő a B kategóriás.', category: 'Jogosítvány', language: 'hu', priority: 1 },
    { id: 2, question: 'Mekkora a kaució összege?', answer: '150.000 Ft visszatérítendő kaució.', category: 'Pénzügy', language: 'hu', priority: 2 },
  ]

  let capturedSystemPrompt = ''

  beforeEach(() => {
    mockGptCreate.mockImplementation((args: any) => {
      const systemMsg = args.messages?.find((m: any) => m.role === 'system')
      if (systemMsg) capturedSystemPrompt = systemMsg.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Igen, B kategória elegendő.', recommendations: [], links: [] }) } }],
      })
    })
    mockLoadFaq.mockResolvedValue(mockFaqData)
    mockExtract.mockResolvedValue({ intent: 'faq' })
    mockSearchCampers.mockResolvedValue([])
  })

  it('calls loadFaqItems when intent is faq', async () => {
    await POST(makeRequest('Kell jogosítvány?', faqState))
    expect(mockLoadFaq).toHaveBeenCalledTimes(1)
  })

  it('FAQ items appear in the GPT system prompt context', async () => {
    await POST(makeRequest('Kell jogosítvány?', faqState))
    expect(capturedSystemPrompt).toContain('Kell-e B kategóriás jogosítvány?')
    expect(capturedSystemPrompt).toContain('Igen, elegendő a B kategóriás.')
  })

  it('FAQ items are formatted with category prefix', async () => {
    await POST(makeRequest('Kell jogosítvány?', faqState))
    expect(capturedSystemPrompt).toContain('[Jogosítvány]')
    expect(capturedSystemPrompt).toContain('[Pénzügy]')
  })

  it('does NOT call loadFaqItems when intent is recommendation', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    await POST(makeRequest('Segíts választani', { intent: 'recommendation' }))
    expect(mockLoadFaq).not.toHaveBeenCalled()
  })

  it('does NOT call loadFaqItems when intent is catalog', async () => {
    mockExtract.mockResolvedValue({ intent: 'catalog' })
    await POST(makeRequest('Milyen autók vannak?', { intent: 'catalog' }))
    expect(mockLoadFaq).not.toHaveBeenCalled()
  })

  it('handles empty FAQ array gracefully — reply still has content', async () => {
    mockLoadFaq.mockResolvedValue([])
    const res = await POST(makeRequest('Kell jogosítvány?', faqState))
    const body = await res.json()
    expect(body.reply.length).toBeGreaterThan(0)
    expect(capturedSystemPrompt).toContain('Nem sikerült betölteni a FAQ adatokat')
  })

  it('handles loadFaqItems throwing an error — no crash, reply still returned', async () => {
    mockLoadFaq.mockRejectedValue(new Error('Supabase connection failed'))
    const res = await POST(makeRequest('Kell jogosítvány?', faqState))
    const body = await res.json()
    expect(body.reply.length).toBeGreaterThan(0)
  })

  it('recommendations are always empty in faq mode', async () => {
    const res = await POST(makeRequest('Kell jogosítvány?', faqState))
    const body = await res.json()
    expect(body.recommendations).toEqual([])
  })
})
