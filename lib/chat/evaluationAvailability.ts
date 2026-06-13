import { computeFreeSlots, pickSlotsForPreferredStartWindows } from './availability'
import { getSearchWindow, type BookingFact, type CamperFact } from './evaluationFacts'
import { HARD_FAILURE_LABELS, MIN_RENTAL_DAYS } from './evaluationPolicy'
import type { HardFailure } from './evaluation'
import type { ConversationState, RecommendationAvailabilitySummary } from './state'

export interface EvaluationAvailabilitySlot {
  from: string
  to: string
  days: number
}

export interface EvaluationAvailabilityResult {
  failure?: HardFailure
  slots: EvaluationAvailabilitySlot[]
}

export function evaluateAvailability(
  camper: CamperFact,
  bookings: BookingFact[],
  state: ConversationState,
): EvaluationAvailabilityResult {
  const window = getSearchWindow(state)
  if (!window.hasAvailabilityConstraint || !window.from || !window.to) {
    return { slots: [] }
  }

  const minDays = state.durationDays ?? MIN_RENTAL_DAYS
  const bookingRows = bookings.map(booking => ({
    start_date: booking.startDate,
    end_date: booking.endDate,
    status: 'confirmed',
  }))
  const freeSlots = computeFreeSlots(bookingRows, window.from, window.to, minDays)
  const slots = pickSlotsForPreferredStartWindows(
    freeSlots,
    state.flexibleCriteria?.preferredStartWindows,
    state.durationDays,
  )

  if (state.durationDays && slots.length === 0) {
    return {
      slots: [],
      failure: {
        key: 'duration_availability',
        label: HARD_FAILURE_LABELS.duration_availability,
      },
    }
  }

  if (!state.durationDays && freeSlots.length === 0) {
    return {
      slots: [],
      failure: {
        key: 'availability',
        label: HARD_FAILURE_LABELS.availability,
      },
    }
  }

  return { slots: slots.length > 0 ? slots : freeSlots.slice(0, 2) }
}

export function summarizeAvailability(
  slots: EvaluationAvailabilitySlot[],
): RecommendationAvailabilitySummary | undefined {
  const first = slots[0]
  if (!first) return undefined
  return {
    from: first.from,
    to: first.to,
    days: first.days,
  }
}
