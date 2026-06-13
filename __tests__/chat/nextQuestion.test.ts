import { describe, it, expect } from 'vitest'
import { getNextMissingQuestion } from '@/lib/chat/nextQuestion'
import { mergeState } from '@/lib/chat/state'
import type { ConversationState } from '@/lib/chat/state'

// ────────────────────────────────────────────────────────────────
// FLOW 1: "Segíts választani" — empty state → first question asked
// ────────────────────────────────────────────────────────────────
describe('Flow 1 – empty state starts checklist', () => {
  it('asks month when nothing is known', () => {
    const q = getNextMissingQuestion({})
    expect(q).not.toBeNull()
    expect(q?.field).toBe('month')
  })

  it('returns a non-empty question string', () => {
    const q = getNextMissingQuestion({ intent: 'recommendation' })
    expect(q?.question.length).toBeGreaterThan(5)
  })

  it('uses singular wording before passenger count is known', () => {
    const q = getNextMissingQuestion({ intent: 'recommendation' })
    expect(q?.question).toBe('Kezdjük az időponttal: mikorra tervezed az utat?')
  })

  it('uses plural wording when passenger count already indicates a group', () => {
    const q = getNextMissingQuestion({ intent: 'recommendation', passengers: 2 })
    expect(q?.question).toBe('Kezdjük az időponttal: mikorra tervezitek az utat?')
  })
})

// ────────────────────────────────────────────────────────────────
// FLOW 2: "4" after "Hány napra?" → durationDays=4, next ≠ durationDays
// ────────────────────────────────────────────────────────────────
describe('Flow 2 – durationDays extraction advances checklist', () => {
  const stateWithMonth: ConversationState = { intent: 'recommendation', month: '2026-07' }

  it('asks durationDays when month is known but duration missing', () => {
    const q = getNextMissingQuestion(stateWithMonth)
    expect(q?.field).toBe('durationDays')
    expect(q?.question).toBe('Oké, és nagyjából hány napra vinnéd el?')
  })

  it('advances to passengers after durationDays=4 is merged in', () => {
    const merged = mergeState(stateWithMonth, { durationDays: 4 })
    const q = getNextMissingQuestion(merged)
    expect(q?.field).toBe('passengers')
    expect(q?.question).toBe('Rendben, hányan utaznátok összesen?')
    expect(q?.field).not.toBe('durationDays') // regression guard
  })

  it('merged state contains durationDays=4', () => {
    const merged = mergeState(stateWithMonth, { durationDays: 4 })
    expect(merged.durationDays).toBe(4)
  })
})

// ────────────────────────────────────────────────────────────────
// FLOW 4: nextQuestion present → Supabase TILOS
// Proxy: resolveMode logika — ha nextQuestion van, mode=ask_next_question
// ────────────────────────────────────────────────────────────────
describe('Flow 4 – ask_next_question mode blocks Supabase', () => {
  it('checklist is incomplete when only month is known', () => {
    const q = getNextMissingQuestion({ month: '2026-07' })
    expect(q).not.toBeNull() // → ask_next_question mode → no Supabase
  })

  it('checklist is incomplete when month + duration is known but not passengers', () => {
    const q = getNextMissingQuestion({ month: '2026-07', durationDays: 4 })
    expect(q).not.toBeNull()
    expect(q?.field).toBe('passengers')
    expect(q?.question).toBe('Rendben, hányan utaznátok összesen?')
  })

  it('uses plural campingType wording after passengers > 1 is known', () => {
    const q = getNextMissingQuestion({ month: '2026-07', durationDays: 4, passengers: 2 })
    expect(q?.field).toBe('campingType')
    expect(q?.question).toBe('Inkább kempinghelyeken állnátok meg, vagy olyan autót keressek, ami vadkempinghez is jó?')
  })

  it('uses singular campingType wording for solo trips', () => {
    const q = getNextMissingQuestion({ month: '2026-07', durationDays: 4, passengers: 1 })
    expect(q?.field).toBe('campingType')
    expect(q?.question).toBe('Inkább kempinghelyeken állnál meg, vagy olyan autót keressek, ami vadkempinghez is jó?')
  })

  it('checklist is complete when all required fields are set', () => {
    const full: ConversationState = {
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    }
    const q = getNextMissingQuestion(full)
    expect(q).toBeNull() // → recommend/availability mode → Supabase allowed
  })

  it('earliestAvailable skips month but still asks duration', () => {
    const q = getNextMissingQuestion({ earliestAvailable: true })
    expect(q?.field).toBe('durationDays')
    expect(q?.question).toBe('Oké, és nagyjából hány napra vinnéd el?')
  })
})

// ────────────────────────────────────────────────────────────────
// mergeState behaves correctly (foundation for all flows)
// ────────────────────────────────────────────────────────────────
describe('mergeState', () => {
  it('carries over existing fields', () => {
    const state = mergeState({ month: '2026-07', passengers: 2 }, { durationDays: 4 })
    expect(state.month).toBe('2026-07')
    expect(state.passengers).toBe(2)
    expect(state.durationDays).toBe(4)
  })

  it('update overwrites existing field', () => {
    const state = mergeState({ passengers: 2 }, { passengers: 4 })
    expect(state.passengers).toBe(4)
  })

  it('deduplicates alreadyRecommendedSlugs', () => {
    const state = mergeState(
      { alreadyRecommendedSlugs: ['hobby-t75hf'] },
      { alreadyRecommendedSlugs: ['hobby-t75hf', 'vw-crafter'] },
    )
    expect(state.alreadyRecommendedSlugs).toEqual(['hobby-t75hf', 'vw-crafter'])
  })

  it('merges canonical refinementIntent as current state delta', () => {
    const state = mergeState({}, {
      refinementIntent: {
        intent: 'keep_current',
        targetReference: 'lastRecommendation',
        sourceText: 'maradjunk ennél',
      },
    })

    expect(state.refinementIntent).toEqual({
      intent: 'keep_current',
      targetReference: 'lastRecommendation',
      sourceText: 'maradjunk ennél',
    })
  })

  it('resets refinementIntent on the next turn unless explicitly updated', () => {
    const state = mergeState({
      refinementIntent: {
        intent: 'cheaper',
        sourceText: 'van olcsóbb?',
      },
    }, {})

    expect(state.refinementIntent).toBeUndefined()
  })
})
describe('Regression - campingType is complete when camping_site is set', () => {
  it('does not ask campingType again when campingType is camping_site', () => {
    const q = getNextMissingQuestion({
      month: '2026-08',
      durationDays: 8,
      passengers: 5,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    })

    expect(q).toBeNull()
  })
})

describe('Flexible trip criteria', () => {
  it('treats up to 3 alternative months as timing resolved', () => {
    const q = getNextMissingQuestion({
      intent: 'recommendation',
      flexibleCriteria: { months: ['2026-07', '2026-08'] },
    })
    expect(q?.field).toBe('durationDays')
  })

  it('treats flexible duration and passenger alternatives as resolved', () => {
    const q = getNextMissingQuestion({
      intent: 'recommendation',
      month: '2026-07',
      flexibleCriteria: {
        durationDays: { min: 5, max: 7, preferred: 7 },
        passengers: { alternatives: [2, 4], max: 4 },
      },
    })
    expect(q?.field).toBe('campingType')
  })

  it('asks for clarification when alternative months would exceed branch limit', () => {
    const q = getNextMissingQuestion({
      intent: 'recommendation',
      flexibleCriteria: { months: ['2026-07', '2026-08', '2026-09', '2026-10'] },
    })
    expect(q?.field).toBe('month')
  })
})
