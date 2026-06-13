import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ConversationState } from '@/lib/chat/state'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

import { getSearchWindow } from '@/lib/chat/evaluationFacts'

describe('evaluation facts', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('creates an exact search window from explicit start and end dates', () => {
    expect(getSearchWindow({
      startDate: '2026-07-10',
      endDate: '2026-07-17',
    } as ConversationState)).toEqual({
      from: '2026-07-10',
      to: '2026-07-17',
      hasAvailabilityConstraint: true,
    })
  })

  it('creates a full-month search window from month criteria', () => {
    expect(getSearchWindow({ month: '2026-02' } as ConversationState)).toEqual({
      from: '2026-02-01',
      to: '2026-02-28',
      hasAvailabilityConstraint: true,
    })
  })

  it('starts the current month search window from today, not the first day of the month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T10:00:00.000Z'))

    expect(getSearchWindow({ month: '2026-06' } as ConversationState)).toEqual({
      from: '2026-06-14',
      to: '2026-06-30',
      hasAvailabilityConstraint: true,
    })
  })

  it('keeps future month search windows on the first day of the month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T10:00:00.000Z'))

    expect(getSearchWindow({ month: '2026-07' } as ConversationState)).toEqual({
      from: '2026-07-01',
      to: '2026-07-31',
      hasAvailabilityConstraint: true,
    })
  })

  it('returns no availability constraint when no date criteria exist', () => {
    expect(getSearchWindow({} as ConversationState)).toEqual({
      hasAvailabilityConstraint: false,
    })
  })
})
