import type {
  ConstraintMemory,
  ConversationState,
  ConversationStateUpdate,
  MemoryConcernType,
  SessionMemory,
} from './state'
import { mergeState } from './state'
import { markStaleAvailabilityResults } from './availabilityMemory'
import { hasWildCampingCapability } from './nextQuestion'
import {
  inferRefinementConcernType,
  refinementIntentFromLegacy,
} from './refinementPipeline'
import { hasPreferenceContext } from './preferenceContext'
import { resolveCapabilityAlias } from './capabilityAliases'

export type AvailabilityAffectingField =
  | 'month'
  | 'passengers'
  | 'durationDays'
  | 'campingType'
  | 'startDate'
  | 'endDate'
  | 'earliestAvailable'

const AVAILABILITY_FIELDS: AvailabilityAffectingField[] = [
  'month',
  'passengers',
  'durationDays',
  'campingType',
  'startDate',
  'endDate',
  'earliestAvailable',
]

export interface StateLifecycleInput {
  incomingState: ConversationState
  stateUpdate: ConversationStateUpdate
  message: string
  sessionMemory: SessionMemory
}

export interface StateLifecycleResult {
  state: ConversationState
  stateUpdate: ConversationStateUpdate
  sessionMemory: SessionMemory
  hasChecklistAnswer: boolean
  answeredCurrentField: boolean
  answeredNonTimingField: boolean
  isFaqInterruption: boolean
  confirmedPendingAvailability: boolean
  changedAvailabilityFields: AvailabilityAffectingField[]
  hasAvailabilityChange: boolean
}

export function isChecklistIntent(intent: ConversationState['intent']): boolean {
  return intent === 'recommendation' || intent === 'availability' || !intent
}

export function hasChecklistAnswerUpdate(update: ConversationStateUpdate): boolean {
  return !!(
    update.month ||
    update.startDate ||
    update.endDate ||
    update.durationDays ||
    update.passengers ||
    update.campingType ||
    update.capabilityPreferences?.length ||
    update.extraRequirementsAsked ||
    hasPreferenceContext(update) ||
    (update.skippedChecklist?.length ?? 0) > 0
  )
}

export function answersCurrentChecklistField(
  field: ConversationState['lastAskedField'],
  update: ConversationStateUpdate,
): boolean {
  switch (field) {
    case 'month':
      return !!(update.month || update.startDate || update.earliestAvailable)
    case 'durationDays':
      return !!update.durationDays
    case 'passengers':
      return !!update.passengers
    case 'campingType':
      return !!update.campingType || hasWildCampingCapability(update) || !!update.skippedChecklist?.includes('campingType')
    case 'extraRequirements':
      return !!(
        update.extraRequirementsAsked ||
        hasPreferenceContext(update) ||
        update.skippedChecklist?.includes('extraRequirements')
      )
    default:
      return false
  }
}

export function answersNonTimingChecklistField(
  field: ConversationState['lastAskedField'],
  update: ConversationStateUpdate,
): boolean {
  return (
    field === 'passengers' ||
    field === 'campingType' ||
    field === 'extraRequirements'
  ) && answersCurrentChecklistField(field, update)
}

export function hasSpecificUserUpdate(update: ConversationStateUpdate): boolean {
  return !!(
    update.month ||
    update.startDate ||
    update.endDate ||
    update.durationDays ||
    update.passengers ||
    update.campingType ||
    update.capabilityPreferences?.length ||
    update.extraRequirementsAsked ||
    hasPreferenceContext(update) ||
    update.refinementIntent ||
    update.availabilityQuestion ||
    update.skippedChecklist?.length ||
    update.intent === 'faq' ||
    update.intent === 'booking' ||
    update.intent === 'catalog'
  )
}

export function applyFlexibleCriteriaDefaults(state: ConversationState): void {
  const flexible = state.flexibleCriteria
  if (!flexible) return

  const months = uniqueStrings(flexible.months)
  if (!state.month && !state.startDate && months.length === 1) {
    state.month = months[0]
  }

  const duration = flexible.durationDays
  if (!state.durationDays && duration) {
    const alternatives = uniqueNumbers(duration.alternatives ?? [])
    state.durationDays = duration.preferred ?? (duration.min && duration.max ? Math.min(duration.max, Math.max(duration.min, duration.preferred ?? duration.min)) : undefined)
    if (!state.durationDays && alternatives.length === 1) state.durationDays = alternatives[0]
  }

  const passengers = flexible.passengers
  if (!state.passengers && passengers) {
    const alternatives = uniqueNumbers(passengers.alternatives ?? [])
    state.passengers = passengers.max ?? (alternatives.length > 0 ? Math.max(...alternatives) : passengers.min)
  }

  const campingTypes = (flexible.campingTypes ?? []).filter(value => value !== 'wild')
  if (!state.campingType && campingTypes.length === 1) {
    state.campingType = campingTypes[0]
  }
}

export function ensureConversationMemory(state: ConversationState) {
  state.conversationMemory = state.conversationMemory ?? {}
  return state.conversationMemory
}

export function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of [...items].reverse()) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    result.unshift(item)
  }
  return result
}

export function rememberAcceptedConstraint(state: ConversationState, constraint: ConstraintMemory) {
  const memory = ensureConversationMemory(state)
  memory.acceptedConstraints = dedupeBy(
    [...(memory.acceptedConstraints ?? []), constraint],
    item => item.field,
  ).slice(-12)
}

export function rememberAcceptedConstraintsFromUpdate(
  state: ConversationState,
  update: ConversationStateUpdate,
) {
  const fieldMap: Array<[ConstraintMemory['field'], keyof ConversationState]> = [
    ['month', 'month'],
    ['startDate', 'startDate'],
    ['endDate', 'endDate'],
    ['durationDays', 'durationDays'],
    ['passengers', 'passengers'],
    ['campingType', 'campingType'],
    ['extraRequirements', 'extraRequirements'],
    ['earliestAvailable', 'earliestAvailable'],
    ['softPreferences', 'softPreferences'],
  ]

  for (const [field, key] of fieldMap) {
    const value = update[key]
    if (value !== undefined && value !== null) {
      rememberAcceptedConstraint(state, { field, value: value as ConstraintMemory['value'] })
    }
  }
}

export function rememberUserConcern(
  state: ConversationState,
  message: string,
  update: ConversationStateUpdate,
) {
  const concernType = inferConcernType(update)
  if (!concernType) return
  ensureConversationMemory(state).lastUserConcern = {
    type: concernType,
    text: message,
  }
}

function matchesRemovedCapabilityAlias(value: unknown, removedCapabilityKeys: string[]): boolean {
  if (!removedCapabilityKeys.length || typeof value !== 'string') return false
  const resolution = resolveCapabilityAlias(value, 'hu')
  return resolution.status === 'matched' && removedCapabilityKeys.includes(resolution.capabilityKey)
}

function removeLegacyPreferenceMirrorsForRemovedCapabilities(
  state: ConversationState,
  removedCapabilityKeys: string[],
) {
  if (!removedCapabilityKeys.length) return

  if (state.extraRequirements?.length) {
    state.extraRequirements = state.extraRequirements.filter(
      requirement => !matchesRemovedCapabilityAlias(requirement, removedCapabilityKeys),
    )
    if (state.extraRequirements.length === 0) state.extraRequirements = undefined
  }

  const memory = state.conversationMemory
  if (!memory?.acceptedConstraints?.length) return

  memory.acceptedConstraints = memory.acceptedConstraints
    .map(constraint => {
      if (constraint.field !== 'extraRequirements') return constraint
      if (Array.isArray(constraint.value)) {
        const filtered = constraint.value.filter(
          value => !matchesRemovedCapabilityAlias(value, removedCapabilityKeys),
        )
        return filtered.length ? { ...constraint, value: filtered } : null
      }
      return matchesRemovedCapabilityAlias(constraint.value, removedCapabilityKeys)
        ? null
        : constraint
    })
    .filter((constraint): constraint is ConstraintMemory => constraint !== null)
}

export function applyStateLifecycleUpdate(input: StateLifecycleInput): StateLifecycleResult {
  const stateUpdate = input.stateUpdate
  if (!stateUpdate.refinementIntent && stateUpdate.refinementPreference) {
    stateUpdate.refinementIntent = refinementIntentFromLegacy(stateUpdate.refinementPreference, input.message)
    stateUpdate.refinementPreference = undefined
  }
  if (shouldKeepExtraRequirementsOpenAfterConstraintCorrection(input.incomingState, stateUpdate, input.message)) {
    stateUpdate.extraRequirementsAsked = undefined
  }

  const state = mergeState(input.incomingState, stateUpdate)
  removeLegacyPreferenceMirrorsForRemovedCapabilities(
    state,
    stateUpdate.removedCapabilityPreferenceKeys ?? [],
  )
  applyFlexibleCriteriaDefaults(state)
  rememberAcceptedConstraintsFromUpdate(state, stateUpdate)
  rememberUserConcern(state, input.message, stateUpdate)

  const hasChecklistAnswer = hasChecklistAnswerUpdate(stateUpdate)
  const answeredCurrentField = answersCurrentChecklistField(input.incomingState.lastAskedField, stateUpdate)
  const answeredNonTimingField = answersNonTimingChecklistField(input.incomingState.lastAskedField, stateUpdate)
  const isFaqInterruption = stateUpdate.intent === 'faq' &&
    isChecklistIntent(input.incomingState.intent) &&
    !!input.incomingState.lastAskedField &&
    !hasChecklistAnswer

  if (isFaqInterruption) {
    state.intent = input.incomingState.intent ?? 'recommendation'
    state.lastAskedField = input.incomingState.lastAskedField
  } else if (hasChecklistAnswer && !!input.incomingState.intent && isChecklistIntent(input.incomingState.intent)) {
    state.intent = input.incomingState.intent ?? 'recommendation'
  }

  const pendingConfirmation = input.incomingState.pendingAvailabilityConfirmation
  const confirmedPendingAvailability = !!pendingConfirmation &&
    !!stateUpdate.positiveAcknowledgement &&
    !answeredCurrentField

  if (pendingConfirmation && confirmedPendingAvailability) {
    const pending = pendingConfirmation
    state.month = undefined
    if (pending.startDate) {
      state.startDate = pending.startDate
    }
    if (pending.durationDays && pending.startDate && pending.endDate) {
      state.endDate = pending.endDate
      state.durationDays = pending.durationDays
    } else {
      state.endDate = undefined
    }
    if (pending.startDate) rememberAcceptedConstraint(state, { field: 'startDate', value: pending.startDate })
    if (pending.endDate) rememberAcceptedConstraint(state, { field: 'endDate', value: pending.endDate })
    if (pending.durationDays) rememberAcceptedConstraint(state, { field: 'durationDays', value: pending.durationDays })
    if (state.conversationMemory) {
      state.conversationMemory.pendingDecision = undefined
    }
    state.earliestAvailable = undefined
    state.pendingAvailabilityConfirmation = undefined
    state.pendingAvailabilityAction = undefined
  }

  if (pendingConfirmation && answeredCurrentField && !confirmedPendingAvailability) {
    state.pendingAvailabilityConfirmation = undefined
    state.pendingAvailabilityAction = undefined
    if (state.conversationMemory) {
      state.conversationMemory.pendingDecision = undefined
    }
  }

  const changedAvailabilityFields = AVAILABILITY_FIELDS.filter(field => {
    const updated = (stateUpdate as Record<string, unknown>)[field]
    const previous = (input.incomingState as Record<string, unknown>)[field]
    return updated !== undefined && updated !== null && updated !== previous
  })
  const hasAvailabilityChange = changedAvailabilityFields.length > 0
  let sessionMemory = input.sessionMemory

  if (hasAvailabilityChange) {
    if ((input.incomingState.alreadyRecommendedSlugs?.length ?? 0) > 0) {
      state.alreadyRecommendedSlugs = []
      state.lastShownPrice = undefined
      state.extrasOffered = undefined
    }
    state.lastShownCamperSlug = undefined
    state.selectedCamperSlug = undefined
    sessionMemory = markStaleAvailabilityResults(sessionMemory, state)
  }

  return {
    state,
    stateUpdate,
    sessionMemory,
    hasChecklistAnswer,
    answeredCurrentField,
    answeredNonTimingField,
    isFaqInterruption,
    confirmedPendingAvailability,
    changedAvailabilityFields,
    hasAvailabilityChange,
  }
}

function shouldKeepExtraRequirementsOpenAfterConstraintCorrection(
  incomingState: ConversationState,
  update: ConversationStateUpdate,
  message: string,
): boolean {
  if (incomingState.lastAskedField !== 'extraRequirements') return false
  if (!update.extraRequirementsAsked) return false
  const isConstraintCorrection = !!(
    update.removedCapabilityPreferenceKeys?.length ||
    update.campingType ||
    update.month ||
    update.startDate ||
    update.endDate ||
    update.durationDays ||
    update.passengers
  )
  if (!isConstraintCorrection) return false
  if (hasPreferenceContext(update) || update.extraRequirements?.length || update.softPreferences?.length) return false
  return !hasExplicitNoOtherRequirementsSignal(message)
}

function hasExplicitNoOtherRequirementsSignal(message: string): boolean {
  const normalized = message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return /^(nincs|semmi|nincsen|no|nothing|none|keine)[.!?]*$/.test(normalized) ||
    /\b(nincs\s+(mas|tobb)|semmi\s+(mas|egyeb)|mas\s+nem|ennyi|no\s+other|nothing\s+else|that's\s+all|thats\s+all)\b/.test(normalized)
}

function inferConcernType(update: Partial<ConversationState>): MemoryConcernType | null {
  const refinementConcern = inferRefinementConcernType(update)
  if (refinementConcern) return refinementConcern
  if (update.availabilityQuestion || update.earliestAvailable || update.month || update.startDate || update.endDate || update.durationDays) {
    return 'availability'
  }
  if (update.campingType) return 'camping_style'
  if (hasPreferenceContext(update)) return 'preference'
  return null
}

function uniqueNumbers(values: Array<number | undefined>): number[] {
  return [...new Set(values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0))]
}

function uniqueStrings(values?: string[]): string[] {
  return [...new Set((values ?? []).filter(Boolean))]
}
