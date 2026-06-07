import { ConversationState, ChecklistField } from './state'

export interface NextQuestion {
  question: string
  field: ChecklistField
}

export function getNextMissingQuestion(state: ConversationState): NextQuestion | null {
  const timingResolved = state.month || state.startDate || state.earliestAvailable
  if (!timingResolved) {
    return { question: 'Mikor szeretnétek menni? Elég a hónap is.', field: 'month' }
  }

  const hasDuration = state.durationDays || (state.startDate && state.endDate)
  if (!hasDuration && !state.earliestAvailable) {
    return { question: 'Hány napra terveztek?', field: 'durationDays' }
  }

  if (!state.passengers) {
    return { question: 'Hányan utaznátok?', field: 'passengers' }
  }

  if (!state.campingType) {
    return { question: 'Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?', field: 'campingType' }
  }

  if (!state.extraRequirementsAsked) {
    return { question: 'Van még valami szempont vagy igény, amit figyelembe vegyek?', field: 'extraRequirements' }
  }

  return null
}
