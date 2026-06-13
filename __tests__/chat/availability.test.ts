import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseCalls: Array<{ table: string; method: string; args: unknown[] }> = []
const defaultBookingRows = [{
  start_date: '2026-07-12',
  end_date: '2026-07-19',
  status: 'confirmed',
  campers: { slug: 'hobby-t75hf' },
}]
let bookingRows = [...defaultBookingRows]
const priceRows = [
  { camper_id: 'hobby-id', season_id: 'low', price: 44000 },
  { camper_id: 'hobby-id', season_id: 'pre', price: 58000 },
  { camper_id: 'hobby-id', season_id: 'peak', price: 73000 },
]
const seasonRows = [
  { id: 'low', from_md: '10-01', to_md: '04-30', sort_order: 1 },
  { id: 'pre', from_md: '05-01', to_md: '06-30', sort_order: 2 },
  { id: 'peak', from_md: '07-01', to_md: '09-30', sort_order: 3 },
]

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

function makeCamperPricesBuilder() {
  const builder: Record<string, unknown> = {
    data: priceRows,
    error: null,
  }
  builder.select = (...args: unknown[]) => {
    supabaseCalls.push({ table: 'camper_prices', method: 'select', args })
    return builder
  }
  builder.eq = (...args: unknown[]) => {
    supabaseCalls.push({ table: 'camper_prices', method: 'eq', args })
    const [column, value] = args
    if (column === 'season_id') {
      builder.data = priceRows.filter(row => row.season_id === value)
    }
    return builder
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
            id: 'hobby-id',
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
      if (table === 'camper_prices') return makeCamperPricesBuilder()
      if (table === 'seasons') return makeBuilder(table, { data: seasonRows })

      return makeBuilder(table, {
        data: bookingRows,
      })
    },
  },
}))

import {
  computeFreeSlots,
  getMonthSearchWindow,
  getPreferredStartSearchWindow,
  pickSlots,
  pickSlotsForPreferredStartWindows,
  searchAvailableCampers,
} from '@/lib/chat/availability'
import { buildContextBlock } from '@/lib/chat/prompts'

beforeEach(() => {
  supabaseCalls.length = 0
  bookingRows = [...defaultBookingRows]
})

afterEach(() => {
  vi.useRealTimers()
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

  it('preferredStartWindow filters by slot start, not by full rental containment', () => {
    const picked = pickSlotsForPreferredStartWindows([
      { from: '2026-09-25', to: '2026-10-20', days: 26 },
    ], [{
      startDate: '2026-09-21',
      endDate: '2026-09-30',
      precision: 'month_part',
      part: 'late',
      sourceText: 'szeptember vége',
    }], 20)

    expect(picked).toEqual([
      { from: '2026-09-25', to: '2026-10-14', days: 20 },
    ])
  })

  it('preferredStartWindow booking search window extends by requested duration', () => {
    const searchWindow = getPreferredStartSearchWindow({
      durationDays: 20,
      flexibleCriteria: {
        preferredStartWindows: [{
          startDate: '2026-09-21',
          endDate: '2026-09-30',
          precision: 'month_part',
          part: 'late',
        }],
      },
    })

    expect(searchWindow).toEqual({
      from: '2026-09-21',
      to: '2026-10-19',
    })
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

  it('current month availability search starts from today, not the first day of the month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T10:00:00.000Z'))
    bookingRows = []

    await searchAvailableCampers({
      intent: 'availability',
      month: '2026-06',
      durationDays: 3,
      passengers: 2,
    })

    expect(supabaseCalls).toContainEqual({
      table: 'bookings',
      method: 'gt',
      args: ['end_date', '2026-06-14'],
    })
    expect(getMonthSearchWindow('2026-06')).toEqual({
      from: '2026-06-14',
      to: '2026-06-30',
    })
  })

  it('future month availability search starts from the first day of that month', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-06-14T10:00:00.000Z'))
    bookingRows = []

    await searchAvailableCampers({
      intent: 'availability',
      month: '2026-07',
      durationDays: 3,
      passengers: 2,
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

  it('does not exclude campers from availability results because they were already recommended', async () => {
    bookingRows = []

    const results = await searchAvailableCampers({
      intent: 'availability',
      month: '2026-07',
      durationDays: 8,
      alreadyRecommendedSlugs: ['hobby-t75hf'],
    })

    expect(results.map(result => result.slug)).toContain('hobby-t75hf')
  })

  it('uses the price for the season matching the requested month', async () => {
    bookingRows = []

    const results = await searchAvailableCampers({
      intent: 'availability',
      month: '2026-07',
      durationDays: 8,
      passengers: 2,
    })

    expect(results[0].price_per_day).toBe(73000)
    expect(supabaseCalls).toContainEqual({
      table: 'camper_prices',
      method: 'eq',
      args: ['season_id', 'peak'],
    })
  })

  it('uses the preferred start window start date to pick the availability price season', async () => {
    bookingRows = []

    const results = await searchAvailableCampers({
      intent: 'availability',
      durationDays: 8,
      flexibleCriteria: {
        preferredStartWindows: [{
          startDate: '2026-06-25',
          endDate: '2026-06-30',
          precision: 'month_part',
          part: 'late',
        }],
      },
    })

    expect(results[0].price_per_day).toBe(58000)
    expect(supabaseCalls).toContainEqual({
      table: 'camper_prices',
      method: 'eq',
      args: ['season_id', 'pre'],
    })
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
