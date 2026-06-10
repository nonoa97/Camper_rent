import { describe, it, expect } from 'vitest'
import { validateGptOutput, FALLBACK_OUTPUT } from '@/lib/chat/validateOutput'

// ──────────────────────────────────────────────────────────────
// Task 1 – reason field validation: trim + max 200 chars
// ──────────────────────────────────────────────────────────────
describe('validateGptOutput – reason field validation', () => {
  const allowed = new Set(['hobby-t75hf'])

  it('normal reason passes through unchanged', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom.',
      recommendations: [{ slug: 'hobby-t75hf', reason: 'Vadkempinghez ideális.' }],
      links: [],
    })
    const result = validateGptOutput(raw, allowed, 'recommend')
    expect(result.recommendations[0].reason).toBe('Vadkempinghez ideális.')
  })

  it('reason trimmed of surrounding whitespace', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom.',
      recommendations: [{ slug: 'hobby-t75hf', reason: '  Jó autó.  ' }],
      links: [],
    })
    const result = validateGptOutput(raw, allowed, 'recommend')
    expect(result.recommendations[0].reason).toBe('Jó autó.')
  })

  it('reason longer than 200 chars → truncated to 200', () => {
    const longReason = 'x'.repeat(300)
    const raw = JSON.stringify({
      reply: 'Ajánlom.',
      recommendations: [{ slug: 'hobby-t75hf', reason: longReason }],
      links: [],
    })
    const result = validateGptOutput(raw, allowed, 'recommend')
    expect(result.recommendations[0].reason.length).toBe(200)
  })

  it('reason not a string → empty string', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom.',
      recommendations: [{ slug: 'hobby-t75hf', reason: 42 }],
      links: [],
    })
    const result = validateGptOutput(raw, allowed, 'recommend')
    expect(result.recommendations[0].reason).toBe('')
  })

  it('missing reason → empty string', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom.',
      recommendations: [{ slug: 'hobby-t75hf' }],
      links: [],
    })
    const result = validateGptOutput(raw, allowed, 'recommend')
    expect(result.recommendations[0].reason).toBe('')
  })
})

// ──────────────────────────────────────────────────────────────
// Task 2 (output validation) – empty reply + recommendations → fallback reply
// ──────────────────────────────────────────────────────────────
describe('validateGptOutput – empty reply fallback', () => {
  it('empty reply + non-empty recommendations → fallback reply generated', () => {
    const raw = JSON.stringify({
      reply: '',
      recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó.' }],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(['hobby-t75hf']), 'recommend')
    expect(result.reply).toBeTruthy()
    expect(result.reply).toBe('Találtam néhány jó lehetőséget.')
    expect(result.recommendations).toHaveLength(1)
  })

  it('non-empty reply + recommendations → reply unchanged', () => {
    const raw = JSON.stringify({
      reply: 'Íme a legjobb választás.',
      recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó.' }],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(['hobby-t75hf']), 'recommend')
    expect(result.reply).toBe('Íme a legjobb választás.')
  })

  it('empty reply + empty recommendations → FALLBACK_OUTPUT (existing behavior)', () => {
    const raw = JSON.stringify({ reply: '', recommendations: [], links: [] })
    const result = validateGptOutput(raw, new Set(), 'recommend')
    expect(result).toEqual(FALLBACK_OUTPUT)
  })
})

// ──────────────────────────────────────────────────────────────
// Reply generation Task 2 – reply/recommendations consistency guardrails
// ──────────────────────────────────────────────────────────────

describe('validateGptOutput – ask_next_question mode', () => {
  it('forces recommendations to [] regardless of GPT output', () => {
    const raw = JSON.stringify({
      reply: 'Mikor mennétek?',
      recommendations: [{ slug: 'hobby-t75hf', reason: 'Jó autó' }],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(['hobby-t75hf']), 'ask_next_question')
    expect(result.recommendations).toEqual([])
  })

  it('reply still returned in ask_next_question mode', () => {
    const raw = JSON.stringify({
      reply: 'Mikor mennétek?',
      recommendations: [],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(), 'ask_next_question')
    expect(result.reply).toBe('Mikor mennétek?')
  })
})

describe('validateGptOutput – allowedSlugs guardrail', () => {
  it('slug not in allowedSlugs → filtered out', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom ezt.',
      recommendations: [{ slug: 'unknown-camper', reason: 'Jó' }],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(['hobby-t75hf']), 'recommend')
    expect(result.recommendations).toEqual([])
  })

  it('slug in allowedSlugs → passes through with reason', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom ezt.',
      recommendations: [{ slug: 'hobby-t75hf', reason: 'Vadkempinghez ideális.' }],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(['hobby-t75hf']), 'recommend')
    expect(result.recommendations).toHaveLength(1)
    expect(result.recommendations[0].slug).toBe('hobby-t75hf')
    expect(result.recommendations[0].reason).toBe('Vadkempinghez ideális.')
  })

  it('max 2 recommendations even if more are allowed', () => {
    const raw = JSON.stringify({
      reply: 'Három autó:',
      recommendations: [
        { slug: 'a', reason: 'ok' },
        { slug: 'b', reason: 'ok' },
        { slug: 'c', reason: 'ok' },
      ],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(['a', 'b', 'c']), 'recommend')
    expect(result.recommendations).toHaveLength(2)
  })

  it('empty allowedSlugs → all recommendations pass through (unrestricted)', () => {
    const raw = JSON.stringify({
      reply: 'Ajánlom.',
      recommendations: [{ slug: 'anything', reason: 'ok' }],
      links: [],
    })
    const result = validateGptOutput(raw, new Set(), 'recommend')
    expect(result.recommendations).toHaveLength(1)
  })
})

describe('validateGptOutput – fallback and error handling', () => {
  it('invalid JSON → FALLBACK_OUTPUT', () => {
    const result = validateGptOutput('not json', new Set(), 'recommend')
    expect(result).toEqual(FALLBACK_OUTPUT)
  })

  it('empty reply + empty recommendations → FALLBACK_OUTPUT', () => {
    const raw = JSON.stringify({ reply: '', recommendations: [], links: [] })
    const result = validateGptOutput(raw, new Set(), 'recommend')
    expect(result).toEqual(FALLBACK_OUTPUT)
  })

  it('has reply but empty recommendations → not fallback', () => {
    const raw = JSON.stringify({ reply: 'Sajnos nincs találat.', recommendations: [], links: [] })
    const result = validateGptOutput(raw, new Set(), 'recommend')
    expect(result.reply).toBe('Sajnos nincs találat.')
    expect(result).not.toEqual(FALLBACK_OUTPUT)
  })
})
