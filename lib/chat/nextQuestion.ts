import { ConversationState, ChecklistField } from './state'

export interface NextQuestion {
  question: string
  field: ChecklistField
}

function isGroupTrip(state: ConversationState): boolean {
  return (state.passengers ?? state.flexibleCriteria?.passengers?.max ?? 1) > 1
}

function hasUsableFlexibleMonths(state: ConversationState): boolean {
  const months = state.flexibleCriteria?.months ?? []
  return months.length > 0 && months.length <= 3
}

function hasUsableFlexibleDuration(state: ConversationState): boolean {
  const duration = state.flexibleCriteria?.durationDays
  if (!duration) return false
  if (duration.preferred || duration.min || duration.max) return true
  return !!duration.alternatives?.length && duration.alternatives.length <= 3
}

function hasUsableFlexiblePassengers(state: ConversationState): boolean {
  const passengers = state.flexibleCriteria?.passengers
  if (!passengers) return false
  if (passengers.max || passengers.min) return true
  return !!passengers.alternatives?.length && passengers.alternatives.length <= 3
}

function hasUsableFlexibleCampingType(state: ConversationState): boolean {
  const campingTypes = state.flexibleCriteria?.campingTypes ?? []
  return campingTypes.length > 0 && campingTypes.length <= 2
}

export function getNextMissingQuestion(state: ConversationState): NextQuestion | null {
  const skipped = new Set(state.skippedChecklist ?? [])
  const groupTrip = isGroupTrip(state)

  const timingResolved = state.month || state.startDate || state.earliestAvailable || hasUsableFlexibleMonths(state)
  if (!timingResolved && !skipped.has('month')) {
    return {
      question: groupTrip ? 'Mikor szeretnétek menni?' : 'Mikor mennél?',
      field: 'month',
    }
  }

  const hasDuration = state.durationDays || (state.startDate && state.endDate) || hasUsableFlexibleDuration(state)
  if (!hasDuration && !skipped.has('durationDays')) {
    return {
      question: groupTrip ? 'Hány napra terveztek?' : 'Hány napra tervezed?',
      field: 'durationDays',
    }
  }

  if (!state.passengers && !hasUsableFlexiblePassengers(state) && !skipped.has('passengers')) {
    return { question: 'Hány fővel utaznál?', field: 'passengers' }
  }

  if (!state.campingType && !hasUsableFlexibleCampingType(state) && !skipped.has('campingType')) {
    return {
      question: groupTrip
        ? 'Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?'
        : 'Inkább vadkempingeznél, vagy kempinghelyen állnál meg?',
      field: 'campingType',
    }
  }

  if (!state.extraRequirementsAsked && !skipped.has('extraRequirements')) {
    return { question: 'Van még valami szempont vagy igény, amit figyelembe vegyek?', field: 'extraRequirements' }
  }

  return null
}
