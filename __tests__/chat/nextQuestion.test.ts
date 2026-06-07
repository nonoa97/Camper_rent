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
})

// ────────────────────────────────────────────────────────────────
// FLOW 2: "4" after "Hány napra?" → durationDays=4, next ≠ durationDays
// ────────────────────────────────────────────────────────────────
describe('Flow 2 – durationDays extraction advances checklist', () => {
  const stateWithMonth: ConversationState = { intent: 'recommendation', month: '2026-07' }

  it('asks durationDays when month is known but duration missing', () => {
    const q = getNextMissingQuestion(stateWithMonth)
    expect(q?.field).toBe('durationDays')
  })

  it('advances to passengers after durationDays=4 is merged in', () => {
    const merged = mergeState(stateWithMonth, { durationDays: 4 })
    const q = getNextMissingQuestion(merged)
    expect(q?.field).toBe('passengers')
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

  it('earliestAvailable skips month + duration questions', () => {
    const q = getNextMissingQuestion({ earliestAvailable: true })
    expect(q?.field).toBe('passengers') // not month, not durationDays
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
})
