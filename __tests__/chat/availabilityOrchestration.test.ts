import { describe, expect, it } from 'vitest'
import {
  applyAvailabilitySlotConfirmation,
  applyEarliestPendingAvailability,
  applyLongestPendingAvailability,
  buildEarliestAvailabilityConfirmation,
  buildLongestAvailableDurationReply,
  buildProgressiveAvailabilityReply,
  createFlexibleSearchBranches,
  getFirstAvailableResult,
  getReferencedAvailabilitySlot,
  sessionAvailabilityToMemorySlot,
} from '@/lib/chat/availabilityOrchestration'
import type { CamperResult } from '@/lib/chat/availability'
import type { ConversationState, SessionAvailabilityResult } from '@/lib/chat/state'

const camper: CamperResult = {
  slug: 'hobby-t75hf',
  name: 'Hobby T75HF',
  image_url: '/hobby.jpg',
  price_per_day: 58000,
  type: 'Alkóvos',
  beds: 4,
  availableSlots: [
    { from: '2026-07-13', to: '2026-07-20', days: 7 },
    { from: '2026-08-01', to: '2026-08-18', days: 17 },
  ],
}

describe('availabilityOrchestration', () => {
  it('builds progressive availability copy without exposing recommendation logic', () => {
    expect(buildProgressiveAvailabilityReply(
      { month: '2026-07', durationDays: 7 },
      { field: 'passengers', question: 'Hány fővel utaznátok?' },
      true,
    )).toBe('Találtam szabad opciót 2026. júliusban 7 napra. Hány fővel utaznátok?')

    expect(buildProgressiveAvailabilityReply(
      { month: '2026-07', durationDays: 7 },
      { field: 'passengers', question: 'Hány fővel utaznátok?' },
      false,
    )).toContain('Sajnos 2026. júliusra 7 napra nem találok szabad lakóautót.')
  })

  it('creates flexible search branches without legacy wild camping branches', () => {
    const branches = createFlexibleSearchBranches({
      flexibleCriteria: {
        months: ['2026-07', '2026-08', '2026-09'],
        campingTypes: ['wild', 'camping_site'],
      },
    } as ConversationState)

    expect(branches?.map(branch => branch.label)).toEqual([
      '2026-07',
      '2026-08',
      '2026-09',
    ])
    expect(branches?.some(branch => branch.state.campingType === 'wild')).toBe(false)
  })

  it('converts session availability to prompt-memory slot and resolves previous slot', () => {
    const result: SessionAvailabilityResult = {
      camperSlug: 'hobby-t75hf',
      camperName: 'Hobby T75HF',
      from: '2026-07-13',
      to: '2026-07-20',
      days: 7,
      source: 'fallback_earliest',
    }
    const slot = sessionAvailabilityToMemorySlot(result)
    const state: ConversationState = {
      startDate: '2026-08-01',
      conversationMemory: {
        mentionedAvailabilityOptions: [
          slot,
          {
            startDate: '2026-08-05',
            endDate: '2026-08-12',
            durationDays: 7,
            camperSlug: 'later',
          },
        ],
      },
    }

    expect(slot.source).toBe('fallback_earliest')
    expect(getReferencedAvailabilitySlot(state)).toMatchObject({ camperSlug: 'hobby-t75hf' })
  })

  it('stores pending availability confirmation and canonical conversation-memory availability option', () => {
    const state: ConversationState = {}

    applyEarliestPendingAvailability(state, [camper], 'fallback_earliest')

    expect(state.pendingAvailabilityConfirmation).toMatchObject({
      startDate: '2026-07-13',
      camperSlug: 'hobby-t75hf',
    })
    expect(state.lastAvailabilitySlots).toBeUndefined()
    expect(state.conversationMemory?.mentionedAvailabilityOptions).toHaveLength(1)

    applyAvailabilitySlotConfirmation(state, {
      startDate: '2026-09-01',
      endDate: '2026-09-08',
      durationDays: 7,
      camperSlug: 'hobby-t75hf',
    })

    expect(state.pendingAvailabilityConfirmation?.month).toBe('2026-09')
  })

  it('finds first and longest availability slots and builds matching replies', () => {
    expect(getFirstAvailableResult([camper])?.slot.days).toBe(7)

    const state: ConversationState = { month: '2026-08', durationDays: 10 }
    applyLongestPendingAvailability(state, [camper])

    expect(state.pendingAvailabilityConfirmation).toMatchObject({
      startDate: '2026-08-01',
      durationDays: 17,
    })
    expect(buildEarliestAvailabilityConfirmation({ durationDays: 7 }, [camper]))
      .toContain('Leghamarabb **2026. július 13. és 2026. július 20. között**')
    expect(buildLongestAvailableDurationReply({ month: '2026-08', durationDays: 10 }, [camper]))
      .toContain('a leghosszabb foglalható szabad idő 17 nap')
  })
})
