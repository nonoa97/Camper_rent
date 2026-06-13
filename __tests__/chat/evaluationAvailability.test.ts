import { describe, expect, it, vi } from 'vitest'

import type { BookingFact, CamperFact } from '@/lib/chat/evaluationFacts'

vi.mock('@/lib/supabase', () => ({
  supabase: {},
}))

import {
  evaluateAvailability,
  summarizeAvailability,
} from '@/lib/chat/evaluationAvailability'

const camper: CamperFact = {
  id: 'camper-1',
  slug: 'camper-one',
  name: 'Camper One',
  imageUrl: '/camper.jpg',
  type: 'Camper van',
  gearbox: 'Automata',
  fuelType: 'Dizel',
  year: 2024,
  beds: 4,
  features: [],
  featureKeys: new Set(),
}

describe('evaluation availability', () => {
  it('returns no slots and no failure when there is no availability constraint', () => {
    expect(evaluateAvailability(camper, [], {})).toEqual({ slots: [] })
  })

  it('treats booking endDate as checkout day and allows availability from that date', () => {
    const bookings: BookingFact[] = [{
      camperId: camper.id,
      startDate: '2026-07-01',
      endDate: '2026-07-13',
    }]

    expect(evaluateAvailability(camper, bookings, {
      startDate: '2026-07-13',
      endDate: '2026-07-20',
      durationDays: 8,
    })).toEqual({
      slots: [{ from: '2026-07-13', to: '2026-07-20', days: 8 }],
    })
  })

  it('returns duration availability failure when requested duration has no matching slot', () => {
    const bookings: BookingFact[] = [{
      camperId: camper.id,
      startDate: '2026-07-04',
      endDate: '2026-07-10',
    }]

    expect(evaluateAvailability(camper, bookings, {
      startDate: '2026-07-01',
      endDate: '2026-07-14',
      durationDays: 7,
    })).toEqual({
      slots: [],
      failure: {
        key: 'duration_availability',
        label: 'Nincs elég hosszú folyamatos szabad időszak',
      },
    })
  })

  it('uses preferredStartWindow as a start window, not a full rental containment window', () => {
    const bookings: BookingFact[] = [{
      camperId: camper.id,
      startDate: '2026-09-01',
      endDate: '2026-09-25',
    }]

    expect(evaluateAvailability(camper, bookings, {
      durationDays: 20,
      flexibleCriteria: {
        preferredStartWindows: [{
          startDate: '2026-09-21',
          endDate: '2026-09-30',
          precision: 'month_part',
          part: 'late',
          sourceText: 'szeptember vége',
        }],
      },
    })).toEqual({
      slots: [{ from: '2026-09-25', to: '2026-10-14', days: 20 }],
    })
  })

  it('summarizes the first available slot', () => {
    expect(summarizeAvailability([
      { from: '2026-07-13', to: '2026-07-20', days: 8 },
      { from: '2026-07-21', to: '2026-07-25', days: 5 },
    ])).toEqual({
      from: '2026-07-13',
      to: '2026-07-20',
      days: 8,
    })
  })
})
