import { describe, expect, it, vi } from 'vitest'

import type { ConversationState } from '@/lib/chat/state'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

import { getSearchWindow } from '@/lib/chat/evaluationFacts'

describe('evaluation facts', () => {
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

  it('returns no availability constraint when no date criteria exist', () => {
    expect(getSearchWindow({} as ConversationState)).toEqual({
      hasAvailabilityConstraint: false,
    })
  })
})
