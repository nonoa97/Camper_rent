import { describe, it, expect, vi, beforeEach } from 'vitest'

const supabaseCalls: Array<{ table: string; method: string; args: unknown[] }> = []
const defaultBookingRows = [{
  start_date: '2026-07-12',
  end_date: '2026-07-19',
  status: 'confirmed',
  campers: { slug: 'hobby-t75hf' },
}]
let bookingRows = [...defaultBookingRows]

function makeBuilder(table: string, result: { data: unknown; error?: unknown }) {
  const builder: Record<string, unknown> = {
    data: result.data,
    error: result.error ?? null,
  }

  for (const method of ['select', 'eq', 'order', 'lt', 'gt', 'single']) {
    builder[method] = (...args: unknown[]) => {
      supabaseCalls.push({ table, method, args })
      return builder
    }
  }

  return builder
}

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      supabaseCalls.push({ table, method: 'from', args: [] })
      if (table === 'campers') {
        return makeBuilder(table, {
          data: [{
            slug: 'hobby-t75hf',
            name: 'Hobby T75HF',
            image_url: '/hobby.jpg',
            price_per_day: 35000,
            type: 'Alkóvos',
            beds: 6,
            wild_camping_suitable: true,
          }],
        })
      }

      return makeBuilder(table, {
        data: bookingRows,
      })
    },
  },
}))

import { computeFreeSlots, pickSlots, searchAvailableCampers } from '@/lib/chat/availability'
import { buildContextBlock } from '@/lib/chat/prompts'

beforeEach(() => {
  supabaseCalls.length = 0
  bookingRows = [...defaultBookingRows]
})

describe('Availability - booking overlap and slot computation', () => {
  it('splits a July window around a confirmed July 12-19 booking', () => {
    const freeSlots = computeFreeSlots(
      [{ start_date: '2026-07-12', end_date: '2026-07-19', status: 'confirmed' }],
      '2026-07-01',
      '2026-07-31',
      3,
    )

    expect(freeSlots).not.toEqual([
      { from: '2026-07-01', to: '2026-07-31', days: 31 },
    ])
    expect(freeSlots).toEqual([
      { from: '2026-07-01', to: '2026-07-11', days: 11 },
      { from: '2026-07-19', to: '2026-07-31', days: 13 },
    ])
  })

  it('pickSlots only returns slots that can fit durationDays=8', () => {
    const picked = pickSlots([
      { from: '2026-07-01', to: '2026-07-05', days: 5 },
      { from: '2026-07-19', to: '2026-07-31', days: 13 },
    ], 8)

    expect(picked).toEqual([
      { from: '2026-07-19', to: '2026-07-26', days: 8 },
    ])
  })

  it('Supabase bookings query uses overlap conditions, not month-contained filtering', async () => {
    await searchAvailableCampers({
      intent: 'recommendation',
      month: '2026-07',
      durationDays: 8,
      passengers: 5,
      campingType: 'camping_site',
      extraRequirementsAsked: true,
    })

    expect(supabaseCalls).toContainEqual({
      table: 'bookings',
      method: 'lt',
      args: ['start_date', '2026-08-01'],
    })
    expect(supabaseCalls).toContainEqual({
      table: 'bookings',
      method: 'gt',
      args: ['end_date', '2026-07-01'],
    })
  })

  it('exact date range allows a camper when a previous booking ends on the requested start date', async () => {
    bookingRows = [{
      start_date: '2026-07-01',
      end_date: '2026-07-13',
      status: 'confirmed',
      campers: { slug: 'hobby-t75hf' },
    }]

    const results = await searchAvailableCampers({
      intent: 'availability',
      startDate: '2026-07-13',
      endDate: '2026-08-06',
      durationDays: 25,
      passengers: 2,
      campingType: 'wild',
      extraRequirementsAsked: true,
    })

    expect(results).toHaveLength(1)
    expect(results[0].availableSlots).toEqual([
      { from: '2026-07-13', to: '2026-08-06', days: 25 },
    ])
  })
})

describe('Availability - GPT context uses computed slots only', () => {
  it('does not collapse split slots into a fake full-month availability range', () => {
    const context = buildContextBlock({
      mode: 'recommend',
      state: {
        intent: 'recommendation',
        month: '2026-07',
        durationDays: 8,
        passengers: 5,
        campingType: 'camping_site',
        extraRequirementsAsked: true,
      },
      nextQuestion: null,
      camperResults: [{
        slug: 'hobby-t75hf',
        name: 'Hobby T75HF',
        image_url: '/hobby.jpg',
        price_per_day: 35000,
        type: 'Alkovos',
        beds: 6,
        wildCampingSuitable: true,
        availableSlots: [
          { from: '2026-07-01', to: '2026-07-08', days: 8 },
          { from: '2026-07-19', to: '2026-07-26', days: 8 },
        ],
      }],
      allowedCamperSlugs: ['hobby-t75hf'],
    })

    expect(context).not.toContain('availableFrom: 2026-07-01')
    expect(context).not.toContain('availableTo: 2026-07-31')
    expect(context).not.toContain('availableTo: 2026-07-30')
    expect(context).toContain('availableSlots:')
    expect(context).toContain('from: 2026-07-01')
    expect(context).toContain('to: 2026-07-08')
    expect(context).toContain('from: 2026-07-19')
    expect(context).toContain('to: 2026-07-26')
  })
})
