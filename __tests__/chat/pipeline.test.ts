import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { ConversationState, FlowState, SessionMemory } from '@/lib/chat/state'
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

const mockEvaluateCampers = vi.fn()
vi.mock('@/lib/chat/evaluation', () => ({
  evaluateCampers: (...args: any[]) => mockEvaluateCampers(...args),
}))

const mockLoadFaq = vi.fn()
vi.mock('@/lib/chat/faq', () => ({
  loadFaqItems: (...args: any[]) => mockLoadFaq(...args),
}))

const mockLoadExtras = vi.fn()
vi.mock('@/lib/chat/extras', () => ({
  loadExtras: (...args: any[]) => mockLoadExtras(...args),
}))

const mockLoadCatalog = vi.fn()
vi.mock('@/lib/chat/catalog', () => ({
  loadCatalogSummary: (...args: any[]) => mockLoadCatalog(...args),
}))

// Controllable OpenAI mock — default returns empty recommendations, can be overridden per-test
const mockGptCreate = vi.fn()
const defaultGptResponse = {
  choices: [{
    message: {
      content: JSON.stringify({
        reply: 'Mikor mennél?',
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
  mockLoadExtras.mockResolvedValue([])
  mockLoadCatalog.mockResolvedValue([])
  mockEvaluateCampers.mockResolvedValue(undefined)
})

// Import route handler after mocks
import { POST } from '@/app/api/chat/route'
import { NextRequest } from 'next/server'
import { SYSTEM_PROMPT } from '@/lib/chat/prompts'
import { getNextMissingQuestion } from '@/lib/chat/nextQuestion'
import { createMemoryEvent, MAX_MEMORY_EVENTS } from '@/lib/chat/recommendationMemory'

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function makeRequest(
  message: string,
  state: ConversationState = {},
  history: any[] = [],
  flowState?: FlowState,
  sessionMemory?: SessionMemory,
) {
  return new NextRequest('http://localhost/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, state, history, flowState, sessionMemory }),
  })
}

const mockCamper: CamperResult = {
  slug: 'hobby-t75hf',
  name: 'Hobby T75HF',
  image_url: 'https://example.com/hobby.jpg',
  price_per_day: 35000,
  type: 'Alkóvos',
  beds: 6,
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

  it('treats flexible timing without explicit intent as checklist context, not catalog browsing', async () => {
    mockExtract.mockResolvedValue({
      flexibleCriteria: {
        preferredStartWindows: [{
          startDate: '2026-09-21',
          endDate: '2026-09-30',
          precision: 'month_part',
        }],
      },
    })

    const res = await POST(makeRequest('szeptember végén mennénk'))
    const body = await res.json()

    expect(body.updatedState?.flexibleCriteria?.preferredStartWindows).toEqual([
      expect.objectContaining({
        startDate: '2026-09-21',
        endDate: '2026-09-30',
      }),
    ])
    expect(mockLoadCatalog).not.toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })
})

describe('Flexible criteria branching', () => {
  it('searches up to 3 alternative months instead of asking clarification', async () => {
    mockExtract.mockResolvedValue({
      intent: 'recommendation',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
      flexibleCriteria: { months: ['2026-07', '2026-08'] },
    })
    mockSearchCampers.mockResolvedValue([mockCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    const res = await POST(makeRequest('július vagy augusztus, 7 napra, ketten, kempinghelyre', {}))
    const body = await res.json()

    expect(body.updatedState?.lastAskedField).toBeUndefined()
    expect(mockSearchCampers).toHaveBeenCalledTimes(2)
    expect(mockSearchCampers).toHaveBeenNthCalledWith(1, expect.objectContaining({ month: '2026-07', durationDays: 7 }))
    expect(mockSearchCampers).toHaveBeenNthCalledWith(2, expect.objectContaining({ month: '2026-08', durationDays: 7 }))
    expect(capturedSystemPrompt).toContain('[branchSearch]')
    expect(capturedSystemPrompt).toContain('branchSummaries:')
  })

  it('normalizes passenger alternatives to the larger covering passenger count', async () => {
    mockExtract.mockResolvedValue({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
      flexibleCriteria: { passengers: { alternatives: [2, 4], max: 4 } },
    })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('júliusban 7 napra, ketten vagy négyen, kempinghelyre', {}))
    const body = await res.json()

    expect(body.updatedState?.passengers).toBe(4)
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-07', durationDays: 7, passengers: 4 }),
    )
  })

  it('does not search and asks for timing when month alternatives exceed the branch limit', async () => {
    mockExtract.mockResolvedValue({
      intent: 'recommendation',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
      flexibleCriteria: { months: ['2026-07', '2026-08', '2026-09', '2026-10'] },
    })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('nyáron vagy ősszel valamikor', {}))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.updatedState?.lastAskedField).toBe('month')
  })
})

describe('Camper Evaluation Engine context', () => {
  const engineCamper = {
    camperId: 'engine-id',
    camperSlug: 'engine-top',
    camperName: 'Engine Top Camper',
    status: 'eligible',
    score: 42,
    hardFailures: [],
    pricing: { status: 'priced', pricePerDay: 42000, total: 294000 },
    scoreBreakdown: [{ key: 'capacity', label: 'Megfelel a létszámnak', points: 20 }],
    availableSlots: [{ from: '2026-07-01', to: '2026-07-08', days: 7 }],
    imageUrl: 'https://example.com/engine.jpg',
    type: 'Campervan',
    beds: 2,
  }

  function mockEngineResult(topRecommendations = [engineCamper]) {
    mockEvaluateCampers.mockResolvedValue({
      evaluations: topRecommendations,
      topRecommendations,
      branchSummary: [],
      branches: [],
      pricingSummary: { pricedCount: topRecommendations.length, missingPriceCount: 0 },
      discountOpportunities: [],
      explanationContext: { hardConstraintKeys: [], softScoringKeys: ['capacity'] },
    })
  }

  it('passes backend selected recommendations to the renderer context in recommendation mode', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockEngineResult()

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('mutasd az ajánlást', {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }))

    expect(mockEvaluateCampers).toHaveBeenCalled()
    expect(capturedSystemPrompt).toContain('BACKEND SELECTED RECOMMENDATIONS')
    expect(capturedSystemPrompt).toContain('backendSelectedRecommendations:')
    expect(capturedSystemPrompt).toContain('engine-top')
    expect(capturedSystemPrompt).not.toContain('topEvaluatedCandidates')
    expect(capturedSystemPrompt).not.toContain('AVAILABLE CAMPERS')
  })

  it('uses engine topRecommendations for allowed slugs in recommend mode', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockEngineResult()

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Ajánlom.', recommendations: [{ slug: 'engine-top', reason: 'Backend-selected.' }], links: [] }) } }],
      })
    })

    const res = await POST(makeRequest('mutasd az ajánlást', {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }))
    const body = await res.json()

    expect(capturedSystemPrompt).toContain('allowedCamperSlugs:')
    expect(capturedSystemPrompt).toContain('engine-top')
    expect(capturedSystemPrompt).not.toContain('hobby-t75hf,')
    expect(capturedSystemPrompt).toContain('[evaluationStatus: success]')
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.recommendations.map((r: { slug: string }) => r.slug)).toEqual(['engine-top'])
  })

  it('does not return or remember a fake zero price when engine pricing is missing', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockEngineResult([{ ...engineCamper, pricing: { status: 'missing_price' } } as any])
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Ajánlom.', recommendations: [{ slug: 'engine-top', reason: 'Backend-selected.' }], links: [] }) } }],
    })

    const res = await POST(makeRequest('mutasd az ajánlást', {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }))
    const body = await res.json()

    expect(body.recommendations[0].price_per_day).toBeNull()
    expect(body.updatedState).not.toHaveProperty('lastShownPrice')
    expect(body.updatedSessionMemory?.lastRecommendationResult).not.toHaveProperty('pricePerDay')
    expect(body.updatedSessionMemory?.shownOptions?.[0]).not.toHaveProperty('pricePerDay')
  })

  it('does not let legacy search results override engine topRecommendations', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockEngineResult()
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Ajánlom.', recommendations: [{ slug: 'hobby-t75hf', reason: 'Legacy search result.' }], links: [] }) } }],
    })

    const res = await POST(makeRequest('mutasd az ajánlást', {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }))
    const body = await res.json()

    expect(body.recommendations).toEqual([])
  })

  it('engine no-results does not leak legacy search candidates', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockEngineResult([])
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Nincs megfelelő találat.', recommendations: [{ slug: 'hobby-t75hf', reason: 'Legacy result.' }], links: [] }) } }],
    })

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Nincs megfelelő találat.', recommendations: [{ slug: 'hobby-t75hf', reason: 'Legacy result.' }], links: [] }) } }],
      })
    })

    const res = await POST(makeRequest('mutasd az ajánlást', {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(capturedSystemPrompt).toContain('[evaluationStatus: no_results]')
    expect(capturedSystemPrompt).toContain('noResultReasonSummary:')
    expect(body.recommendations).toEqual([])
  })

  it('engine failure can use legacy fallback with explicit status', async () => {
    mockExtract.mockResolvedValue({})
    mockEvaluateCampers.mockRejectedValue(new Error('engine down'))
    mockSearchCampers.mockResolvedValue([mockCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Fallback ajánlás.', recommendations: [{ slug: 'hobby-t75hf', reason: 'Legacy fallback.' }], links: [] }) } }],
      })
    })

    const res = await POST(makeRequest('mutasd az ajánlást', {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }))
    const body = await res.json()

    expect(mockSearchCampers).toHaveBeenCalled()
    expect(capturedSystemPrompt).toContain('[evaluationStatus: failed_fallback_used]')
    expect(body.recommendations.map((r: { slug: string }) => r.slug)).toEqual(['hobby-t75hf'])
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
    mockSearchCampers.mockResolvedValue([mockCamper])
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

  it('checks availability for month + duration before asking passengers', async () => {
    await POST(makeRequest('4', incomingState))
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-07', durationDays: 4 }),
    )
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

  it('checks Supabase when month + duration are known, even if passengers are missing', async () => {
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
    mockSearchCampers.mockResolvedValue([mockCamper])
    const state: ConversationState = { intent: 'recommendation', month: '2026-07', durationDays: 7 }
    await POST(makeRequest('igen', state))
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-07', durationDays: 7 }),
    )
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('Supabase IS called when checklist is complete', async () => {
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
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

  it('does not recommend when user only removes prior wild camping constraint during extraRequirements question', async () => {
    mockExtract.mockResolvedValue({
      campingType: 'camping_site',
      removedCapabilityPreferenceKeys: ['wild_camping'],
      extraRequirementsAsked: true,
    })
    const state: ConversationState = {
      intent: 'recommendation',
      flexibleCriteria: {
        months: ['2026-06', '2026-07', '2026-08'],
        preferredStartWindows: [{
          startDate: '2026-06-01',
          endDate: '2026-08-31',
          precision: 'season',
        }],
      },
      durationDays: 14,
      passengers: 1,
      lastAskedField: 'extraRequirements',
      capabilityPreferences: [
        { key: 'wild_camping', strength: 'hard', sourceText: 'vadkempingeznék', detectedLocale: 'hu' },
      ],
    }

    const res = await POST(makeRequest(
      'meggondoltam magam, nem muszáj vadkempingre alkalmas legyen',
      state,
    ))
    const body = await res.json()

    expect(mockEvaluateCampers).not.toHaveBeenCalled()
    expect(body.recommendations).toEqual([])
    expect(body.updatedState?.capabilityPreferences).toEqual([])
    expect(body.updatedState?.extraRequirementsAsked).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('extraRequirements')
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 5: no specific date → earliest availability handling
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

  it('does not skip duration when earliestAvailable is already in state', async () => {
    mockFindEarliest.mockResolvedValue([mockCamper])
    const res = await POST(makeRequest('mutasd', stateEarliest))
    const body = await res.json()

    expect(body.updatedState?.lastAskedField).toBe('durationDays')
    expect(body.reply).toContain('Oké, és nagyjából hány napra vinnétek el?')
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('current-turn earliest request searches, reports the date, and waits for confirmation', async () => {
    const stateAfterFullMonth: ConversationState = {
      intent: 'availability',
      month: '2026-06',
    }
    const earliestCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [{ from: '2026-07-12', to: '2026-07-18', days: 7 }],
    }
    mockExtract.mockResolvedValue({ earliestAvailable: true, positiveAcknowledgement: true })
    mockFindEarliest.mockResolvedValue([earliestCamper])

    const res = await POST(makeRequest('Mikor van leghamarabb?', stateAfterFullMonth))
    const body = await res.json()

    expect(mockFindEarliest).toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.reply).toContain('2026. július 12.')
    expect(body.reply).toContain('Megfelel')
    expect(body.reply).not.toContain('Hobby T75HF')
    expect(body.reply).not.toContain('Hány fővel utaznál')
    expect(body.updatedState?.month).toBeUndefined()
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        month: '2026-07',
        startDate: '2026-07-12',
        camperSlug: 'hobby-t75hf',
      }),
    )
    expect(body.updatedState?.conversationMemory?.mentionedAvailabilityOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startDate: '2026-07-12',
          endDate: '2026-07-18',
          durationDays: 7,
          camperSlug: 'hobby-t75hf',
        }),
      ]),
    )
    expect(body.updatedState?.conversationMemory?.pendingDecision).toEqual(
      expect.objectContaining({
        type: 'availability_option',
        camperSlug: 'hobby-t75hf',
      }),
    )
    expect(body.updatedSessionMemory?.lastAvailabilityResult).toEqual(
      expect.objectContaining({
        camperSlug: 'hobby-t75hf',
        from: '2026-07-12',
        criteria: expect.objectContaining({
          earliestAvailable: true,
        }),
        criteriaHash: expect.any(String),
      }),
    )
  })

  it('confirmed earliest start date is applied, then duration is asked before passengers', async () => {
    const pendingState: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-12',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
    }
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('igen, jó lesz', pendingState))
    const body = await res.json()

    expect(body.updatedState?.month).toBeUndefined()
    expect(body.updatedState?.startDate).toBe('2026-07-12')
    expect(body.updatedState?.endDate).toBeUndefined()
    expect(body.updatedState?.pendingAvailabilityConfirmation).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('durationDays')
    expect(body.reply).toContain('Oké, és nagyjából hány napra vinnéd el?')
    expect(body.reply).not.toContain('Hány fővel utaznál')
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('positive confirmation wins even if extractor repeats earliestAvailable', async () => {
    const pendingState: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-12',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
    }
    mockExtract.mockResolvedValue({ earliestAvailable: true, positiveAcknowledgement: true })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('igen jó lesz', pendingState))
    const body = await res.json()

    expect(body.updatedState?.month).toBeUndefined()
    expect(body.updatedState?.startDate).toBe('2026-07-12')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('durationDays')
    expect(body.reply).toContain('Oké, és nagyjából hány napra vinnéd el?')
    expect(body.reply).not.toContain('Leghamarabb')
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('accented short confirmation "jó lesz" applies pending availability', async () => {
    const pendingState: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        month: '2026-06',
        startDate: '2026-06-30',
        camperSlug: 'hymer-ayers-rock',
        camperName: 'Hymer Ayers Rock',
      },
    }
    mockExtract.mockResolvedValue({ earliestAvailable: true, positiveAcknowledgement: true })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('jó lesz', pendingState))
    const body = await res.json()

    expect(body.updatedState?.month).toBeUndefined()
    expect(body.updatedState?.startDate).toBe('2026-06-30')
    expect(body.updatedState?.endDate).toBeUndefined()
    expect(body.updatedState?.pendingAvailabilityConfirmation).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('durationDays')
    expect(body.reply).toContain('Oké, és nagyjából hány napra vinnéd el?')
    expect(body.reply).not.toContain('Leghamarabb')
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('confirmed earliest exact duration is applied, then passengers are asked', async () => {
    const pendingState: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-12',
        endDate: '2026-07-20',
        durationDays: 8,
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
    }
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('rendben', pendingState))
    const body = await res.json()

    expect(body.updatedState?.month).toBeUndefined()
    expect(body.updatedState?.startDate).toBe('2026-07-12')
    expect(body.updatedState?.endDate).toBe('2026-07-20')
    expect(body.updatedState?.durationDays).toBe(8)
    expect(body.updatedState?.pendingAvailabilityConfirmation).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('passengers')
    expect(body.reply).toContain('Rendben, hányan utaznátok összesen?')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-07-12',
        endDate: '2026-07-20',
        durationDays: 8,
      }),
    )
  })

  it('pending confirmation wins over accidental availabilityQuestion in the same turn', async () => {
    const pendingState: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
    }
    mockExtract.mockResolvedValue({
      positiveAcknowledgement: true,
      availabilityQuestion: 'longest_duration',
    })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('igen jó lezs', pendingState))
    const body = await res.json()

    expect(body.updatedState?.startDate).toBe('2026-07-13')
    expect(body.updatedState?.endDate).toBe('2026-08-06')
    expect(body.updatedState?.durationDays).toBe(25)
    expect(body.updatedState?.pendingAvailabilityConfirmation).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('passengers')
    expect(body.reply).toContain('Rendben, hányan utaznátok összesen?')
    expect(body.reply).not.toContain('leghosszabb foglalható')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      }),
    )
  })

  it('duration after confirmed earliest start creates exact date range and checks that range', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-06-30',
      lastAskedField: 'durationDays',
    }
    mockExtract.mockResolvedValue({ durationDays: 5 })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('5 napra', state))
    const body = await res.json()

    expect(body.updatedState?.startDate).toBe('2026-06-30')
    expect(body.updatedState?.endDate).toBe('2026-07-04')
    expect(body.updatedState?.durationDays).toBe(5)
    expect(body.updatedState?.month).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('passengers')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-06-30',
        endDate: '2026-07-04',
        durationDays: 5,
        month: undefined,
      }),
    )
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

  it('legacy refinementPreference "cheaper" is bridged to refinementIntent and suppressed in updatedState', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    mockSearchCampers.mockResolvedValue([cheapCamper])

    const res = await POST(makeRequest('ez túl drága', { ...fullState, lastShownPrice: 35000 }))
    const body = await res.json()
    expect(body.updatedState?.refinementPreference).toBeUndefined()
    expect(body.updatedState?.refinementIntent).toEqual(expect.objectContaining({
      intent: 'cheaper',
      sourceText: 'ez túl drága',
    }))
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

  it('dislike after recommendation keeps current trip data and asks for a different camper, not a new checklist', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'different' })
    mockSearchCampers.mockResolvedValue([mockCamper, cheapCamper])
    mockGptCreate.mockResolvedValueOnce({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Mutatok egy másik opciót ugyanazokra a feltételekre.',
            recommendations: [{ slug: 'cheap-one', reason: 'Másik megfelelő opció' }],
            links: [],
          }),
        },
      }],
    })

    const stateWithShown: ConversationState = {
      ...fullState,
      alreadyRecommendedSlugs: ['hobby-t75hf'],
      lastShownCamperSlug: 'hobby-t75hf',
      lastShownPrice: 35000,
    }
    const res = await POST(makeRequest('nem tetszik, mutass másikat', stateWithShown))
    const body = await res.json()

    expect(body.updatedState?.month).toBe('2026-07')
    expect(body.updatedState?.durationDays).toBe(7)
    expect(body.updatedState?.passengers).toBe(2)
    expect(body.updatedState?.campingType).toBe('camping_site')
    expect(body.updatedState?.lastAskedField).not.toBe('month')
    expect(body.reply).not.toContain('Mikor mennél')
    expect(body.recommendations.map((r: { slug: string }) => r.slug)).toEqual(['cheap-one'])
    expect(body.updatedState?.conversationMemory?.lastUserConcern).toEqual(
      expect.objectContaining({
        type: 'preference',
        text: 'nem tetszik, mutass másikat',
      }),
    )
    expect(body.updatedState?.conversationMemory?.mentionedCampers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'cheap-one',
          reason: 'Másik megfelelő opció',
        }),
      ]),
    )
  })

  it('refinementPreference resets to undefined on next turn without refinement', async () => {
    // First turn: set refinementPreference
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    mockSearchCampers.mockResolvedValue([cheapCamper])
    const stateAfterRefinement: ConversationState = { ...fullState, lastShownPrice: 35000 }
    const res1 = await POST(makeRequest('ez túl drága', stateAfterRefinement))
    const body1 = await res1.json()
    expect(body1.updatedState?.refinementPreference).toBeUndefined()
    expect(body1.updatedState?.refinementIntent).toEqual(expect.objectContaining({ intent: 'cheaper' }))

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
    expect(capturedSystemPrompt).toContain('Available extras')
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
    expect(capturedSystemPrompt).toContain('No matching FAQ data was loaded')
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

// ──────────────────────────────────────────────────────────────
// FLOW 11: Change of mind — user corrects previously stated values
// ──────────────────────────────────────────────────────────────
describe('Flow 11 – Change of mind / state correction', () => {
  const fullStateWithHistory: ConversationState = {
    intent: 'recommendation',
    month: '2026-08',
    durationDays: 7,
    passengers: 4,
    campingType: 'wild',
    alreadyRecommendedSlugs: ['hobby-t75hf'],
    lastShownPrice: 35000,
    extrasOffered: true,
  }

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('month correction overwrites old month in updatedState', async () => {
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('Inkább szeptemberben mennénk', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.month).toBe('2026-09')
  })

  it('passenger correction overwrites old passenger count', async () => {
    mockExtract.mockResolvedValue({ passengers: 5 })
    const res = await POST(makeRequest('Mégsem 4-en, hanem 5-en', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.passengers).toBe(5)
  })

  it('duration correction overwrites old durationDays', async () => {
    mockExtract.mockResolvedValue({ durationDays: 10 })
    const res = await POST(makeRequest('Legyen inkább 10 nap', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.durationDays).toBe(10)
  })

  it('month change resets alreadyRecommendedSlugs (fresh results)', async () => {
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('Inkább szeptemberben', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.alreadyRecommendedSlugs).toEqual([])
  })

  it('month change resets extrasOffered so the new search can offer extras again', async () => {
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('Inkább szeptemberben', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.extrasOffered).toBeUndefined()
  })

  it('month change resets lastShownPrice', async () => {
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('Inkább szeptemberben', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.lastShownPrice).toBeUndefined()
  })

  it('other known fields (durationDays, campingType) are preserved after month correction', async () => {
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('Inkább szeptemberben', fullStateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.durationDays).toBe(7)
    expect(body.updatedState?.campingType).toBe('wild')
  })

  it('no reset when same value is repeated (not a real change)', async () => {
    mockExtract.mockResolvedValue({ month: '2026-08' })  // same as current
    const res = await POST(makeRequest('Augusztusban megyünk', fullStateWithHistory))
    const body = await res.json()
    // alreadyRecommendedSlugs should NOT be reset
    expect(body.updatedState?.alreadyRecommendedSlugs).toContain('hobby-t75hf')
  })

  it('earliestAvailable is cleared when user specifies a month', async () => {
    const stateWithEarliest: ConversationState = {
      ...fullStateWithHistory,
      earliestAvailable: true,
      month: undefined,
      alreadyRecommendedSlugs: [],
    }
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('Inkább szeptemberben', stateWithEarliest))
    const body = await res.json()
    expect(body.updatedState?.earliestAvailable).toBeFalsy()
    expect(body.updatedState?.month).toBe('2026-09')
  })

  it('month correction after an exact period clears stale startDate and endDate', async () => {
    const exactState: ConversationState = {
      ...fullStateWithHistory,
      month: undefined,
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({ month: '2026-09' })
    const res = await POST(makeRequest('menjünk inkább szeptemberben', exactState))
    const body = await res.json()

    expect(body.updatedState?.month).toBe('2026-09')
    expect(body.updatedState?.startDate).toBeUndefined()
    expect(body.updatedState?.endDate).toBeUndefined()
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({
        month: '2026-09',
        startDate: undefined,
        endDate: undefined,
      }),
    )
  })

  it('duration correction after an exact start recomputes endDate and preserves other trip data', async () => {
    const exactState: ConversationState = {
      ...fullStateWithHistory,
      month: undefined,
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      passengers: 4,
      campingType: 'wild',
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({ durationDays: 20 })
    const res = await POST(makeRequest('akkor inkább 20 napra', exactState))
    const body = await res.json()

    expect(body.updatedState?.startDate).toBe('2026-07-13')
    expect(body.updatedState?.endDate).toBe('2026-08-01')
    expect(body.updatedState?.durationDays).toBe(20)
    expect(body.updatedState?.passengers).toBe(4)
    expect(body.updatedState?.campingType).toBe('wild')
    expect(getNextMissingQuestion(body.updatedState)).toBeNull()
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({
        startDate: '2026-07-13',
        endDate: '2026-08-01',
        durationDays: 20,
      }),
    )
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 12: Multi-field extraction from a single message
// ──────────────────────────────────────────────────────────────
describe('Flow 12 – Multiple fields extracted from a single message', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('month + passengers + durationDays all set from one message', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation', month: '2026-07', passengers: 4, durationDays: 10 })
    const res = await POST(makeRequest('Júliusban mennénk 4-en 10 napra', { intent: 'recommendation' }))
    const body = await res.json()
    expect(body.updatedState?.month).toBe('2026-07')
    expect(body.updatedState?.passengers).toBe(4)
    expect(body.updatedState?.durationDays).toBe(10)
  })

  it('checklist asks only the next missing field after multi-field answer', async () => {
    // month + passengers + durationDays filled → next missing is campingType
    mockExtract.mockResolvedValue({ intent: 'recommendation', month: '2026-07', passengers: 4, durationDays: 10 })
    const res = await POST(makeRequest('Júliusban mennénk 4-en 10 napra', { intent: 'recommendation' }))
    const body = await res.json()
    // campingType is missing → lastAskedField should be campingType (or extraRequirements)
    // At minimum, it should NOT still ask about month, passengers, or durationDays
    expect(body.updatedState?.lastAskedField).not.toBe('month')
    expect(body.updatedState?.lastAskedField).not.toBe('passengers')
    expect(body.updatedState?.lastAskedField).not.toBe('durationDays')
  })

  it('month + campingType extracted together', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation', month: '2026-09', campingType: 'wild' })
    const res = await POST(makeRequest('Szeptemberben mennénk, inkább vadkempingre', { intent: 'recommendation' }))
    const body = await res.json()
    expect(body.updatedState?.month).toBe('2026-09')
    expect(body.updatedState?.campingType).toBe('wild')
  })

  it('extraRequirements extracted when mentioned mid-conversation', async () => {
    mockExtract.mockResolvedValue({ extraRequirements: ['automata váltós', 'camper van'] })
    const res = await POST(makeRequest(
      'Jó lenne automata váltós és inkább camper vant',
      { intent: 'recommendation', month: '2026-07', durationDays: 7, passengers: 2, campingType: 'wild' },
    ))
    const body = await res.json()
    expect(body.updatedState?.extraRequirements).toContain('automata váltós')
    expect(body.updatedState?.extraRequirements).toContain('camper van')
  })

  it('extraRequirements are deduplicated across messages', async () => {
    // First message: set extraRequirements
    mockExtract.mockResolvedValueOnce({ extraRequirements: ['automata váltós'] })
    const res1 = await POST(makeRequest(
      'Automata váltós legyen',
      { intent: 'recommendation', month: '2026-07', durationDays: 7, passengers: 2, campingType: 'wild' },
    ))
    const state1 = (await res1.json()).updatedState as ConversationState

    // Second message: user mentions same requirement again
    mockExtract.mockResolvedValueOnce({ extraRequirements: ['automata váltós'] })
    const res2 = await POST(makeRequest('Fontos az automata', state1))
    const body2 = await res2.json()

    const reqs = body2.updatedState?.extraRequirements ?? []
    const count = reqs.filter((r: string) => r === 'automata váltós').length
    expect(count).toBe(1)  // deduplicated, not doubled
  })

  it('multi-field correction: month and passengers corrected together', async () => {
    const stateWithHistory: ConversationState = {
      intent: 'recommendation',
      month: '2026-08',
      passengers: 4,
      durationDays: 7,
      campingType: 'wild',
      alreadyRecommendedSlugs: ['hobby-t75hf'],
      lastShownPrice: 35000,
    }
    mockExtract.mockResolvedValue({ month: '2026-09', passengers: 5 })
    const res = await POST(makeRequest('Mégsem augusztus, hanem szeptember, és 4 helyett 5-en', stateWithHistory))
    const body = await res.json()
    expect(body.updatedState?.month).toBe('2026-09')
    expect(body.updatedState?.passengers).toBe(5)
    expect(body.updatedState?.durationDays).toBe(7)  // unchanged
    // Both fields are availability-affecting → history reset
    expect(body.updatedState?.alreadyRecommendedSlugs).toEqual([])
  })

  it('when checklist is complete after multi-field message, Supabase IS called', async () => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    // extraRequirementsAsked already true (last checklist step was asked before)
    const stateWithExtraAsked: ConversationState = { intent: 'recommendation', extraRequirementsAsked: true }
    // All other required fields provided in a single message
    mockExtract.mockResolvedValue({
      intent: 'recommendation', month: '2026-07', passengers: 4, durationDays: 10, campingType: 'wild',
    })
    await POST(makeRequest('Júliusban mennénk 4-en 10 napra, vadkempingre', stateWithExtraAsked))
    expect(mockSearchCampers).toHaveBeenCalledTimes(1)
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 13: Hard vs soft preference classification
// ──────────────────────────────────────────────────────────────
describe('Flow 13 – Hard vs soft preference classification', () => {
  const baseState: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 4,
    campingType: 'wild',
    extraRequirementsAsked: true,
  }

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('soft preference goes to softPreferences, not extraRequirements', async () => {
    mockExtract.mockResolvedValue({ softPreferences: ['automata váltós'] })
    const res = await POST(makeRequest('Jó lenne automata váltós', baseState))
    const body = await res.json()
    expect(body.updatedState?.softPreferences).toContain('automata váltós')
    expect(body.updatedState?.extraRequirements ?? []).not.toContain('automata váltós')
  })

  it('hard requirement goes to extraRequirements, not softPreferences', async () => {
    mockExtract.mockResolvedValue({ extraRequirements: ['automata váltós'] })
    const res = await POST(makeRequest('Mindenképpen automata váltós legyen', baseState))
    const body = await res.json()
    expect(body.updatedState?.extraRequirements).toContain('automata váltós')
    expect(body.updatedState?.softPreferences ?? []).not.toContain('automata váltós')
  })

  it('legacy softPreferences appear in GPT compatibility context block', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((args: any) => {
      const sys = args.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({ choices: [{ message: { content: JSON.stringify({ reply: 'OK', recommendations: [], links: [] }) } }] })
    })
    mockExtract.mockResolvedValue({ softPreferences: ['automata váltós'] })
    await POST(makeRequest('Jó lenne automata', { ...baseState, softPreferences: ['automata váltós'] }))
    expect(capturedSystemPrompt).toContain('legacyCompatibilityContext')
    expect(capturedSystemPrompt).toContain('softPreferences')
    expect(capturedSystemPrompt).toContain('automata váltós')
  })

  it('legacy extraRequirements appear in GPT compatibility context block', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((args: any) => {
      const sys = args.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({ choices: [{ message: { content: JSON.stringify({ reply: 'OK', recommendations: [], links: [] }) } }] })
    })
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Mutasd az ajánlást', { ...baseState, extraRequirements: ['automata váltós'] }))
    expect(capturedSystemPrompt).toContain('legacyCompatibilityContext')
    expect(capturedSystemPrompt).toContain('extraRequirements')
    expect(capturedSystemPrompt).toContain('automata váltós')
    expect(capturedSystemPrompt).not.toContain('[hardRequirements:')
  })

  it('softPreferences are deduplicated across messages', async () => {
    mockExtract.mockResolvedValueOnce({ softPreferences: ['camper van'] })
    const res1 = await POST(makeRequest('Inkább camper van', baseState))
    const state1 = (await res1.json()).updatedState as ConversationState

    mockExtract.mockResolvedValueOnce({ softPreferences: ['camper van'] })
    const res2 = await POST(makeRequest('Camper van lenne a legjobb', state1))
    const body2 = await res2.json()

    const count = (body2.updatedState?.softPreferences ?? []).filter((p: string) => p === 'camper van').length
    expect(count).toBe(1)
  })

  it('hardRequirements and softPreferences can coexist in same message', async () => {
    mockExtract.mockResolvedValue({
      extraRequirements: ['nem alkóvos'],
      softPreferences: ['automata váltós', 'újabb modell'],
    })
    const res = await POST(makeRequest('Semmiképpen nem alkóvos, és jó lenne automata meg újabb modell', baseState))
    const body = await res.json()
    expect(body.updatedState?.extraRequirements).toContain('nem alkóvos')
    expect(body.updatedState?.softPreferences).toContain('automata váltós')
    expect(body.updatedState?.softPreferences).toContain('újabb modell')
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 14: Uncertain user / skip checklist fields
// ──────────────────────────────────────────────────────────────
describe('Flow 14 – Uncertain user: skip checklist fields gracefully', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('"Nem tudom" on campingType → campingType skipped, checklist moves forward', async () => {
    // State where campingType is the next missing field
    const stateBeforeCampingType: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      lastAskedField: 'campingType',
    }
    mockExtract.mockResolvedValue({ skippedChecklist: ['campingType'] })
    const res = await POST(makeRequest('Nem tudom', stateBeforeCampingType))
    const body = await res.json()
    expect(body.updatedState?.skippedChecklist).toContain('campingType')
    expect(body.updatedState?.lastAskedField).not.toBe('campingType')
  })

  it('skipped campingType → getNextMissingQuestion does NOT re-ask it', async () => {
    const stateWithSkip: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      skippedChecklist: ['campingType'],
    }
    mockExtract.mockResolvedValue({})
    const res = await POST(makeRequest('Rendben', stateWithSkip))
    const body = await res.json()
    // Next question should be extraRequirements, NOT campingType again
    expect(body.updatedState?.lastAskedField).not.toBe('campingType')
  })

  it('"Mindegy" on durationDays → durationDays skipped, not blocked', async () => {
    const stateBeforeDuration: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      lastAskedField: 'durationDays',
    }
    mockExtract.mockResolvedValue({ skippedChecklist: ['durationDays'] })
    const res = await POST(makeRequest('Mindegy', stateBeforeDuration))
    const body = await res.json()
    expect(body.updatedState?.skippedChecklist).toContain('durationDays')
  })

  it('skipping extraRequirements also sets extraRequirementsAsked', async () => {
    const stateBeforeExtra: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      campingType: 'wild',
      lastAskedField: 'extraRequirements',
    }
    mockExtract.mockResolvedValue({ skippedChecklist: ['extraRequirements'], extraRequirementsAsked: true })
    const res = await POST(makeRequest('Nincs különösebb igény', stateBeforeExtra))
    const body = await res.json()
    expect(body.updatedState?.extraRequirementsAsked).toBe(true)
  })

  it('all fields skipped + known → checklist completes, Supabase IS called', async () => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    const stateAllSkipped: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      skippedChecklist: ['campingType'],
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ajánlj valamit', stateAllSkipped))
    expect(mockSearchCampers).toHaveBeenCalledTimes(1)
  })

  it('skipNote appears in system prompt when field was just skipped', async () => {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((args: any) => {
      const sys = args.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Semmi gond!', recommendations: [], links: [] }) } }],
      })
    })
    const stateBeforeCampingType: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      lastAskedField: 'campingType',
    }
    mockExtract.mockResolvedValue({ skippedChecklist: ['campingType'] })
    await POST(makeRequest('Nem fontos', stateBeforeCampingType))
    expect(capturedSystemPrompt).toContain('skipNote')
  })

  it('skipped fields accumulate across multiple skips', async () => {
    // Skip campingType first
    mockExtract.mockResolvedValueOnce({ skippedChecklist: ['campingType'] })
    const res1 = await POST(makeRequest('Mindegy', {
      intent: 'recommendation', month: '2026-07', durationDays: 7, passengers: 4, lastAskedField: 'campingType',
    }))
    const state1 = (await res1.json()).updatedState as ConversationState

    // Skip extraRequirements second
    mockExtract.mockResolvedValueOnce({ skippedChecklist: ['extraRequirements'], extraRequirementsAsked: true })
    const res2 = await POST(makeRequest('Nincs igény', { ...state1, lastAskedField: 'extraRequirements' }))
    const body2 = await res2.json()

    expect(body2.updatedState?.skippedChecklist).toContain('campingType')
    expect(body2.updatedState?.skippedChecklist).toContain('extraRequirements')
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 15: Advisor context — userSummary and reason quality
// ──────────────────────────────────────────────────────────────
describe('Flow 15 – Advisor context: userSummary in GPT context', () => {
  const richState: ConversationState = {
    intent: 'recommendation',
    month: '2026-08',
    durationDays: 7,
    passengers: 4,
    campingType: 'wild',
    extraRequirements: ['automata váltós'],
    softPreferences: ['camper van'],
    extraRequirementsAsked: true,
  }

  let capturedSystemPrompt = ''

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
    mockGptCreate.mockImplementation((args: any) => {
      const sys = args.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Ajánlom ezt!', recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó választás 4 főre' }], links: [] }) } }],
      })
    })
    mockExtract.mockResolvedValue({})
  })

  it('userSummary appears in GPT context for recommend mode', async () => {
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).toContain('Amit a userről tudunk')
  })

  it('known month appears in userSummary', async () => {
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).toContain('2026-08')
  })

  it('known passenger count appears in userSummary', async () => {
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).toContain('passengers: 4')
  })

  it('known durationDays appears in userSummary', async () => {
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).toContain('durationDays: 7')
  })

  it('campingType shown as "vadkemping" in userSummary', async () => {
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).toContain('vadkemping')
  })

  it('softPreferences appear in userSummary', async () => {
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).toContain('camper van')
  })

  it('userSummary is empty (not included) when no state fields are known', async () => {
    await POST(makeRequest('Segíts', { intent: 'recommendation' }))
    // "Amit a userről tudunk" phrase appears in the system prompt instructions too,
    // so we check the context-block format (colon + newline + bullet) doesn't appear
    expect(capturedSystemPrompt).not.toMatch(/Amit a userről tudunk:\n/)
  })

  it('wildCampingSuitable does not appear as a camperSummary decision source', async () => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    await POST(makeRequest('Ajánlj vadkempingre', richState))
    expect(capturedSystemPrompt).not.toContain('wildCamping: yes')
    expect(capturedSystemPrompt).not.toContain('wildCamping:')
  })

  it('wildCampingSuitable does not appear as a camperSummary decision source for another camper', async () => {
    const noCampCamper: CamperResult = { ...mockCamper, slug: 'city-camper' }
    mockSearchCampers.mockResolvedValue([noCampCamper])
    await POST(makeRequest('Ajánlj valamit', richState))
    expect(capturedSystemPrompt).not.toContain('wildCamping: no')
    expect(capturedSystemPrompt).not.toContain('wildCamping:')
  })
})

// ──────────────────────────────────────────────────────────────
// FLOW 16: Memory — lastShownCamper note + positive acknowledgement
// ──────────────────────────────────────────────────────────────
describe('Flow 16 – Memory: lastShownCamper context and positive acknowledgement', () => {
  const stateWithLastShown: ConversationState = {
    intent: 'recommendation',
    month: '2026-08',
    durationDays: 7,
    passengers: 4,
    campingType: 'wild',
    extraRequirementsAsked: true,
    lastShownCamperSlug: 'hobby-t75hf',
    lastShownPrice: 35000,
  }

  let capturedSystemPrompt = ''

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
    mockGptCreate.mockImplementation((args: any) => {
      const sys = args.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Válasz', recommendations: [], links: [] }) } }],
      })
    })
  })

  it('lastShownCamper note appears in context block when lastShownCamperSlug is set', async () => {
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ezt szeretném', stateWithLastShown))
    expect(capturedSystemPrompt).toContain('lastShownCamper')
    expect(capturedSystemPrompt).toContain('hobby-t75hf')
  })

  it('lastShownCamper shows name when car is in camperResults', async () => {
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ezt szeretném', stateWithLastShown))
    expect(capturedSystemPrompt).toContain('Hobby T75HF')
  })

  it('lastShownCamper note NOT in context when no car was shown yet', async () => {
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ajánlj valamit', { ...stateWithLastShown, lastShownCamperSlug: undefined }))
    // The formatted note "lastShownCamper: <slug>" should not appear (system prompt text has "lastShownCamper-rel")
    expect(capturedSystemPrompt).not.toMatch(/lastShownCamper: \S/)
  })

  it('positiveAcknowledgement extracted → flag set in updatedState', async () => {
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
    const res = await POST(makeRequest('Ez tetszik!', stateWithLastShown))
    const body = await res.json()
    expect(body.updatedState?.positiveAcknowledgement).toBe(true)
  })

  it('positiveAcknowledgement flag appears in GPT context block', async () => {
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
    await POST(makeRequest('Ez tetszik!', stateWithLastShown))
    expect(capturedSystemPrompt).toContain('positiveAcknowledgement: true')
  })

  it('conversationMemory appears in GPT context block', async () => {
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ezt szeretném', {
      ...stateWithLastShown,
      conversationMemory: {
        mentionedCampers: [{ slug: 'hobby-t75hf', name: 'Hobby T75HF' }],
        lastUserConcern: { type: 'price', text: 'van olcsóbb?' },
      },
    }))
    expect(capturedSystemPrompt).toContain('CONVERSATION MEMORY')
    expect(capturedSystemPrompt).toContain('mentionedCampers')
    expect(capturedSystemPrompt).toContain('van olcsóbb?')
  })

  it('GPT-extracted memory notes merge with existing conversationMemory', async () => {
    mockExtract.mockResolvedValue({
      conversationMemory: {
        notes: [
          {
            type: 'concern',
            subject: 'comfort',
            text: 'User wants something comfortable for a longer trip.',
          },
        ],
      },
    })

    const res = await POST(makeRequest('fontos lenne hogy kényelmes legyen', {
      ...stateWithLastShown,
      conversationMemory: {
        mentionedCampers: [{ slug: 'hobby-t75hf', name: 'Hobby T75HF' }],
        notes: [
          {
            type: 'preference',
            subject: 'price',
            text: 'User previously asked for a cheaper option.',
          },
        ],
      },
    }))
    const body = await res.json()

    expect(body.updatedState?.conversationMemory?.mentionedCampers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ slug: 'hobby-t75hf' }),
      ]),
    )
    expect(body.updatedState?.conversationMemory?.notes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ subject: 'price' }),
        expect.objectContaining({ subject: 'comfort' }),
      ]),
    )
  })

  it('positiveAcknowledgement resets to undefined on next turn (ephemeral)', async () => {
    const stateWithPositive = { ...stateWithLastShown, positiveAcknowledgement: true }
    mockExtract.mockResolvedValue({})  // no positive acknowledgement this turn
    const res = await POST(makeRequest('Valami más', stateWithPositive))
    const body = await res.json()
    expect(body.updatedState?.positiveAcknowledgement).toBeFalsy()
  })
})

// ──────────────────────────────────────────────────────────────
// Flow 17 – Anti-hallucination: honest uncertainty rules
// ──────────────────────────────────────────────────────────────
describe('Flow 17 – Anti-hallucination: honest uncertainty rules', () => {
  it('SYSTEM_PROMPT contains absolute hallucination ban with forbidden items', () => {
    expect(SYSTEM_PROMPT).toContain('NE TALÁLJ KI')
    expect(SYSTEM_PROMPT).toContain('biztosítási feltételeket')
    expect(SYSTEM_PROMPT).toContain('kauciót')
    expect(SYSTEM_PROMPT).toContain('kedvezményeket')
    expect(SYSTEM_PROMPT).toContain('jogosítvány szabályokat')
  })

  it('SYSTEM_PROMPT contains honest uncertainty phrases', () => {
    expect(SYSTEM_PROMPT).toContain('Erről jelenleg nincs pontos információm')
    expect(SYSTEM_PROMPT).toContain('Ezt nem látom a rendszerben')
    expect(SYSTEM_PROMPT).toContain('kapcsolat')
  })

  it('SYSTEM_PROMPT labels CONTEXT block as the single source of truth', () => {
    expect(SYSTEM_PROMPT).toContain('CONTEXT')
    expect(SYSTEM_PROMPT).toContain('IGAZSÁGFORRÁS')
  })

  it('recommend mode TILOS line includes full forbidden list', () => {
    expect(SYSTEM_PROMPT).toContain('biztosítás')
    expect(SYSTEM_PROMPT).toContain('kaució')
    expect(SYSTEM_PROMPT).toContain('jogosítvány szabályok')
    expect(SYSTEM_PROMPT).toContain('korhatár')
  })

  describe('recommend mode context includes data source warning', () => {
    const baseCamper = {
      slug: 'hobby-t75hf', name: 'Hobby T75HF', type: 'alkóvos', beds: 6,
      price_per_day: 38000, image_url: '/img.jpg',
      availableSlots: [{ from: '2026-08-01', to: '2026-08-10', days: 9 }],
    }

    let capturedSystemPrompt = ''
    beforeEach(() => {
      capturedSystemPrompt = ''
      mockGptCreate.mockImplementation((params: any) => {
        const sys = params.messages.find((m: any) => m.role === 'system')
        if (sys) capturedSystemPrompt = sys.content
        return Promise.resolve(defaultGptResponse)
      })
    })

    it('recommend mode context shows ADATFORRÁS warning about unavailable FAQ data', async () => {
      mockExtract.mockResolvedValue({ intent: 'recommendation' })
      mockSearchCampers.mockResolvedValue([baseCamper])
      const state: ConversationState = {
        intent: 'recommendation', month: '2026-08', passengers: 4, durationDays: 7,
        campingType: 'camping_site', extraRequirementsAsked: true,
      }
      await POST(makeRequest('Mi a minimum jogosítvány?', state))
      expect(capturedSystemPrompt).toContain('DATA SOURCES')
      expect(capturedSystemPrompt).toContain('FAQ information')
      expect(capturedSystemPrompt).toContain('insurance')
    })

    it('FAQ mode does NOT show the ADATFORRÁS recommend warning', async () => {
      mockExtract.mockResolvedValue({ intent: 'faq' })
      mockLoadFaq.mockResolvedValue([{ category: 'Jogosítvány', question: 'Kell B?', answer: 'Igen.' }])
      const state: ConversationState = { intent: 'faq' }
      await POST(makeRequest('Kell jogosítvány?', state))
      // FAQ mode context is separate — no camper-mode ADATFORRÁS warning
      expect(capturedSystemPrompt).not.toContain('ADATFORRÁS')
      expect(capturedSystemPrompt).toContain('Igen.')
    })
  })
})

// ──────────────────────────────────────────────────────────────
// Flow 18 – Summarize: shouldSummarize flag logic
// ──────────────────────────────────────────────────────────────
describe('Flow 18 – Summarize: shouldSummarize flag in GPT context', () => {
  const baseCamper: CamperResult = {
    slug: 'hobby-t75hf', name: 'Hobby T75HF', type: 'alkóvos', beds: 6,
    price_per_day: 38000, image_url: '/img.jpg',
    availableSlots: [{ from: '2026-08-01', to: '2026-08-10', days: 9 }],
  }

  const completeState: ConversationState = {
    intent: 'recommendation', month: '2026-08', passengers: 4, durationDays: 7,
    campingType: 'wild', extraRequirementsAsked: true,
  }

  let capturedSystemPrompt = ''
  beforeEach(() => {
    capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })
    mockSearchCampers.mockResolvedValue([baseCamper])
  })

  it('shouldSummarize=true on first recommendation when ≥3 fields known', async () => {
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ajánlj valamit', completeState))
    expect(capturedSystemPrompt).toContain('shouldSummarize: true')
  })

  it('shouldSummarize NOT set when already recommended before', async () => {
    mockExtract.mockResolvedValue({})
    const stateWithPrior = { ...completeState, alreadyRecommendedSlugs: ['hobby-t75hf'] }
    await POST(makeRequest('Ajánlj másikat', stateWithPrior))
    expect(capturedSystemPrompt).not.toContain('shouldSummarize: true')
  })

  it('shouldSummarize NOT set when fewer than 3 fields known', async () => {
    mockExtract.mockResolvedValue({})
    // Only month + passengers = 2 fields → no summary
    const sparseState: ConversationState = {
      intent: 'recommendation', month: '2026-08', passengers: 4, extraRequirementsAsked: true,
    }
    await POST(makeRequest('Ajánlj valamit', sparseState))
    expect(capturedSystemPrompt).not.toContain('shouldSummarize: true')
  })

  it('shouldSummarize=true when 2+ availability fields corrected in one turn', async () => {
    // User already had a recommendation, but corrects month AND passengers simultaneously
    const stateWithPrior = { ...completeState, alreadyRecommendedSlugs: ['hobby-t75hf'], month: '2026-07', passengers: 2 }
    // Extraction returns 2 different availability fields
    mockExtract.mockResolvedValue({ month: '2026-09', passengers: 5 })
    await POST(makeRequest('Mégsem július hanem szeptember, és öten leszünk', stateWithPrior))
    expect(capturedSystemPrompt).toContain('shouldSummarize: true')
  })

  it('shouldSummarize NOT set when only 1 field corrected and still fewer than 3 fields known', async () => {
    // Only month + passengers known (2 fields) — month changes but still < 3 known → no summary
    const sparseWithPrior: ConversationState = {
      intent: 'recommendation', month: '2026-07', passengers: 2,
      alreadyRecommendedSlugs: ['hobby-t75hf'],
    }
    mockExtract.mockResolvedValue({ month: '2026-09' })  // 1 field corrected; alreadyShown resets → isFirst=true but countKnown<3
    await POST(makeRequest('Mégsem július, hanem szeptember', sparseWithPrior))
    expect(capturedSystemPrompt).not.toContain('shouldSummarize: true')
  })

  it('shouldSummarize NOT set in ask_next_question mode', async () => {
    mockExtract.mockResolvedValue({})
    // Incomplete checklist → ask_next_question mode, no summary
    const incompleteState: ConversationState = { intent: 'recommendation', month: '2026-08' }
    await POST(makeRequest('Segíts', incompleteState))
    expect(capturedSystemPrompt).not.toContain('shouldSummarize: true')
  })

  it('SYSTEM_PROMPT contains shouldSummarize formatting instructions', () => {
    expect(SYSTEM_PROMPT).toContain('shouldSummarize')
    expect(SYSTEM_PROMPT).toContain('rövid összefoglalót')
  })
})

// ──────────────────────────────────────────────────────────────
// Pipeline Task 1 – extrasOffered reset on availability change
// ──────────────────────────────────────────────────────────────
describe('Pipeline – extrasOffered reset on availability field change', () => {
  const stateWithExtras: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
    extrasOffered: true,
    alreadyRecommendedSlugs: ['hobby-t75hf'],
  }

  let capturedSystemPrompt = ''
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })
  })

  it('extrasOffered resets in updatedState when user changes month', async () => {
    mockExtract.mockResolvedValue({ month: '2026-08' })
    const res = await POST(makeRequest('Inkább augusztus', stateWithExtras))
    const body = await res.json()
    expect(body.updatedState?.extrasOffered).toBeUndefined()
  })

  it('extras block can reappear in context after month change resets extrasOffered', async () => {
    mockExtract.mockResolvedValue({ month: '2026-08' })
    await POST(makeRequest('Inkább augusztus', stateWithExtras))
    expect(capturedSystemPrompt).toContain('Available extras')
  })

  it('alreadyRecommendedSlugs still reset on availability change', async () => {
    mockExtract.mockResolvedValue({ month: '2026-08' })
    const res = await POST(makeRequest('Inkább augusztus', stateWithExtras))
    const body = await res.json()
    expect(body.updatedState?.alreadyRecommendedSlugs).toEqual([])
  })
})

// ──────────────────────────────────────────────────────────────
// Pipeline Task 2 – isChecklistFlow narrowed
// ──────────────────────────────────────────────────────────────
describe('Pipeline – isChecklistFlow narrowed: no auto-checklist without intent or data', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
  })

  it('empty state + no extracted intent → does NOT enter ask_next_question (checklist not started)', async () => {
    mockExtract.mockResolvedValue({})
    const res = await POST(makeRequest('Szia', {}))
    const body = await res.json()
    // Without intent or recommendation data, bot should not start checklist
    expect(body.updatedState?.lastAskedField).toBeUndefined()
  })

  it('recommendation intent → checklist starts normally', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })
    const res = await POST(makeRequest('Segíts választani', {}))
    const body = await res.json()
    expect(body.updatedState?.intent).toBe('recommendation')
    expect(body.updatedState?.lastAskedField).toBeDefined()
  })

  it('state with recommendation data (month set) but no intent → checklist continues', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    const stateWithMonth: ConversationState = { month: '2026-08' }
    const res = await POST(makeRequest('4-en leszünk', stateWithMonth))
    const body = await res.json()
    // hasRecommendationData=true (month is set) → checklist continues
    expect(body.updatedState?.lastAskedField).toBeDefined()
  })
})

// ──────────────────────────────────────────────────────────────
// Pipeline Task 3 – nextQuestion fallback guard
// ──────────────────────────────────────────────────────────────
describe('Pipeline – nextQuestion fallback: no duplication when already present', () => {
  const incompleteState: ConversationState = {
    intent: 'recommendation',
    month: '2026-08',
    // durationDays missing → next question will be about duration
  }

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
  })

  it('nextQuestion appended when GPT reply does not contain it', async () => {
    mockExtract.mockResolvedValue({})
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Rendben!', recommendations: [], links: [] }) } }],
    })
    const res = await POST(makeRequest('Júliusban', incompleteState))
    const body = await res.json()
    // GPT replied without the question → pipeline appends it
    expect(body.reply).toContain('?')
  })

  it('nextQuestion NOT duplicated when GPT reply already contains it', async () => {
    mockExtract.mockResolvedValue({})
    // Simulate GPT including the actual nextQuestion for durationDays.
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Rendben! Hány napra tervezed?', recommendations: [], links: [] }) } }],
    })
    const res = await POST(makeRequest('Júliusban', incompleteState))
    const body = await res.json()
    const questionCount = (body.reply.match(/\?/g) ?? []).length
    // Reply already had the question → pipeline should NOT append it again
    expect(questionCount).toBe(1)
  })

  it('nextQuestion never appended in recommend mode', async () => {
    const completeState: ConversationState = {
      intent: 'recommendation',
      month: '2026-08',
      durationDays: 7,
      passengers: 4,
      campingType: 'wild',
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockGptCreate.mockResolvedValue({
      choices: [{ message: { content: JSON.stringify({ reply: 'Íme egy ajánlás.', recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó választás' }], links: [] }) } }],
    })
    const res = await POST(makeRequest('Ajánlj valamit', completeState))
    const body = await res.json()
    // recommend mode → no nextQuestion appended
    expect(body.reply).toBe('Íme egy ajánlás.')
  })
})

// ──────────────────────────────────────────────────────────────
// Modes Task 1 – recommend mode entry narrowed
// ──────────────────────────────────────────────────────────────
describe('Modes – recommend mode requires intent or recommendation context', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('explicit recommendation intent → recommend mode (Supabase queried)', async () => {
    const fullState: ConversationState = {
      intent: 'recommendation', month: '2026-08', durationDays: 7,
      passengers: 4, campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ajánlj valamit', fullState))
    expect(mockSearchCampers).toHaveBeenCalled()
  })

  it('no intent + no data → catalog mode (Supabase NOT queried)', async () => {
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Szia', {}))
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('no intent + complete recommendation data → recommend mode (Supabase queried)', async () => {
    // All checklist fields present so nextQuestion=null → resolveMode falls to default with context → recommend
    const stateWithFullData: ConversationState = {
      month: '2026-08', passengers: 4, durationDays: 7, campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    await POST(makeRequest('Ajánlj valamit', stateWithFullData))
    expect(mockSearchCampers).toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// Modes Task 2 – FAQ mini-detour preserves recommendation state
// ──────────────────────────────────────────────────────────────
describe('Modes – FAQ mini-detour during recommendation flow preserves context', () => {
  const stateWithRecommendation: ConversationState = {
    intent: 'recommendation',
    month: '2026-08', durationDays: 7, passengers: 4, campingType: 'wild',
    extraRequirementsAsked: true,
    lastShownCamperSlug: 'hobby-t75hf',
    alreadyRecommendedSlugs: ['hobby-t75hf'],
    lastShownPrice: 35000,
  }

  let capturedSystemPrompt = ''
  beforeEach(() => {
    mockLoadFaq.mockResolvedValue([{ category: 'Jogosítvány', question: 'Kell B?', answer: 'Igen.' }])
    mockSearchCampers.mockResolvedValue([])
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Igen, B kategória elegendő.', recommendations: [], links: [] }) } }],
      })
    })
  })

  it('FAQ intent during recommendation flow → faq mode, recommendations empty', async () => {
    mockExtract.mockResolvedValue({ intent: 'faq' })
    const res = await POST(makeRequest('Kell jogosítvány?', stateWithRecommendation))
    const body = await res.json()
    expect(body.recommendations).toEqual([])
  })

  it('lastShownCamperSlug preserved in updatedState after FAQ detour', async () => {
    mockExtract.mockResolvedValue({ intent: 'faq' })
    const res = await POST(makeRequest('Kell jogosítvány?', stateWithRecommendation))
    const body = await res.json()
    expect(body.updatedState?.lastShownCamperSlug).toBe('hobby-t75hf')
  })

  it('alreadyRecommendedSlugs preserved in updatedState after FAQ detour', async () => {
    mockExtract.mockResolvedValue({ intent: 'faq' })
    const res = await POST(makeRequest('Kell jogosítvány?', stateWithRecommendation))
    const body = await res.json()
    expect(body.updatedState?.alreadyRecommendedSlugs).toContain('hobby-t75hf')
  })

  it('FAQ context includes activeFlow note when lastShownCamperSlug is set', async () => {
    mockExtract.mockResolvedValue({ intent: 'faq' })
    await POST(makeRequest('Kell jogosítvány?', stateWithRecommendation))
    expect(capturedSystemPrompt).toContain('activeFlow')
    expect(capturedSystemPrompt).toContain('hobby-t75hf')
  })
})

// ──────────────────────────────────────────────────────────────
// Modes Task 3 – refinement works after availability mode
// ──────────────────────────────────────────────────────────────
describe('Modes – refinement works after availability check', () => {
  const stateAfterAvailability: ConversationState = {
    intent: 'availability',
    month: '2026-08', durationDays: 7, passengers: 4,
    campingType: 'wild', extraRequirementsAsked: true,
    lastShownCamperSlug: 'hobby-t75hf',
    alreadyRecommendedSlugs: ['hobby-t75hf'],
    lastShownPrice: 35000,
  }

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('refinement preference after availability → switches to recommend mode', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    await POST(makeRequest('Van olcsóbb?', stateAfterAvailability))
    // recommend mode → Supabase queried for fresh results
    expect(mockSearchCampers).toHaveBeenCalled()
  })

  it('catalog mode still does not trigger checklist', async () => {
    mockExtract.mockResolvedValue({ intent: 'catalog' })
    await POST(makeRequest('Milyen autók vannak?', {}))
    // catalog mode → no checklist, no Supabase recommendation query
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// Checklist Task 1 – skippedChecklist stability
// ──────────────────────────────────────────────────────────────
describe('Checklist – skippedChecklist skips the right fields', () => {
  it('month skipped → next question is durationDays', () => {
    const state: ConversationState = {
      intent: 'recommendation',
      skippedChecklist: ['month'],
    }
    const result = getNextMissingQuestion(state)
    expect(result?.field).toBe('durationDays')
  })

  it('durationDays skipped → next question is passengers', () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      skippedChecklist: ['durationDays'],
    }
    const result = getNextMissingQuestion(state)
    expect(result?.field).toBe('passengers')
  })

  it('campingType skipped → next question is extraRequirements', () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-07', durationDays: 7, passengers: 4,
      skippedChecklist: ['campingType'],
    }
    const result = getNextMissingQuestion(state)
    expect(result?.field).toBe('extraRequirements')
  })

  it('extraRequirements skipped → checklist returns null', () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-07', durationDays: 7, passengers: 4,
      campingType: 'wild',
      skippedChecklist: ['extraRequirements'],
    }
    const result = getNextMissingQuestion(state)
    expect(result).toBeNull()
  })

  it('all fields skipped → checklist returns null', () => {
    const state: ConversationState = {
      intent: 'recommendation',
      skippedChecklist: ['month', 'durationDays', 'passengers', 'campingType', 'extraRequirements'],
    }
    const result = getNextMissingQuestion(state)
    expect(result).toBeNull()
  })

  it('pipeline – skip propagates to updatedState and next question advances', async () => {
    // State: month was just asked, user skips it
    mockExtract.mockResolvedValue({ skippedChecklist: ['month'] })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    const state: ConversationState = { intent: 'recommendation', lastAskedField: 'month' }
    const res = await POST(makeRequest('Mindegy', state))
    const body = await res.json()
    expect(body.updatedState.skippedChecklist).toContain('month')
    // Bot should now ask durationDays (next in checklist)
    expect(body.updatedState.lastAskedField).toBe('durationDays')
  })
})

// ──────────────────────────────────────────────────────────────
// Checklist Task 2 – extraRequirements soft vs hard classification
// ──────────────────────────────────────────────────────────────
describe('Checklist – extraRequirements response classified as soft or hard', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('soft preference extracted → ends up in softPreferences, not extraRequirements', async () => {
    mockExtract.mockResolvedValue({ softPreferences: ['automata váltós'] })
    const state: ConversationState = {
      intent: 'recommendation', month: '2026-07', durationDays: 7, passengers: 3,
      campingType: 'wild', lastAskedField: 'extraRequirements',
    }
    const res = await POST(makeRequest('Jó lenne automata', state))
    const body = await res.json()
    expect(body.updatedState.softPreferences).toContain('automata váltós')
    expect(body.updatedState.extraRequirements ?? []).not.toContain('automata váltós')
  })

  it('hard requirement extracted → ends up in extraRequirements', async () => {
    mockExtract.mockResolvedValue({ extraRequirements: ['automata váltós'] })
    const state: ConversationState = {
      intent: 'recommendation', month: '2026-07', durationDays: 7, passengers: 3,
      campingType: 'wild', lastAskedField: 'extraRequirements',
    }
    const res = await POST(makeRequest('Mindenképpen automata', state))
    const body = await res.json()
    expect(body.updatedState.extraRequirements).toContain('automata váltós')
  })

  it('"mindegy / nincs más szempont" → extraRequirementsAsked=true, no new requirements added', async () => {
    // GPT semantic extraction marks the extraRequirements field as closed.
    mockExtract.mockResolvedValue({ extraRequirementsAsked: true })
    const state: ConversationState = {
      intent: 'recommendation', month: '2026-07', durationDays: 7, passengers: 3,
      campingType: 'wild', lastAskedField: 'extraRequirements',
    }
    const res = await POST(makeRequest('Nincs más szempont', state))
    const body = await res.json()
    expect(body.updatedState.extraRequirementsAsked).toBe(true)
    expect((body.updatedState.extraRequirements ?? []).length).toBe(0)
  })
})

// ──────────────────────────────────────────────────────────────
// Checklist Task 3 – earliestAvailable + durationDays coexistence
// ──────────────────────────────────────────────────────────────
describe('Checklist – earliestAvailable and durationDays coexist correctly', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
  })

  it('durationDays provided after earliestAvailable → both preserved in state', async () => {
    const stateWithEarliest: ConversationState = {
      intent: 'recommendation',
      earliestAvailable: true,
      passengers: 3, campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({ durationDays: 7 })
    mockFindEarliest.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('7 napra', stateWithEarliest))
    const body = await res.json()

    expect(body.updatedState.earliestAvailable).toBe(true)
    expect(body.updatedState.durationDays).toBe(7)
  })

  it('findEarliestAvailableCamper called with updated durationDays when earliestAvailable=true', async () => {
    const stateWithEarliest: ConversationState = {
      intent: 'recommendation',
      earliestAvailable: true,
      passengers: 3, campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({ durationDays: 7 })
    mockFindEarliest.mockResolvedValue([])

    await POST(makeRequest('7 napra', stateWithEarliest))

    expect(mockFindEarliest).toHaveBeenCalled()
    const calledState = mockFindEarliest.mock.calls[0][0]
    expect(calledState.durationDays).toBe(7)
    expect(calledState.earliestAvailable).toBe(true)
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// Availability Task 1 – specific camper query ignores alreadyRecommendedSlugs
// ──────────────────────────────────────────────────────────────
describe('Availability – specific camper query ignores alreadyRecommendedSlugs', () => {
  it('"Ez mikor elérhető?" on already-recommended slug → getSpecificCamperAvailability called, not general search', async () => {
    const state: ConversationState = {
      intent: 'availability',
      lastShownCamperSlug: 'hobby-t75hf',
      alreadyRecommendedSlugs: ['hobby-t75hf'],
      month: '2026-08',
    }
    mockExtract.mockResolvedValue({ intent: 'availability' })
    mockGetSpecific.mockResolvedValue([mockCamper])

    await POST(makeRequest('Ez mikor elérhető?', state))

    expect(mockGetSpecific).toHaveBeenCalledWith('hobby-t75hf', expect.anything())
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('specific camper availability returned even if slug is in alreadyRecommendedSlugs', async () => {
    const state: ConversationState = {
      intent: 'availability',
      lastShownCamperSlug: 'hobby-t75hf',
      alreadyRecommendedSlugs: ['hobby-t75hf'],
    }
    mockExtract.mockResolvedValue({ intent: 'availability' })
    mockGetSpecific.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('Mikor szabad?', state))
    const body = await res.json()

    expect(body.availability).toHaveLength(1)
    expect(body.availability[0].slug).toBe('hobby-t75hf')
  })
})

// ──────────────────────────────────────────────────────────────
// Availability Task 2 – month fallback context communication
// ──────────────────────────────────────────────────────────────
describe('Availability – month fallback communicates unavailability in context', () => {
  it('month search empty + fallback has results → context contains requestedMonthUnavailable and fallbackEarliest', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-08', durationDays: 7, passengers: 4,
      campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([mockCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('Ajánlj valamit', state))

    expect(capturedSystemPrompt).toContain('requestedMonthUnavailable')
    expect(capturedSystemPrompt).toContain('2026-08')
    expect(capturedSystemPrompt).toContain('fallbackEarliest')
  })

  it('month search has results → no fallback markers in context', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-08', durationDays: 7, passengers: 4,
      campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('Ajánlj valamit', state))

    expect(capturedSystemPrompt).not.toContain('fallbackEarliest')
    expect(capturedSystemPrompt).not.toContain('requestedMonthUnavailable')
  })
})

// ──────────────────────────────────────────────────────────────
// Availability Task 3 – exact date range fallback is explicit and conversational
// ──────────────────────────────────────────────────────────────
describe('Availability – exact date range falls back with a clear explanation', () => {
  it('startDate+endDate with no results asks about the next available period', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      startDate: '2026-08-10', endDate: '2026-08-17',
      passengers: 4, campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([mockCamper])

    await POST(makeRequest('Ajánlj', state))

    expect(mockSearchCampers).toHaveBeenCalled()
    expect(mockFindEarliest).toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// Availability Task 4 – durationDays only in context when set
// ──────────────────────────────────────────────────────────────
describe('Availability – durationDays only in GPT context when explicitly set', () => {
  it('no durationDays in state → [durationDays:] absent from GPT context', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-08', passengers: 4,
      campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('Ajánlj', state))

    expect(capturedSystemPrompt).not.toContain('[durationDays:')
  })

  it('durationDays set → [durationDays: 7] present in GPT context', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-08', durationDays: 7, passengers: 4,
      campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('Ajánlj', state))

    expect(capturedSystemPrompt).toContain('[durationDays: 7]')
  })
})

// ──────────────────────────────────────────────────────────────
// Availability Task 5 – wild camping hard vs soft filter
// ──────────────────────────────────────────────────────────────
describe('Availability – wild camping filter: hard when campingType set, soft otherwise', () => {
  it('campingType=wild → searchAvailableCampers called with campingType=wild in state', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-08', durationDays: 7, passengers: 3,
      campingType: 'wild', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    await POST(makeRequest('Ajánlj', state))

    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ campingType: 'wild' }),
    )
  })

  it('no campingType + only softPreferences → searchAvailableCampers called without campingType (hard filter not applied)', async () => {
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-08', durationDays: 7, passengers: 3,
      skippedChecklist: ['campingType'],
      extraRequirementsAsked: true,
      softPreferences: ['vadkemping-barát'],
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    await POST(makeRequest('Ajánlj', state))

    const calledState = mockSearchCampers.mock.calls[0][0]
    expect(calledState.campingType).toBeUndefined()
  })
})

// ──────────────────────────────────────────────────────────────
// Reply generation Task 1 – SYSTEM_PROMPT reason restrictions
// ──────────────────────────────────────────────────────────────
describe('Reply generation – SYSTEM_PROMPT reason field restrictions', () => {
  it('SYSTEM_PROMPT forbids inventing data in reason field', () => {
    expect(SYSTEM_PROMPT).toContain('Tilos reason-ben kitalálni')
  })

  it('SYSTEM_PROMPT lists specific banned hallucination topics', () => {
    expect(SYSTEM_PROMPT).toContain('felszereltség')
    expect(SYSTEM_PROMPT).toContain('műszaki adat')
    expect(SYSTEM_PROMPT).toContain('évjárat')
  })

  it('SYSTEM_PROMPT restricts reason to context-available data only', () => {
    expect(SYSTEM_PROMPT).toContain('Csak CONTEXT-ben szereplő objektív adatokra hivatkozhatsz')
  })

  it('SYSTEM_PROMPT forbids camper recommendations in ask_next_question mode', () => {
    expect(SYSTEM_PROMPT).toContain('TILOS autót ajánlani')
    expect(SYSTEM_PROMPT).toContain('recommendations: [] kötelező')
  })
})

// ──────────────────────────────────────────────────────────────
// Végső simítások – dynamic catalog and extras from DB
// ──────────────────────────────────────────────────────────────
describe('Végső simítások – catalog prices from DB', () => {
  it('catalog mode → loadCatalogSummary called', async () => {
    mockExtract.mockResolvedValue({ intent: 'catalog' })
    mockLoadCatalog.mockResolvedValue([
      { type: 'Camper van', minPrice: 38000, maxPrice: 52000, count: 4 },
      { type: 'Alkóvos', minPrice: 50000, maxPrice: 58000, count: 3 },
    ])

    await POST(makeRequest('Milyen autók vannak?', {}))

    expect(mockLoadCatalog).toHaveBeenCalled()
  })

  it('catalog context includes DB prices when catalogSummary provided', async () => {
    mockExtract.mockResolvedValue({ intent: 'catalog' })
    mockLoadCatalog.mockResolvedValue([
      { type: 'Camper van', minPrice: 38000, maxPrice: 52000, count: 4 },
    ])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('Milyen autók vannak?', {}))

    expect(capturedSystemPrompt).toContain('Camper van')
    expect(capturedSystemPrompt).toContain('38')   // minPrice appears
    expect(capturedSystemPrompt).toContain('Ft/nap')
  })

  it('catalog mode does NOT call loadFaqItems or loadExtras', async () => {
    mockExtract.mockResolvedValue({ intent: 'catalog' })
    mockLoadCatalog.mockResolvedValue([])

    await POST(makeRequest('Milyen autók vannak?', {}))

    expect(mockLoadFaq).not.toHaveBeenCalled()
    expect(mockLoadExtras).not.toHaveBeenCalled()
  })
})

describe('Végső simítások – extras with prices from DB', () => {
  it('extras context includes DB prices when extrasItems provided', async () => {
    const fullState: ConversationState = {
      intent: 'recommendation',
      month: '2026-07', durationDays: 7, passengers: 2,
      campingType: 'camping_site', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockLoadExtras.mockResolvedValue([
      { name: 'Mountain bike', category: 'Movement', price_per_day: 3500 },
      { name: 'Electric bike', category: 'Movement', price_per_day: 5000 },
    ])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    await POST(makeRequest('Ajánlj valamit', fullState))

    expect(capturedSystemPrompt).toContain('Mountain bike')
    expect(capturedSystemPrompt).toContain('3500')  // price from DB
    expect(capturedSystemPrompt).toContain('Ft/nap')
  })

  it('loadExtras called only when offerExtras is true', async () => {
    const fullState: ConversationState = {
      intent: 'recommendation',
      month: '2026-07', durationDays: 7, passengers: 2,
      campingType: 'camping_site', extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    await POST(makeRequest('Ajánlj', fullState))

    expect(mockLoadExtras).toHaveBeenCalled()
  })

  it('loadExtras NOT called when extrasOffered already true', async () => {
    const stateWithExtras: ConversationState = {
      intent: 'recommendation',
      month: '2026-07', durationDays: 7, passengers: 2,
      campingType: 'camping_site', extraRequirementsAsked: true,
      extrasOffered: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])

    await POST(makeRequest('Mutass másikat', stateWithExtras))

    expect(mockLoadExtras).not.toHaveBeenCalled()
  })
})

// ──────────────────────────────────────────────────────────────
// REGRESSION: checklist guard — Supabase NEM fut amíg a checklist nem teljes
// ──────────────────────────────────────────────────────────────
describe('Regression – checklist blocks Supabase on fresh recommendation start', () => {
  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])
    mockGetSpecific.mockResolvedValue([])
  })

  it('Test 1: fresh state + "lakóautót szeretnék bérelni" → ask_next_question, no Supabase, reply tartalmazza a hónap kérdést', async () => {
    mockExtract.mockResolvedValue({ intent: 'recommendation' })

    const res = await POST(makeRequest('lakóautót szeretnék bérelni', {}))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(body.updatedState?.lastAskedField).toBe('month')
    expect(body.recommendations).toEqual([])
    expect(body.reply).toContain('Mikor mennél')
  })

  it('Test 2: state={intent:recommendation, passengers:2} + "hát ketten utaznánk" → month még mindig kérdezi, no Supabase', async () => {
    mockExtract.mockResolvedValue({ passengers: 2 })
    const incomingState: ConversationState = { intent: 'recommendation', passengers: 2 }

    const res = await POST(makeRequest('hát ketten utaznánk', incomingState))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(body.updatedState?.passengers).toBe(2)
    expect(body.updatedState?.lastAskedField).toBe('month')
    expect(body.recommendations).toEqual([])
    expect(body.reply).toContain('Mikor')
    expect(body.reply).toContain('?')
  })

  it('Test 3: teljes checklist → getNextMissingQuestion null, Supabase fut', async () => {
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    const completeState: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }

    expect(getNextMissingQuestion(completeState)).toBeNull()

    await POST(makeRequest('mutasd', completeState))

    expect(mockSearchCampers).toHaveBeenCalled()
  })
})
describe('Regression - campingType correction from wild to camping_site', () => {
  const wildState: ConversationState = {
    intent: 'availability',
    month: '2026-08',
    durationDays: 8,
    passengers: 5,
    campingType: 'wild',
    extraRequirementsAsked: true,
    alreadyRecommendedSlugs: ['old-camper'],
    lastShownPrice: 52000,
    extrasOffered: true,
  }

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockGetSpecific.mockResolvedValue([])
  })

  it('"es mi van ha nem akarok vadkempelni?" changes campingType and searches without re-asking', async () => {
    mockExtract.mockResolvedValue({ campingType: 'camping_site' })

    const res = await POST(makeRequest('es mi van ha nem akarok vadkempelni?', wildState))
    const body = await res.json()

    expect(body.updatedState?.campingType).toBe('camping_site')
    expect(body.updatedState?.lastAskedField).not.toBe('campingType')
    expect(body.updatedState?.alreadyRecommendedSlugs).toEqual([])
    expect(body.updatedState?.lastShownPrice).toBeUndefined()
    expect(body.updatedState?.extrasOffered).toBeUndefined()
    expect(getNextMissingQuestion(body.updatedState)).toBeNull()
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ campingType: 'camping_site' }),
    )
    expect(body.reply).not.toContain('Inkább vadkempingeznétek')
  })

  it('"nem lesz vadkemp" changes campingType and does not repeat campingType question', async () => {
    mockExtract.mockResolvedValue({ campingType: 'camping_site' })

    const res = await POST(makeRequest('nem lesz vadkemp', wildState))
    const body = await res.json()

    expect(body.updatedState?.campingType).toBe('camping_site')
    expect(body.updatedState?.lastAskedField).not.toBe('campingType')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ campingType: 'camping_site' }),
    )
    expect(body.reply).not.toContain('Inkább vadkempingeznétek')
  })

  it('elliptic "if not wild camping" correction changes campingType and searches without re-asking', async () => {
    mockExtract.mockResolvedValue({ campingType: 'camping_site' })

    const res = await POST(makeRequest('és ha nem vadkemp?', wildState))
    const body = await res.json()

    expect(body.updatedState?.campingType).toBe('camping_site')
    expect(getNextMissingQuestion(body.updatedState)).toBeNull()
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ campingType: 'camping_site' }),
    )
    expect(body.reply).not.toContain('Inkább vadkempingeznétek')
  })

  it('"nezd emg" with complete checklist searches with current campingType', async () => {
    const completeState: ConversationState = {
      intent: 'recommendation',
      month: '2026-08',
      durationDays: 8,
      passengers: 5,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})

    const res = await POST(makeRequest('nezd emg', completeState))
    const body = await res.json()

    expect(body.updatedState?.lastAskedField).not.toBe('campingType')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ campingType: 'camping_site' }),
    )
  })
})

describe('Regression - ask_next_question strips stale extra questions', () => {
  it('does not keep a stale pending availability confirmation before the passenger question', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      lastAskedField: 'passengers',
    }
    mockExtract.mockResolvedValue({ passengers: 4 })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Leghamarabb **2026. július 13. és 2026. augusztus 6. között** találok szabad autót 25 napra. Megfelel ez az időszak? Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?',
            recommendations: [],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest('4', state))
    const body = await res.json()

    expect(body.updatedState?.passengers).toBe(4)
    expect(body.updatedState?.lastAskedField).toBe('campingType')
    expect(body.reply).toBe('Inkább kempinghelyeken állnátok meg, vagy olyan autót keressek, ami vadkempinghez is jó?')
    expect(body.reply).not.toContain('Megfelel ez az időszak')
  })

  it('does not repeat a confirmed exact availability window while asking the next checklist question', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      lastAskedField: 'passengers',
    }
    mockExtract.mockResolvedValue({ passengers: 4 })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])

    const res = await POST(makeRequest('4', state))
    const body = await res.json()

    expect(body.updatedState?.lastAskedField).toBe('campingType')
    expect(body.reply).toBe('Inkább kempinghelyeken állnátok meg, vagy olyan autót keressek, ami vadkempinghez is jó?')
    expect(body.reply).not.toContain('2026. július 13.')
    expect(body.reply).not.toContain('2026. augusztus 6.')
    expect(body.reply).not.toContain('Találtam szabad opciót')
  })

  it('passenger answer clears stale pending availability confirmation instead of asking for date confirmation again', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      lastAskedField: 'passengers',
      pendingAvailabilityConfirmation: {
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
    }
    mockExtract.mockResolvedValue({ passengers: 4 })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])

    const res = await POST(makeRequest('4', state))
    const body = await res.json()

    expect(body.updatedState?.passengers).toBe(4)
    expect(body.updatedState?.pendingAvailabilityConfirmation).toBeUndefined()
    expect(body.updatedState?.lastAskedField).toBe('campingType')
    expect(body.reply).toBe('Inkább kempinghelyeken állnátok meg, vagy olyan autót keressek, ami vadkempinghez is jó?')
    expect(body.reply).not.toContain('Megfelel ez az időszak')
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('passenger answer wins over accidental earliestAvailable extraction from earlier context', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      lastAskedField: 'passengers',
    }
    mockExtract.mockResolvedValue({ passengers: 4, earliestAvailable: true })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('4', state))
    const body = await res.json()

    expect(body.updatedState?.passengers).toBe(4)
    expect(body.updatedState?.lastAskedField).toBe('campingType')
    expect(body.reply).toBe('Inkább kempinghelyeken állnátok meg, vagy olyan autót keressek, ami vadkempinghez is jó?')
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })
})

describe('Regression - exact period fallback is explained conversationally', () => {
  it('explains when a new condition makes the confirmed period unavailable and asks about the next period', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      passengers: 4,
      capabilityPreferences: [
        { key: 'wild_camping', strength: 'hard', sourceText: 'vadkemping', detectedLocale: 'hu' },
      ],
      extraRequirementsAsked: true,
    }
    const fallbackCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [{ from: '2026-09-08', to: '2026-10-02', days: 25 }],
    }
    mockExtract.mockResolvedValue({ extraRequirementsAsked: true })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([fallbackCamper])

    const res = await POST(makeRequest('nincs', state))
    const body = await res.json()

    expect(body.reply).toContain('Az elfogadott')
    expect(body.reply).toContain('a vadkempinges feltétellel')
    expect(body.reply).toContain('**2026. július 13. és 2026. augusztus 6. között**')
    expect(body.reply).toContain('**2026. szeptember 8. és 2026. október 2. között**')
    expect(body.reply).not.toContain('<u>')
    expect(body.reply).not.toContain('<strong>')
    expect(body.reply).toContain('Megfelel ez az időszak?')
    expect(body.reply).not.toContain('Leghamarabb')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        startDate: '2026-09-08',
        endDate: '2026-10-02',
        durationDays: 25,
      }),
    )
    expect(body.recommendations).toEqual([])
    expect(body.availability).toEqual([])
  })

  it('availability mode does not return recommendation cards alongside availability slots', async () => {
    const state: ConversationState = {
      intent: 'availability',
      startDate: '2026-09-08',
      endDate: '2026-10-02',
      durationDays: 25,
      passengers: 4,
      campingType: 'wild',
      extraRequirementsAsked: true,
    }
    const availableCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [{ from: '2026-09-08', to: '2026-10-02', days: 25 }],
    }
    mockExtract.mockResolvedValue({ positiveAcknowledgement: true })
    mockSearchCampers.mockResolvedValue([availableCamper])
    mockFindEarliest.mockResolvedValue([])
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'A Hobby T75HF elérhető a megadott időszakra.',
            recommendations: [{ slug: 'hobby-t75hf', reason: 'Alkalmas 4 főnek.' }],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest('meg', state))
    const body = await res.json()

    expect(body.availability).toHaveLength(1)
    expect(body.availability[0].slug).toBe('hobby-t75hf')
    expect(body.recommendations).toEqual([])
  })
})

describe('Regression - booked period is not exposed as full-month availability', () => {
  it('pipeline context and response do not contain fake July 1-30/31 availability', async () => {
    const splitCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [
        { from: '2026-07-01', to: '2026-07-08', days: 8 },
        { from: '2026-07-19', to: '2026-07-26', days: 8 },
      ],
    }
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-07',
      durationDays: 8,
      passengers: 5,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([splitCamper])

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages?.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve(defaultGptResponse)
    })

    const res = await POST(makeRequest('júliusban 8 napra mikor szabad?', state))
    const body = await res.json()
    const serializedResponse = JSON.stringify(body)

    expect(capturedSystemPrompt).not.toContain('2026-07-01 – 2026-07-31')
    expect(capturedSystemPrompt).not.toContain('2026-07-01 – 2026-07-30')
    expect(capturedSystemPrompt).not.toContain('availableTo: 2026-07-31')
    expect(capturedSystemPrompt).not.toContain('availableTo: 2026-07-30')
    expect(capturedSystemPrompt).toContain('from: 2026-07-01')
    expect(capturedSystemPrompt).toContain('to: 2026-07-08')
    expect(capturedSystemPrompt).toContain('from: 2026-07-19')
    expect(capturedSystemPrompt).toContain('to: 2026-07-26')
    expect(serializedResponse).not.toContain('2026-07-01","to":"2026-07-31')
    expect(serializedResponse).not.toContain('2026-07-01","to":"2026-07-30')
  })
})

describe('Regression - FAQ interruption resumes checklist without asking during the FAQ answer', () => {
  it('keeps checklist state through FAQ, does not ask there, then completes and searches', async () => {
    const campingQuestion = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 10,
      passengers: 4,
    })?.question!
    const extrasQuestion = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 10,
      passengers: 4,
      campingType: 'wild',
    })?.question!

    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([
      {
        id: 1,
        question: 'Mi az a vadkemping?',
        answer: 'Kempingen kívüli, természetközeli megállást jelent.',
        category: 'Utazas',
        language: 'hu',
        priority: 1,
      },
    ])

    mockExtract
      .mockResolvedValueOnce({ intent: 'recommendation' })
      .mockResolvedValueOnce({ month: '2026-07' })
      .mockResolvedValueOnce({ durationDays: 10 })
      .mockResolvedValueOnce({ passengers: 4 })
      .mockResolvedValueOnce({ intent: 'faq' })
      .mockResolvedValueOnce({ intent: 'faq' })
      .mockResolvedValueOnce({ campingType: 'wild' })
      .mockResolvedValueOnce({ extraRequirementsAsked: true, skippedChecklist: ['extraRequirements'] })

    mockGptCreate
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reply: 'Rendben.', recommendations: [], links: [] }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reply: 'Oké.', recommendations: [], links: [] }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reply: 'Értem.', recommendations: [], links: [] }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reply: 'Megvan.', recommendations: [], links: [] }) } }] })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: `A vadkemping kempingen kívüli megállást jelent. ${campingQuestion} ${campingQuestion}`,
              recommendations: [],
              links: [],
            }),
          },
        }],
      })
      .mockResolvedValueOnce({
        choices: [{
          message: {
            content: JSON.stringify({
              reply: `A vadkemping legalitása helyfüggő, mindig a helyi szabályokat kell nézni. ${campingQuestion}`,
              recommendations: [],
              links: [],
            }),
          },
        }],
      })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reply: 'Rendben, vadkemping is lehet.', recommendations: [], links: [] }) } }] })
      .mockResolvedValueOnce({ choices: [{ message: { content: JSON.stringify({ reply: 'Összeraktam az ajánlást.', recommendations: [], links: [] }) } }] })

    let state: ConversationState = {}

    let res = await POST(makeRequest('Segíts nekem lakóautót választani', state))
    let body = await res.json()
    state = body.updatedState
    expect(mockSearchCampers).not.toHaveBeenCalled()

    res = await POST(makeRequest('jövő hónapban mennénk', state))
    body = await res.json()
    state = body.updatedState
    expect(mockSearchCampers).toHaveBeenCalledTimes(1)

    res = await POST(makeRequest('10', state))
    body = await res.json()
    state = body.updatedState
    expect(mockSearchCampers).toHaveBeenCalledTimes(2)

    res = await POST(makeRequest('4-en', state))
    body = await res.json()
    state = body.updatedState
    expect(state.lastAskedField).toBe('campingType')
    expect(mockSearchCampers).toHaveBeenCalledTimes(2)

    res = await POST(makeRequest('Mi az a vadkemping?', state))
    body = await res.json()
    state = body.updatedState
    const campingQuestionMatches = body.reply.match(new RegExp(campingQuestion.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []
    expect(campingQuestionMatches).toHaveLength(0)
    expect(state.intent).toBe('recommendation')
    expect(state.lastAskedField).toBe('campingType')
    expect(mockSearchCampers).toHaveBeenCalledTimes(2)

    res = await POST(makeRequest('oo ez legális cucc?', state))
    body = await res.json()
    state = body.updatedState
    expect(body.reply).not.toContain(campingQuestion)
    expect(state.intent).toBe('recommendation')
    expect(state.lastAskedField).toBe('campingType')
    expect(mockSearchCampers).toHaveBeenCalledTimes(2)

    res = await POST(makeRequest('Akkor igen lenne benne kempingen kívüli megálló is', state))
    body = await res.json()
    state = body.updatedState
    expect(state.campingType).toBe('wild')
    expect(state.lastAskedField).toBe('extraRequirements')
    expect(body.reply).toContain(extrasQuestion)
    expect(mockSearchCampers).toHaveBeenCalledTimes(2)

    res = await POST(makeRequest('nincs', state))
    body = await res.json()
    state = body.updatedState
    expect(state.extraRequirementsAsked).toBe(true)
    expect(getNextMissingQuestion(state)).toBeNull()
    expect(mockSearchCampers).toHaveBeenCalledTimes(3)
    expect(body.reply).not.toContain(campingQuestion)
  })

  it('roadside/lakeside campingType answer moves to extras and strips stale camping question from reply', async () => {
    const campingQuestion = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 10,
      passengers: 4,
    })?.question!
    const extrasQuestion = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 10,
      passengers: 4,
      campingType: 'wild',
    })?.question!
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 10,
      passengers: 4,
      lastAskedField: 'campingType',
    }

    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
    mockExtract.mockResolvedValue({ campingType: 'wild' })
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: `Ez szuper, így vadkempinggel számolok. ${campingQuestion}`,
            recommendations: [],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest(
      'lehet megállunk néha útszélen vagy egy tóparton éjszakára',
      state,
    ))
    const body = await res.json()

    expect(body.updatedState?.campingType).toBe('wild')
    expect(body.updatedState?.lastAskedField).toBe('extraRequirements')
    expect(body.reply).not.toContain(campingQuestion)
    expect(body.reply).toContain(extrasQuestion)
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('practical wild-camping answer after legal FAQ wins over faq intent and moves to extras', async () => {
    const campingQuestion = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 20,
      passengers: 4,
    })?.question!
    const extrasQuestion = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 20,
      passengers: 4,
      campingType: 'wild',
    })?.question!
    const state: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      startDate: '2026-07-13',
      endDate: '2026-08-02',
      durationDays: 20,
      passengers: 4,
      lastAskedField: 'campingType',
    }

    mockSearchCampers.mockResolvedValue([mockCamper])
    mockFindEarliest.mockResolvedValue([])
    mockLoadFaq.mockResolvedValue([])
    mockExtract.mockResolvedValue({ intent: 'faq', campingType: 'wild' })
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Értem, vadkempinggel számolok.',
            recommendations: [],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest(
      'hát azért lehet hogy egy tóparton vagy erdő mélyén megállnánk',
      state,
    ))
    const body = await res.json()

    expect(body.updatedState?.intent).toBe('recommendation')
    expect(body.updatedState?.campingType).toBe('wild')
    expect(body.updatedState?.lastAskedField).toBe('extraRequirements')
    expect(body.reply).toContain(extrasQuestion)
    expect(body.reply).not.toContain(campingQuestion)
    expect(mockLoadFaq).not.toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })
})

describe('Regression - rental availability question starts availability checklist', () => {
  it('checks the month first; if there is availability, asks for missing duration', async () => {
    const month = new Date()
    const currentMonth = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`

    mockExtract.mockResolvedValue({ intent: 'availability', month: currentMonth })
    mockSearchCampers.mockResolvedValue([mockCamper])
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Erről jelenleg nincs pontos információm. Hány napra tervezed?',
            recommendations: [],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest('Hello tudok még erre a hónapra lakóautót bérelni?', {}))
    const body = await res.json()

    expect(body.updatedState?.intent).toBe('availability')
    expect(body.updatedState?.month).toBe(currentMonth)
    expect(body.updatedState?.lastAskedField).toBe('durationDays')
    expect(body.reply).not.toContain('Erről jelenleg nincs pontos információm')
    expect(body.reply).toContain('Találtam szabad opciót')
    expect(body.reply).toContain('ban')
    expect(body.reply).toContain('Oké, és nagyjából hány napra vinnéd el?')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ intent: 'availability', month: currentMonth }),
    )
    expect(mockFindEarliest).not.toHaveBeenCalled()
  })

  it('stops the checklist when the requested month has no available camper', async () => {
    mockExtract.mockResolvedValue({ intent: 'availability', month: '2026-07' })
    mockSearchCampers.mockResolvedValue([])

    const res = await POST(makeRequest('Van még szabad lakóautó júliusra?', {}))
    const body = await res.json()

    expect(body.updatedState?.intent).toBe('availability')
    expect(body.updatedState?.month).toBe('2026-07')
    expect(body.updatedState?.lastAskedField).toBeUndefined()
    expect(body.updatedState?.pendingAvailabilityAction).toBe('find_earliest_availability')
    expect(body.reply).toContain('2026. júliusra')
    expect(body.reply).toContain('nem találok szabad lakóautót')
    expect(body.reply).toContain('legkorábbi hónap')
    expect(body.reply).not.toContain('Oké, és nagyjából hány napra vinnéd el?')
    expect(mockSearchCampers).toHaveBeenCalledTimes(1)
  })

  it('accepted pending earliest action searches and asks for confirmation', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-06',
      pendingAvailabilityAction: 'find_earliest_availability',
    }
    const earliestCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [{ from: '2026-07-12', to: '2026-07-18', days: 7 }],
    }
    mockExtract.mockResolvedValue({ earliestAvailable: true })
    mockFindEarliest.mockResolvedValue([earliestCamper])

    const res = await POST(makeRequest('Oké', state))
    const body = await res.json()

    expect(mockFindEarliest).toHaveBeenCalled()
    expect(body.reply).toContain('2026. július 12.')
    expect(body.reply).toContain('Megfelel')
    expect(body.updatedState?.pendingAvailabilityAction).toBeUndefined()
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        month: '2026-07',
        startDate: '2026-07-12',
      }),
    )
  })

  it('pending earliest action proceeds from conversation context even when extraction returns no new fields', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-06',
      pendingAvailabilityAction: 'find_earliest_availability',
    }
    const earliestCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [{ from: '2026-06-30', to: '2026-07-04', days: 5 }],
    }
    mockExtract.mockResolvedValue({})
    mockFindEarliest.mockResolvedValue([earliestCamper])
    mockSearchCampers.mockResolvedValue([])

    const res = await POST(makeRequest('nézd meg', state))
    const body = await res.json()

    expect(mockFindEarliest).toHaveBeenCalledWith(
      expect.objectContaining({
        month: undefined,
      }),
    )
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.reply).toContain('2026. június 30.')
    expect(body.reply).toContain('Megfelel')
    expect(body.updatedState?.pendingAvailabilityAction).toBeUndefined()
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        startDate: '2026-06-30',
      }),
    )
    expect(body.updatedState?.conversationMemory?.mentionedAvailabilityOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startDate: '2026-06-30',
          endDate: '2026-07-04',
          durationDays: 5,
        }),
      ]),
    )
  })

  it('duration-specific earliest question after a full month searches earliest period, not longest in the full month', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-06',
      pendingAvailabilityAction: 'find_earliest_availability',
    }
    const earliestCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [{ from: '2026-07-13', to: '2026-08-06', days: 25 }],
    }
    mockExtract.mockResolvedValue({
      durationDays: 25,
      availabilityQuestion: 'longest_duration',
    })
    mockFindEarliest.mockResolvedValue([earliestCamper])
    mockSearchCampers.mockResolvedValue([])

    const res = await POST(makeRequest('mikor van legkorábban elérhető autó 25 napra?', state))
    const body = await res.json()

    expect(mockFindEarliest).toHaveBeenCalledWith(
      expect.objectContaining({
        month: undefined,
        durationDays: 25,
      }),
    )
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.reply).toContain('**2026. július 13. és 2026. augusztus 6. között**')
    expect(body.reply).not.toContain('<u>')
    expect(body.reply).not.toContain('<strong>')
    expect(body.reply).toContain('25 napra')
    expect(body.reply).toContain('Megfelel')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      }),
    )
    expect(body.updatedState?.conversationMemory?.mentionedAvailabilityOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          startDate: '2026-07-13',
          endDate: '2026-08-06',
          durationDays: 25,
        }),
      ]),
    )
  })

  it('answers how many days were available for a remembered suggested start date', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 25,
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
      lastAvailabilitySlots: [
        {
          startDate: '2026-06-30',
          endDate: '2026-07-04',
          durationDays: 5,
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          source: 'earliest',
        },
        {
          startDate: '2026-07-13',
          endDate: '2026-08-06',
          durationDays: 25,
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          source: 'earliest',
        },
      ],
    }
    mockExtract.mockResolvedValue({ availabilityQuestion: 'remembered_slot_duration' })
    mockSearchCampers.mockResolvedValue([])
    mockFindEarliest.mockResolvedValue([])

    const res = await POST(makeRequest('korábbi időpontra hány nap lenne?', state))
    const body = await res.json()

    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.reply).toContain('2026. június 30.')
    expect(body.reply).toContain('5 napra')
    expect(body.reply).toContain('**2026. június 30. és 2026. július 4. között**')
    expect(body.reply).not.toContain('Mikor mennél')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        startDate: '2026-06-30',
        endDate: '2026-07-04',
        durationDays: 5,
      }),
    )
  })

  it('answers remembered availability duration for a relative follow-up without a repeated date', async () => {
    const state: ConversationState = {
      intent: 'availability',
      pendingAvailabilityConfirmation: {
        month: '2026-06',
        startDate: '2026-06-30',
        camperSlug: 'hymer-ayers-rock',
        camperName: 'Hymer Ayers Rock',
      },
      lastAvailabilitySlots: [
        {
          startDate: '2026-06-30',
          endDate: '2026-07-04',
          durationDays: 5,
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          source: 'earliest',
        },
      ],
    }
    mockExtract.mockResolvedValue({ availabilityQuestion: 'remembered_slot_duration' })

    const res = await POST(makeRequest('és arra hány napra lehetne menni?', state))
    const body = await res.json()

    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(body.reply).toContain('2026. június 30.')
    expect(body.reply).toContain('5 napra')
    expect(body.reply).not.toContain('Mikor mennél')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        startDate: '2026-06-30',
        endDate: '2026-07-04',
        durationDays: 5,
      }),
    )
  })

  it('after duration is provided, checks that duration before asking passengers', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-07',
      lastAskedField: 'durationDays',
    }
    mockExtract.mockResolvedValue({ durationDays: 10 })
    mockSearchCampers.mockResolvedValue([mockCamper])

    const res = await POST(makeRequest('10', state))
    const body = await res.json()

    expect(body.updatedState?.durationDays).toBe(10)
    expect(body.updatedState?.lastAskedField).toBe('passengers')
    expect(body.reply).toContain('Találtam szabad opciót')
    expect(body.reply).toContain('2026. júliusban')
    expect(body.reply).toContain('Rendben, hányan utaznátok összesen?')
    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({ month: '2026-07', durationDays: 10 }),
    )
  })

  it('stops when the requested month has no slot for the requested duration', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-07',
      lastAskedField: 'durationDays',
    }
    mockExtract.mockResolvedValue({ durationDays: 10 })
    mockSearchCampers.mockResolvedValue([])

    const res = await POST(makeRequest('10', state))
    const body = await res.json()

    expect(body.updatedState?.durationDays).toBe(10)
    expect(body.updatedState?.lastAskedField).toBe('durationDays')
    expect(body.updatedState?.pendingAvailabilityAction).toBe('find_earliest_availability')
    expect(body.reply).toContain('2026. júliusra')
    expect(body.reply).toContain('10 napra nem találok szabad lakóautót')
    expect(body.reply).toContain('legkorábbi időszak')
    expect(body.reply).not.toContain('Hány fővel utaznál?')
    expect(mockSearchCampers).toHaveBeenCalledTimes(1)
  })

  it('answers longest available duration in the selected month instead of repeating failed duration', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-07',
      durationDays: 27,
      lastAskedField: 'durationDays',
    }
    const longestCamper: CamperResult = {
      ...mockCamper,
      availableSlots: [
        { from: '2026-07-01', to: '2026-07-10', days: 10 },
        { from: '2026-07-12', to: '2026-07-25', days: 14 },
      ],
    }
    mockExtract.mockResolvedValue({ availabilityQuestion: 'longest_duration' })
    mockSearchCampers.mockResolvedValue([longestCamper])

    const res = await POST(makeRequest('mi a leghosszabb idő ami foglalható?', state))
    const body = await res.json()

    expect(mockSearchCampers).toHaveBeenCalledWith(
      expect.objectContaining({
        month: '2026-07',
        durationDays: undefined,
      }),
    )
    expect(body.reply).toContain('leghosszabb foglalható szabad idő 14 nap')
    expect(body.reply).toContain('2026. júliusban')
    expect(body.reply).toContain('**2026. július 12. és 2026. július 25. között**')
    expect(body.reply).not.toContain('<u>')
    expect(body.reply).not.toContain('<strong>')
    expect(body.reply).toContain('Megfelel')
    expect(body.reply).not.toContain('27 napra nem találok')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        month: '2026-07',
        startDate: '2026-07-12',
        endDate: '2026-07-25',
        durationDays: 14,
      }),
    )
  })
})

describe('Regression - explicit session layers travel between turns', () => {
  it('returns flowState/sessionMemory and uses them on the next checklist turn', async () => {
    mockExtract
      .mockResolvedValueOnce({ intent: 'recommendation' })
      .mockResolvedValueOnce({ intent: 'faq' })
    mockLoadFaq.mockResolvedValue([
      {
        id: 1,
        question: 'Mi az a vadkemping?',
        answer: 'Kempingen kívüli megállás.',
        category: 'Utazas',
        language: 'hu',
        priority: 1,
      },
    ])
    mockGptCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ reply: 'Rendben.', recommendations: [], links: [] }) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify({ reply: 'A vadkemping kempingen kívüli megállás.', recommendations: [], links: [] }) } }],
      })

    let state: ConversationState = {}
    let flowState: FlowState | undefined
    let sessionMemory: SessionMemory | undefined

    let res = await POST(makeRequest('Segíts lakóautót választani', state, [], flowState, sessionMemory))
    let body = await res.json()
    state = body.updatedState
    flowState = body.updatedFlowState
    sessionMemory = body.updatedSessionMemory

    expect(flowState).toEqual(
      expect.objectContaining({
        activeFlow: 'recommendation',
        activeStep: 'checklist',
        pendingQuestionField: 'month',
      }),
    )
    expect(sessionMemory ?? {}).toEqual({})
    expect(mockSearchCampers).not.toHaveBeenCalled()

    res = await POST(makeRequest('mi az a vadkemping?', state, [], flowState, sessionMemory))
    body = await res.json()

    expect(body.updatedFlowState).toEqual(
      expect.objectContaining({
        activeFlow: 'recommendation',
        activeStep: 'checklist',
        pendingQuestionField: 'month',
      }),
    )
    expect(body.reply).not.toContain('Mikor mennél?')
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('stores recommendation cards in sessionMemory.shownOptions', async () => {
    const fullState: ConversationState = {
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }
    mockExtract.mockResolvedValue({})
    mockSearchCampers.mockResolvedValue([mockCamper])
    const engineRecommendation = {
      camperId: 'hobby-id',
      camperSlug: 'hobby-t75hf',
      camperName: 'Hobby T75HF',
      status: 'eligible',
      score: 42,
      hardFailures: [],
      scoreBreakdown: [{ key: 'capacity', label: 'Megfelel a létszámnak', points: 20 }],
      capabilityMatches: [{
        capabilityKey: 'off_grid',
        strength: 'soft',
        score: 0.6,
        matchedWeight: 6,
        totalWeight: 10,
        matchedFeatures: ['solar_panel'],
        missingFeatures: ['inverter'],
      }],
      pricing: {
        status: 'priced',
        pricePerDay: 35000,
        durationDays: 7,
        subtotal: 245000,
        discountPercent: 0,
        discountAmount: 0,
        total: 245000,
      },
      availableSlots: [{ from: '2026-08-01', to: '2026-08-07', days: 7 }],
      featureKeys: ['solar_panel', 'cassette_wc'],
      attributeFacts: {
        beds: 6,
        type: 'Alkóvos',
        gearbox: 'Manuális',
        year: 2024,
      },
      availabilitySummary: { from: '2026-08-01', to: '2026-08-07', days: 7 },
      imageUrl: 'https://example.com/hobby.jpg',
      type: 'Alkóvos',
      beds: 6,
    }
    mockEvaluateCampers.mockResolvedValue({
      evaluations: [engineRecommendation],
      topRecommendations: [engineRecommendation],
      branches: [],
      branchSummary: [],
      pricingSummary: {
        pricedCount: 1,
        missingPriceCount: 0,
      },
      discountOpportunities: [],
      explanationContext: {
        hardConstraintKeys: [],
        softScoringKeys: [],
      },
    })
    mockGptCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Ezt ajánlom.',
            recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó választás a megadott feltételekre.' }],
            links: [],
          }),
        },
      }],
    })

    const res = await POST(makeRequest('mutasd az ajánlást', fullState, [], {}, {}))
    const body = await res.json()

    expect(body.updatedSessionMemory?.lastRecommendationResult).toEqual(
      expect.objectContaining({
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        from: '2026-08-01',
        to: '2026-08-07',
        days: 7,
        criteria: expect.objectContaining({
          month: '2026-07',
          durationDays: 7,
          passengers: 2,
          campingType: 'camping_site',
        }),
        criteriaHash: expect.any(String),
        optionId: expect.stringMatching(/^rec_1_hobby-t75hf_/),
        shownIndex: 1,
        pricePerDay: 35000,
        totalPrice: 245000,
        score: 42,
        source: 'evaluation_engine',
        featureKeys: ['solar_panel', 'cassette_wc'],
        attributeFacts: expect.objectContaining({
          gearbox: 'Manuális',
          year: 2024,
        }),
        capabilityMatches: [
          expect.objectContaining({
            capabilityKey: 'off_grid',
            matchedFeatures: ['solar_panel'],
          }),
        ],
      }),
    )
    expect(body.updatedSessionMemory?.shownOptions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          index: 1,
          optionId: expect.stringMatching(/^rec_1_hobby-t75hf_/),
          camperSlug: 'hobby-t75hf',
          criteriaHash: body.updatedSessionMemory?.lastRecommendationResult?.criteriaHash,
          featureKeys: ['solar_panel', 'cassette_wc'],
        }),
      ]),
    )
  })

  it('resolves previous availability from sessionMemory without relying on state history mirrors', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 25,
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      },
    }
    const sessionMemory: SessionMemory = {
      lastAvailabilityResult: {
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        from: '2026-07-13',
        to: '2026-08-06',
        days: 25,
        source: 'fallback_earliest',
        criteria: { durationDays: 25 },
        criteriaHash: '{"durationDays":25}',
      },
      previousAvailabilityResults: [
        {
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          from: '2026-06-30',
          to: '2026-07-04',
          days: 5,
          source: 'fallback_earliest',
          criteria: { durationDays: 25 },
          criteriaHash: '{"durationDays":25}',
        },
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-07-13',
          to: '2026-08-06',
          days: 25,
          source: 'fallback_earliest',
          criteria: { durationDays: 25 },
          criteriaHash: '{"durationDays":25}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(body.reply).toContain('2026. június 30.')
    expect(body.reply).toContain('5 napra')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({
        startDate: '2026-06-30',
        endDate: '2026-07-04',
        durationDays: 5,
        camperSlug: 'hymer-ayers-rock',
      }),
    )
  })

  it('treats legacy 4 passengers + wild campingType -> 2 passengers + camping_site as stale', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 25,
      passengers: 2,
      campingType: 'camping_site',
      pendingAvailabilityConfirmation: {
        month: '2026-07',
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      },
    }
    const staleResult = {
      camperSlug: 'hymer-ayers-rock',
      camperName: 'Hymer Ayers Rock',
      from: '2026-06-30',
      to: '2026-07-04',
      days: 5,
      source: 'fallback_earliest' as const,
      criteria: {
        durationDays: 25,
        passengers: 4,
        campingType: 'wild' as const,
      },
      criteriaHash: '{"durationDays":25,"passengers":4,"campingType":"wild"}',
    }
    const sessionMemory: SessionMemory = {
      previousAvailabilityResults: [
        staleResult,
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-07-13',
          to: '2026-08-06',
          days: 25,
          source: 'fallback_earliest',
          criteria: {
            durationDays: 25,
            passengers: 4,
            campingType: 'wild',
          },
          criteriaHash: '{"durationDays":25,"passengers":4,"campingType":"wild"}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(body.reply).toContain('előző feltételek mellett')
    expect(body.reply).toContain('2026. június 30.')
    expect(body.reply).toContain('5 napra')
    expect(body.reply).not.toContain('Megfelel ez az időszak?')
    expect(body.updatedSessionMemory?.staleAvailabilityResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: '2026-06-30' })]),
    )
  })

  it('treats passenger increase as needs_recheck', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 20,
      passengers: 4,
      campingType: 'camping_site',
      pendingAvailabilityConfirmation: {
        startDate: '2026-07-13',
        endDate: '2026-08-01',
        durationDays: 20,
      },
    }
    const sessionMemory: SessionMemory = {
      previousAvailabilityResults: [
        {
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          from: '2026-06-30',
          to: '2026-07-19',
          days: 20,
          source: 'fallback_earliest',
          criteria: { durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-07-13',
          to: '2026-08-01',
          days: 20,
          source: 'fallback_earliest',
          criteria: { durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockSearchCampers).not.toHaveBeenCalled()
    expect(mockFindEarliest).not.toHaveBeenCalled()
    expect(body.reply).toContain('szigorúbbak')
    expect(body.reply).not.toContain('Megfelel ez az időszak?')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({ startDate: '2026-07-13' }),
    )
    expect(body.updatedSessionMemory?.staleAvailabilityResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: '2026-06-30' })]),
    )
  })

  it('treats camping_site -> legacy wild campingType as stale', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 20,
      passengers: 2,
      campingType: 'wild',
      pendingAvailabilityConfirmation: {
        startDate: '2026-07-13',
        endDate: '2026-08-01',
        durationDays: 20,
      },
    }
    const sessionMemory: SessionMemory = {
      previousAvailabilityResults: [
        {
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          from: '2026-06-30',
          to: '2026-07-19',
          days: 20,
          source: 'fallback_earliest',
          criteria: { durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-07-13',
          to: '2026-08-01',
          days: 20,
          source: 'fallback_earliest',
          criteria: { durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(body.reply).toContain('előző feltételek mellett')
    expect(body.reply).not.toContain('Megfelel ez az időszak?')
    expect(body.updatedSessionMemory?.staleAvailabilityResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: '2026-06-30' })]),
    )
  })

  it('treats month change as stale', async () => {
    const state: ConversationState = {
      intent: 'availability',
      month: '2026-08',
      durationDays: 20,
      passengers: 2,
      campingType: 'camping_site',
      pendingAvailabilityConfirmation: {
        startDate: '2026-08-13',
        endDate: '2026-09-01',
        durationDays: 20,
      },
    }
    const sessionMemory: SessionMemory = {
      previousAvailabilityResults: [
        {
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          from: '2026-07-01',
          to: '2026-07-20',
          days: 20,
          source: 'availability_search',
          criteria: { month: '2026-07', durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"month":"2026-07","durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-08-13',
          to: '2026-09-01',
          days: 20,
          source: 'availability_search',
          criteria: { month: '2026-08', durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"month":"2026-08","durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(body.reply).toContain('előző feltételek mellett')
    expect(body.reply).not.toContain('Megfelel ez az időszak?')
    expect(body.updatedSessionMemory?.staleAvailabilityResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: '2026-07-01' })]),
    )
  })

  it('treats duration decrease as compatible_relaxed', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 20,
      passengers: 2,
      campingType: 'camping_site',
      pendingAvailabilityConfirmation: {
        startDate: '2026-07-13',
        endDate: '2026-08-06',
        durationDays: 25,
      },
    }
    const sessionMemory: SessionMemory = {
      previousAvailabilityResults: [
        {
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          from: '2026-06-30',
          to: '2026-07-24',
          days: 25,
          source: 'fallback_earliest',
          criteria: { durationDays: 25, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":25,"passengers":2,"campingType":"camping_site"}',
        },
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-07-13',
          to: '2026-08-06',
          days: 25,
          source: 'fallback_earliest',
          criteria: { durationDays: 25, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":25,"passengers":2,"campingType":"camping_site"}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(body.reply).toContain('lazább feltételekkel')
    expect(body.reply).toContain('Megfelel ez az időszak?')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({ startDate: '2026-06-30', durationDays: 25 }),
    )
  })

  it('treats duration increase as needs_recheck', async () => {
    const state: ConversationState = {
      intent: 'availability',
      durationDays: 25,
      passengers: 2,
      campingType: 'camping_site',
      pendingAvailabilityConfirmation: {
        startDate: '2026-07-13',
        endDate: '2026-08-01',
        durationDays: 20,
      },
    }
    const sessionMemory: SessionMemory = {
      previousAvailabilityResults: [
        {
          camperSlug: 'hymer-ayers-rock',
          camperName: 'Hymer Ayers Rock',
          from: '2026-06-30',
          to: '2026-07-19',
          days: 20,
          source: 'fallback_earliest',
          criteria: { durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
        {
          camperSlug: 'hobby-t75hf',
          camperName: 'Hobby T75HF',
          from: '2026-07-13',
          to: '2026-08-01',
          days: 20,
          source: 'fallback_earliest',
          criteria: { durationDays: 20, passengers: 2, campingType: 'camping_site' },
          criteriaHash: '{"durationDays":20,"passengers":2,"campingType":"camping_site"}',
        },
      ],
    }
    mockExtract.mockResolvedValue({
      referenceTarget: 'previousAvailability',
      availabilityQuestion: 'remembered_slot_duration',
    })

    const res = await POST(makeRequest('a korábbi időpontban hány napra lehetne?', state, [], {}, sessionMemory))
    const body = await res.json()

    expect(body.reply).toContain('szigorúbbak')
    expect(body.reply).not.toContain('Megfelel ez az időszak?')
    expect(body.updatedState?.pendingAvailabilityConfirmation).toEqual(
      expect.objectContaining({ startDate: '2026-07-13', durationDays: 20 }),
    )
    expect(body.updatedSessionMemory?.staleAvailabilityResults).toEqual(
      expect.arrayContaining([expect.objectContaining({ from: '2026-06-30' })]),
    )
  })
})

describe('Recommendation reference resolver route integration', () => {
  const referenceState: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
  }
  const referenceSessionMemory: SessionMemory = {
    lastRecommendationResult: {
      optionId: 'rec_2_hymer_abc',
      camperSlug: 'hymer-ayers-rock',
      camperName: 'Hymer Ayers Rock',
      shownIndex: 2,
      criteria: {
        month: '2026-07',
        durationDays: 7,
        passengers: 2,
        campingType: 'camping_site',
      },
      criteriaHash: 'hash-a',
      pricePerDay: 62000,
    },
    shownOptions: [
      {
        index: 1,
        optionId: 'rec_1_hobby-t75hf_abc',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        criteria: {
          month: '2026-07',
          durationDays: 7,
          passengers: 2,
          campingType: 'camping_site',
        },
        criteriaHash: 'hash-a',
        pricePerDay: 58000,
        featureKeys: ['solar_panel'],
        attributeFacts: {
          beds: 4,
          type: 'Alkóvos',
          gearbox: 'Manuális',
        },
        capabilityMatches: [{
          capabilityKey: 'off_grid',
          strength: 'soft',
          score: 0.7,
          matchedWeight: 7,
          totalWeight: 10,
          matchedFeatures: ['solar_panel'],
          missingFeatures: ['inverter'],
        }],
      },
      {
        index: 2,
        optionId: 'rec_2_hymer_abc',
        camperSlug: 'hymer-ayers-rock',
        camperName: 'Hymer Ayers Rock',
        criteria: {
          month: '2026-07',
          durationDays: 7,
          passengers: 2,
          campingType: 'camping_site',
        },
        criteriaHash: 'hash-a',
        pricePerDay: 62000,
        featureKeys: ['cassette_wc'],
        attributeFacts: {
          beds: 2,
          type: 'Camper van',
          gearbox: 'Automata',
        },
        capabilityMatches: [],
      },
    ],
  }

  function capturePromptWithEmptyResponse() {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Rendben.', recommendations: [], links: [] }) } }],
      })
    })
    return () => capturedSystemPrompt
  }

  beforeEach(() => {
    mockSearchCampers.mockResolvedValue([])
    mockEvaluateCampers.mockResolvedValue({
      evaluations: [],
      topRecommendations: [],
      branches: [],
      branchSummary: [],
      pricingSummary: { pricedCount: 0, missingPriceCount: 0 },
      discountOpportunities: [],
      explanationContext: { hardConstraintKeys: [], softScoringKeys: [] },
    })
  })

  it('passes resolved lastRecommendation reference context and writes referenced event', async () => {
    mockExtract.mockResolvedValue({ referenceTarget: 'lastRecommendation' })
    const getPrompt = capturePromptWithEmptyResponse()

    const res = await POST(makeRequest('az előző érdekel', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(getPrompt()).toContain('RECOMMENDATION REFERENCE RESOLUTION')
    expect(getPrompt()).toContain('"status":"resolved"')
    expect(getPrompt()).toContain('"optionId":"rec_2_hymer_abc"')
    expect(getPrompt()).toContain('"status":"compatible"')
    expect(body.updatedSessionMemory?.memoryEvents).toEqual([
      expect.objectContaining({
        eventType: 'referenced',
        optionId: 'rec_2_hymer_abc',
        camperSlug: 'hymer-ayers-rock',
      }),
    ])
  })

  it('passes resolved firstShownOption reference context', async () => {
    mockExtract.mockResolvedValue({ referenceTarget: 'firstShownOption' })
    const getPrompt = capturePromptWithEmptyResponse()

    const res = await POST(makeRequest('az első', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(getPrompt()).toContain('"status":"resolved"')
    expect(getPrompt()).toContain('"optionId":"rec_1_hobby-t75hf_abc"')
    expect(body.updatedSessionMemory?.memoryEvents?.[0]).toEqual(expect.objectContaining({
      eventType: 'referenced',
      optionId: 'rec_1_hobby-t75hf_abc',
    }))
  })

  it('passes resolved lastShownOption reference context', async () => {
    mockExtract.mockResolvedValue({ referenceTarget: 'lastShownOption' })
    const getPrompt = capturePromptWithEmptyResponse()

    await POST(makeRequest('az utolsó', referenceState, [], {}, referenceSessionMemory))

    expect(getPrompt()).toContain('"status":"resolved"')
    expect(getPrompt()).toContain('"optionId":"rec_2_hymer_abc"')
  })

  it('passes resolved fact reference context', async () => {
    mockExtract.mockResolvedValue({
      recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
    })
    const getPrompt = capturePromptWithEmptyResponse()

    const res = await POST(makeRequest('a napelemes', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(getPrompt()).toContain('"status":"resolved"')
    expect(getPrompt()).toContain('"optionId":"rec_1_hobby-t75hf_abc"')
    expect(body.updatedSessionMemory?.memoryEvents?.[0]).toEqual(expect.objectContaining({
      eventType: 'referenced',
      optionId: 'rec_1_hobby-t75hf_abc',
    }))
  })

  it('does not choose target or write referenced event for ambiguous fact reference', async () => {
    mockExtract.mockResolvedValue({
      recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
    })
    const ambiguousMemory: SessionMemory = {
      ...referenceSessionMemory,
      shownOptions: [
        referenceSessionMemory.shownOptions![0],
        {
          ...referenceSessionMemory.shownOptions![1],
          featureKeys: ['solar_panel'],
        },
      ],
    }
    const getPrompt = capturePromptWithEmptyResponse()

    const res = await POST(makeRequest('a napelemes', referenceState, [], {}, ambiguousMemory))
    const body = await res.json()

    expect(getPrompt()).toContain('"status":"ambiguous"')
    expect(getPrompt()).toContain('"multiple_feature_reference_matches"')
    expect(body.updatedSessionMemory?.memoryEvents).toBeUndefined()
    expect(body.recommendations).toEqual([])
  })

  it('does not guess or write referenced event for not_found fact reference', async () => {
    mockExtract.mockResolvedValue({
      recommendationReference: { kind: 'feature', featureKey: 'bike_rack' },
    })
    const getPrompt = capturePromptWithEmptyResponse()

    const res = await POST(makeRequest('a biciklitartós', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(getPrompt()).toContain('"status":"not_found"')
    expect(getPrompt()).toContain('"no_feature_reference_match"')
    expect(body.updatedSessionMemory?.memoryEvents).toBeUndefined()
    expect(body.updatedState).toEqual(expect.objectContaining(referenceState))
  })

  it('passes needs_recheck compatibility context without changing scoring source', async () => {
    mockExtract.mockResolvedValue({ referenceTarget: 'firstShownOption' })
    const getPrompt = capturePromptWithEmptyResponse()

    await POST(makeRequest('az első', { ...referenceState, passengers: 4 }, [], {}, referenceSessionMemory))

    expect(getPrompt()).toContain('"compatibility":{"status":"needs_recheck"')
    expect(mockEvaluateCampers).toHaveBeenCalled()
    expect(mockSearchCampers).not.toHaveBeenCalled()
  })

  it('writes selected event for a resolved recommendation interaction', async () => {
    mockExtract.mockResolvedValue({
      recommendationInteraction: {
        type: 'selected',
        targetReference: 'firstShownOption',
        sourceText: 'az első jó',
      },
    })

    const res = await POST(makeRequest('az első jó', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(body.updatedSessionMemory?.memoryEvents).toEqual([
      expect.objectContaining({
        eventType: 'selected',
        optionId: 'rec_1_hobby-t75hf_abc',
        camperSlug: 'hobby-t75hf',
        metadata: expect.objectContaining({
          sourceText: 'az első jó',
          interactionType: 'selected',
          referenceTarget: 'firstShownOption',
        }),
      }),
    ])
    expect(body.updatedSessionMemory?.memoryEvents?.some((event: any) => event.eventType === 'referenced')).toBe(false)
    expect(body.updatedState?.selectedCamperSlug).toBeUndefined()
    expect(body.updatedState?.pricingPreference).toBeUndefined()
  })

  it('writes dismissed event for a resolved recommendation interaction', async () => {
    mockExtract.mockResolvedValue({
      recommendationInteraction: {
        type: 'dismissed',
        targetReference: 'lastShownOption',
        sourceText: 'ezt ne',
      },
    })

    const res = await POST(makeRequest('ezt ne', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(body.updatedSessionMemory?.memoryEvents?.[0]).toEqual(expect.objectContaining({
      eventType: 'dismissed',
      optionId: 'rec_2_hymer_abc',
      camperSlug: 'hymer-ayers-rock',
      metadata: expect.objectContaining({
        sourceText: 'ezt ne',
        interactionType: 'dismissed',
        referenceTarget: 'lastShownOption',
      }),
    }))
    expect(body.updatedState?.selectedCamperSlug).toBeUndefined()
    expect(body.updatedState?.pricingPreference).toBeUndefined()
  })

  it('writes compared event only when both recommendation targets resolve', async () => {
    mockExtract.mockResolvedValue({
      recommendationInteraction: {
        type: 'compared',
        targetReference: 'firstShownOption',
        secondaryTargetReference: 'lastShownOption',
        sourceText: 'az első jobb mint az utolsó',
      },
    })

    const res = await POST(makeRequest('az első jobb mint az utolsó', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(body.updatedSessionMemory?.memoryEvents?.[0]).toEqual(expect.objectContaining({
      eventType: 'compared',
      optionId: 'rec_1_hobby-t75hf_abc',
      camperSlug: 'hobby-t75hf',
      metadata: expect.objectContaining({
        sourceText: 'az első jobb mint az utolsó',
        interactionType: 'compared',
        referenceTarget: 'firstShownOption',
        secondaryReferenceTarget: 'lastShownOption',
        comparedOptionId: 'rec_2_hymer_abc',
        comparedCamperSlug: 'hymer-ayers-rock',
      }),
    }))
    expect(body.updatedSessionMemory?.memoryEvents?.[0].metadata?.winnerOptionId).toBeUndefined()
    expect(body.updatedState?.selectedCamperSlug).toBeUndefined()
  })

  it('does not write interaction event for ambiguous recommendation target', async () => {
    const ambiguousMemory: SessionMemory = {
      ...referenceSessionMemory,
      shownOptions: [
        referenceSessionMemory.shownOptions![0],
        {
          ...referenceSessionMemory.shownOptions![1],
          featureKeys: ['solar_panel'],
        },
      ],
    }
    mockExtract.mockResolvedValue({
      recommendationInteraction: {
        type: 'selected',
        targetRecommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
        sourceText: 'a napelemes jó',
      },
    })

    const res = await POST(makeRequest('a napelemes jó', referenceState, [], {}, ambiguousMemory))
    const body = await res.json()

    expect(body.updatedSessionMemory?.memoryEvents).toBeUndefined()
    expect(body.updatedState?.selectedCamperSlug).toBeUndefined()
  })

  it('does not write interaction event for not_found recommendation target', async () => {
    mockExtract.mockResolvedValue({
      recommendationInteraction: {
        type: 'dismissed',
        targetRecommendationReference: { kind: 'feature', featureKey: 'bike_rack' },
        sourceText: 'a biciklitartós nem jó',
      },
    })

    const res = await POST(makeRequest('a biciklitartós nem jó', referenceState, [], {}, referenceSessionMemory))
    const body = await res.json()

    expect(body.updatedSessionMemory?.memoryEvents).toBeUndefined()
    expect(body.updatedState?.selectedCamperSlug).toBeUndefined()
  })

  it('keeps memory event history within the configured limit after route interaction append', async () => {
    const existingEvents = Array.from({ length: MAX_MEMORY_EVENTS }, (_, index) => createMemoryEvent({
      eventType: 'shown',
      optionId: `old_${index}`,
      camperSlug: `old-camper-${index}`,
    }, `2026-01-01T00:00:${String(index).padStart(2, '0')}.000Z`))
    mockExtract.mockResolvedValue({
      recommendationInteraction: {
        type: 'selected',
        targetReference: 'lastRecommendation',
        sourceText: 'ez lesz',
      },
    })

    const res = await POST(makeRequest(
      'ez lesz',
      referenceState,
      [],
      {},
      { ...referenceSessionMemory, memoryEvents: existingEvents },
    ))
    const body = await res.json()

    expect(body.updatedSessionMemory?.memoryEvents).toHaveLength(MAX_MEMORY_EVENTS)
    expect(body.updatedSessionMemory?.memoryEvents?.some((event: any) => event.eventType === 'selected')).toBe(true)
    expect(body.updatedSessionMemory?.memoryEvents?.some((event: any) => event.optionId === 'old_0')).toBe(false)
  })

  it('sanitizes incoming sessionMemory before route reference handling', async () => {
    const memoryEvents = Array.from({ length: MAX_MEMORY_EVENTS + 2 }, (_, index) => ({
      eventId: `event_${index}`,
      eventType: 'shown',
      timestamp: '2026-06-13T00:00:00.000Z',
      optionId: `rec_${index}`,
      metadata: {
        sequence: index,
        nested: { shouldDrop: true },
      },
    }))
    mockExtract.mockResolvedValue({ referenceTarget: 'lastRecommendation' })

    const res = await POST(makeRequest(
      'az előző érdekel',
      referenceState,
      [],
      {},
      {
        shownOptions: [{ optionId: 'broken-without-index' }],
        memoryEvents,
        lastComparedCamper: 123,
      } as any,
    ))
    const body = await res.json()

    expect(body.updatedSessionMemory?.shownOptions).toBeUndefined()
    expect(body.updatedSessionMemory?.lastComparedCamper).toBeUndefined()
    expect(body.updatedSessionMemory?.memoryEvents).toHaveLength(MAX_MEMORY_EVENTS)
    expect(body.updatedSessionMemory?.memoryEvents?.[0].eventId).toBe('event_2')
    expect(body.updatedSessionMemory?.memoryEvents?.[0].metadata).toEqual({ sequence: 2 })
    expect(body.updatedSessionMemory?.memoryEvents?.some((event: any) => event.eventType === 'referenced')).toBe(false)
  })
})

describe('Phase 8C.2 – state-driven refinement re-evaluation pipeline', () => {
  const baseState: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    extraRequirementsAsked: true,
    lastShownCamperSlug: 'hobby-t75hf',
    lastShownPrice: 42000,
    alreadyRecommendedSlugs: ['hobby-t75hf'],
  }

  const sessionMemory: SessionMemory = {
    lastRecommendationResult: {
      optionId: 'rec_2_hymer_abc',
      camperSlug: 'hymer-ayers-rock',
      camperName: 'Hymer Ayers Rock',
      shownIndex: 2,
      criteria: {
        month: '2026-07',
        durationDays: 7,
        passengers: 2,
        campingType: 'camping_site',
      },
      criteriaHash: '{"month":"2026-07","durationDays":7,"passengers":2,"campingType":"camping_site"}',
      pricePerDay: 52000,
      attributeFacts: {
        beds: 4,
        type: 'Camper van',
        gearbox: 'Automata',
      },
    },
    shownOptions: [
      {
        index: 1,
        optionId: 'rec_1_hobby-t75hf_abc',
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
        criteria: {
          month: '2026-07',
          durationDays: 7,
          passengers: 2,
          campingType: 'camping_site',
        },
        criteriaHash: '{"month":"2026-07","durationDays":7,"passengers":2,"campingType":"camping_site"}',
        pricePerDay: 42000,
        featureKeys: ['solar_panel'],
        attributeFacts: {
          beds: 6,
          type: 'Alkóvos',
          gearbox: 'Manuális',
        },
        capabilityMatches: [],
      },
      {
        index: 2,
        optionId: 'rec_2_hymer_abc',
        camperSlug: 'hymer-ayers-rock',
        camperName: 'Hymer Ayers Rock',
        criteria: {
          month: '2026-07',
          durationDays: 7,
          passengers: 2,
          campingType: 'camping_site',
        },
        criteriaHash: '{"month":"2026-07","durationDays":7,"passengers":2,"campingType":"camping_site"}',
        pricePerDay: 52000,
        featureKeys: [],
        attributeFacts: {
          beds: 4,
          type: 'Camper van',
          gearbox: 'Automata',
        },
        capabilityMatches: [],
      },
    ],
  }

  function engineEvaluation(slug: string, name: string, pricePerDay = 30000, beds = 2) {
    return {
      camperId: `${slug}-id`,
      camperSlug: slug,
      camperName: name,
      status: 'eligible',
      score: 50,
      hardFailures: [],
      scoreBreakdown: [{ key: 'capacity', label: 'Megfelel a létszámnak', points: 20 }],
      capabilityMatches: [],
      pricing: { status: 'priced', pricePerDay, total: pricePerDay * 7 },
      availableSlots: [{ from: '2026-07-10', to: '2026-07-17', days: 7 }],
      featureKeys: [],
      attributeFacts: {
        beds,
        type: 'Camper van',
        gearbox: 'Automata',
      },
      availabilitySummary: { from: '2026-07-10', to: '2026-07-17', days: 7 },
      imageUrl: `https://example.com/${slug}.jpg`,
      type: 'Camper van',
      beds,
    }
  }

  function mockEngineRecommendation(
    slug = 'cheap-one',
    name = 'Cheap One',
    pricePerDay = 30000,
    beds = 2,
    captureState?: (state: ConversationState) => void,
  ) {
    const recommendation = engineEvaluation(slug, name, pricePerDay, beds)
    const result = {
      evaluations: [recommendation],
      topRecommendations: [recommendation],
      branches: [],
      branchSummary: [],
      pricingSummary: { pricedCount: 1, missingPriceCount: 0 },
      discountOpportunities: [],
      explanationContext: { hardConstraintKeys: [], softScoringKeys: ['capacity'] },
    }
    mockEvaluateCampers.mockImplementation((state: ConversationState) => {
      captureState?.(JSON.parse(JSON.stringify(state)))
      return Promise.resolve(result)
    })
    return recommendation
  }

  function mockRecommendationResponse(slug: string) {
    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
      choices: [{
        message: {
          content: JSON.stringify({
            reply: 'Mutatok egy új opciót az aktuális feltételekre.',
            recommendations: [{ slug, reason: 'Backend-selected refinement result.' }],
            links: [],
          }),
        },
      }],
    })
    })
    return () => capturedSystemPrompt
  }

  it('resolved reference + cheaper creates pricing delta and reruns the Evaluation Engine', async () => {
    mockExtract.mockResolvedValue({
      referenceTarget: 'lastRecommendation',
      refinementIntent: { intent: 'cheaper', sourceText: 'abból olcsóbbat' },
    })
    let evaluatedState: ConversationState | undefined
    mockEngineRecommendation('cheap-one', 'Cheap One', 30000, 2, state => {
      evaluatedState = state
    })
    const getPrompt = mockRecommendationResponse('cheap-one')

    const res = await POST(makeRequest('abból olcsóbbat', baseState, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockEvaluateCampers).toHaveBeenCalledTimes(1)
    expect(evaluatedState?.pricingPreference).toEqual(expect.objectContaining({
      intent: 'cheaper',
      referencePricePerDay: 52000,
    }))
    expect(evaluatedState?.lastShownCamperSlug).toBe('hymer-ayers-rock')
    expect(body.recommendations.map((item: { slug: string }) => item.slug)).toEqual(['cheap-one'])
    expect(body.updatedState?.pricingPreference).toEqual(expect.objectContaining({ intent: 'cheaper' }))
    expect(body.updatedSessionMemory?.memoryEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          eventType: 'referenced',
          optionId: 'rec_2_hymer_abc',
          camperSlug: 'hymer-ayers-rock',
        }),
        expect.objectContaining({
          eventType: 'shown',
          camperSlug: 'cheap-one',
        }),
      ]),
    )
    expect(body.updatedSessionMemory?.lastRecommendationResult).toEqual(
      expect.objectContaining({
        camperSlug: 'cheap-one',
        source: 'evaluation_engine',
      }),
    )
    expect(getPrompt()).toContain('REFINEMENT CONTEXT')
    expect(getPrompt()).toContain('"intent":"cheaper"')
    expect(getPrompt()).toContain('"referencedTarget":{"optionId":"rec_2_hymer_abc"')
    expect(getPrompt()).toContain('"referenceResolution":{"status":"resolved"')
    expect(getPrompt()).toContain('"compatibility":{"status":"compatible"')
    expect(getPrompt()).toContain('"stateDeltaSummary":["pricingPreference.intent=cheaper"]')
    expect(getPrompt()).toContain('"rerunTriggered":true')
    expect(getPrompt()).toContain('"newBackendSelectedRecommendations":["cheap-one"]')
    expect(getPrompt()).toContain('BACKEND SELECTED RECOMMENDATIONS')
    expect(getPrompt()).toContain('cheap-one')
    expect(getPrompt()).not.toContain('memory as a recommendation truth source')
  })

  it('resolved reference + cheaper does not expose a more expensive engine result', async () => {
    mockExtract.mockResolvedValue({
      referenceTarget: 'lastRecommendation',
      refinementIntent: { intent: 'cheaper', sourceText: 'abból olcsóbbat' },
    })
    let evaluatedState: ConversationState | undefined
    mockEngineRecommendation('expensive-one', 'Expensive One', 70000, 2, state => {
      evaluatedState = state
    })
    const getPrompt = mockRecommendationResponse('expensive-one')

    const res = await POST(makeRequest('abból olcsóbbat', baseState, [], {}, sessionMemory))
    const body = await res.json()

    expect(evaluatedState?.pricingPreference).toEqual(expect.objectContaining({
      intent: 'cheaper',
      referencePricePerDay: 52000,
    }))
    expect(body.recommendations).toEqual([])
    expect(getPrompt()).toContain('"newBackendSelectedRecommendations":[]')
    expect(getPrompt()).not.toContain('expensive-one')
  })

  it('resolved reference + bigger creates attribute delta and reruns the Evaluation Engine', async () => {
    mockExtract.mockResolvedValue({
      referenceTarget: 'firstShownOption',
      refinementIntent: { intent: 'bigger', sourceText: 'abból nagyobbat' },
    })
    let evaluatedState: ConversationState | undefined
    mockEngineRecommendation('big-one', 'Big One', 46000, 7, state => {
      evaluatedState = state
    })
    const getPrompt = mockRecommendationResponse('big-one')

    const res = await POST(makeRequest('abból nagyobbat', baseState, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockEvaluateCampers).toHaveBeenCalledTimes(1)
    expect(evaluatedState?.attributePreferences).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'beds', operator: 'gte', value: 7 }),
      ]),
    )
    expect(body.recommendations.map((item: { slug: string }) => item.slug)).toEqual(['big-one'])
    expect(getPrompt()).toContain('"stateDeltaSummary":["attributePreferences.beds=gte:7"]')
  })

  it('resolved reference + different excludes the referenced option before rerun', async () => {
    mockExtract.mockResolvedValue({
      referenceTarget: 'lastRecommendation',
      refinementIntent: { intent: 'different', sourceText: 'mutass mást' },
    })
    let evaluatedState: ConversationState | undefined
    mockEngineRecommendation('different-one', 'Different One', 38000, 2, state => {
      evaluatedState = state
    })
    const getPrompt = mockRecommendationResponse('different-one')

    await POST(makeRequest('mutass mást', baseState, [], {}, sessionMemory))

    expect(mockEvaluateCampers).toHaveBeenCalledTimes(1)
    expect(evaluatedState?.alreadyRecommendedSlugs).toEqual(
      expect.arrayContaining(['hobby-t75hf', 'hymer-ayers-rock']),
    )
    expect(getPrompt()).toContain('"stateDeltaSummary":["alreadyRecommendedSlugs+=hymer-ayers-rock"]')
  })

  it('ambiguous reference + refinement does not rerun or choose a target', async () => {
    mockExtract.mockResolvedValue({
      recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
      refinementIntent: { intent: 'cheaper', sourceText: 'a napelemesből olcsóbbat' },
    })
    const ambiguousMemory: SessionMemory = {
      ...sessionMemory,
      shownOptions: [
        sessionMemory.shownOptions![0],
        { ...sessionMemory.shownOptions![1], featureKeys: ['solar_panel'] },
      ],
    }

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Melyikre gondolsz?', recommendations: [], links: [] }) } }],
      })
    })

    const res = await POST(makeRequest('a napelemesből olcsóbbat', baseState, [], {}, ambiguousMemory))
    const body = await res.json()

    expect(mockEvaluateCampers).not.toHaveBeenCalled()
    expect(body.updatedSessionMemory?.memoryEvents).toBeUndefined()
    expect(body.recommendations).toEqual([])
    expect(capturedSystemPrompt).toContain('REFINEMENT CONTEXT')
    expect(capturedSystemPrompt).toContain('"referenceResolution":{"status":"ambiguous"')
    expect(capturedSystemPrompt).toContain('"rerunTriggered":false')
    expect(capturedSystemPrompt).toContain('"rerunSkippedReason":"ambiguous_reference"')
    expect(capturedSystemPrompt).toContain('ask a short clarification')
  })

  it('not_found reference + refinement does not rerun or guess', async () => {
    mockExtract.mockResolvedValue({
      recommendationReference: { kind: 'feature', featureKey: 'bike_rack' },
      refinementIntent: { intent: 'cheaper', sourceText: 'a biciklitartósból olcsóbbat' },
    })

    let capturedSystemPrompt = ''
    mockGptCreate.mockImplementation((params: any) => {
      const sys = params.messages.find((m: any) => m.role === 'system')
      if (sys) capturedSystemPrompt = sys.content
      return Promise.resolve({
        choices: [{ message: { content: JSON.stringify({ reply: 'Nem találom egyértelműen.', recommendations: [], links: [] }) } }],
      })
    })

    const res = await POST(makeRequest('a biciklitartósból olcsóbbat', baseState, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockEvaluateCampers).not.toHaveBeenCalled()
    expect(body.updatedSessionMemory?.memoryEvents).toBeUndefined()
    expect(body.recommendations).toEqual([])
    expect(capturedSystemPrompt).toContain('REFINEMENT CONTEXT')
    expect(capturedSystemPrompt).toContain('"referenceResolution":{"status":"not_found"')
    expect(capturedSystemPrompt).toContain('"rerunTriggered":false')
    expect(capturedSystemPrompt).toContain('"rerunSkippedReason":"reference_not_found"')
    expect(capturedSystemPrompt).toContain('could not be identified clearly')
  })

  it('legacy refinementPreference remains compatible with the state-driven pipeline', async () => {
    mockExtract.mockResolvedValue({ refinementPreference: 'cheaper' })
    let evaluatedState: ConversationState | undefined
    mockEngineRecommendation('cheap-one', 'Cheap One', 30000, 2, state => {
      evaluatedState = state
    })
    const getPrompt = mockRecommendationResponse('cheap-one')

    const res = await POST(makeRequest('van olcsóbb?', baseState, [], {}, sessionMemory))
    const body = await res.json()

    expect(evaluatedState?.refinementIntent).toEqual(expect.objectContaining({ intent: 'cheaper' }))
    expect(evaluatedState?.pricingPreference).toEqual(expect.objectContaining({ intent: 'cheaper' }))
    expect(body.updatedState?.refinementPreference).toBeUndefined()
    expect(body.updatedState?.refinementIntent).toEqual(expect.objectContaining({ intent: 'cheaper' }))
    expect(getPrompt()).toContain('REFINEMENT CONTEXT')
    expect(getPrompt()).toContain('"refinementIntent":{"intent":"cheaper","sourceText":"van olcsóbb?"')
  })

  it('GPT cannot recommend outside the engine-selected allowed slugs after refinement rerun', async () => {
    mockExtract.mockResolvedValue({
      referenceTarget: 'lastRecommendation',
      refinementIntent: { intent: 'cheaper', sourceText: 'abból olcsóbbat' },
    })
    mockEngineRecommendation('cheap-one', 'Cheap One', 30000)
    mockRecommendationResponse('hymer-ayers-rock')

    const res = await POST(makeRequest('abból olcsóbbat', baseState, [], {}, sessionMemory))
    const body = await res.json()

    expect(mockEvaluateCampers).toHaveBeenCalledTimes(1)
    expect(body.recommendations).toEqual([])
  })
})
