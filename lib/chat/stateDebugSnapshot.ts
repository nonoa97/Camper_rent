import type {
  ConversationState,
  FlowState,
  PendingAvailabilityAction,
  RecommendationInteractionSignal,
  RecommendationReferenceHint,
  ReferenceTarget,
} from './state'

export type StateDebugWarning =
  | 'legacy_extra_requirements_present'
  | 'legacy_soft_preferences_present'
  | 'legacy_refinement_preference_present'
  | 'last_asked_field_bridge_active'
  | 'pending_availability_bridge_active'
  | 'conversation_memory_prompt_context_present'
  | 'last_availability_slots_legacy_mirror_present'
  | 'canonical_and_legacy_preference_overlap'
  | 'flow_state_overlap_detected'

export interface CurrentTripCriteriaSummary {
  month?: string
  startDate?: string
  endDate?: string
  durationDays?: number
  passengers?: number
  campingType?: ConversationState['campingType']
  earliestAvailable?: boolean
  flexibleCriteriaPresent: boolean
  fieldsPresent: string[]
}

export interface CanonicalPreferenceSummary {
  featurePreferences: NonNullable<ConversationState['featurePreferences']>
  attributePreferences: NonNullable<ConversationState['attributePreferences']>
  capabilityPreferences: NonNullable<ConversationState['capabilityPreferences']>
  pricingPreference?: ConversationState['pricingPreference']
  unmappedPreferences: NonNullable<ConversationState['unmappedPreferences']>
  ambiguousPreferences: NonNullable<ConversationState['ambiguousPreferences']>
  refinementIntent?: ConversationState['refinementIntent']
  counts: {
    featurePreferences: number
    attributePreferences: number
    capabilityPreferences: number
    unmappedPreferences: number
    ambiguousPreferences: number
  }
}

export interface LegacyCompatibilitySummary {
  extraRequirements: string[]
  softPreferences: string[]
  refinementPreference?: ConversationState['refinementPreference']
  extraRequirementsAsked?: boolean
  skippedChecklist: NonNullable<ConversationState['skippedChecklist']>
  lastAskedField?: ConversationState['lastAskedField']
  pendingAvailabilityActionPresent: boolean
  pendingAvailabilityConfirmationPresent: boolean
  fieldsPresent: string[]
}

export interface CurrentFocusSummary {
  selectedCamperSlug?: string
  lastShownCamperSlug?: string
  lastShownPrice?: number
  alreadyRecommendedSlugs: string[]
  notes: string[]
}

export interface FlowCompatibilitySummary {
  stateLastAskedField?: ConversationState['lastAskedField']
  flowPendingQuestionField?: FlowState['pendingQuestionField']
  flowActiveFlow?: FlowState['activeFlow']
  flowActiveStep?: FlowState['activeStep']
  extraRequirementsAsked?: boolean
  skippedChecklist: NonNullable<ConversationState['skippedChecklist']>
  pendingAvailabilityAction?: PendingAvailabilityAction
  pendingAvailabilityConfirmationPresent: boolean
}

export interface EphemeralSignalSummary {
  positiveAcknowledgement?: boolean
  availabilityQuestion?: ConversationState['availabilityQuestion']
  referenceTarget?: ReferenceTarget
  recommendationReference?: RecommendationReferenceHint
  recommendationInteraction?: RecommendationInteractionSignal
  refinementIntent?: ConversationState['refinementIntent']
  fieldsPresent: string[]
}

export interface MemoryBoundarySummary {
  conversationMemoryPresent: boolean
  conversationMemoryKeys: string[]
  lastAvailabilitySlotsCount: number
  currentFocusFields: string[]
  notSessionMemoryFields: string[]
  notes: string[]
}

export interface EngineInputSummary {
  tripCriteriaFields: string[]
  canonicalPreferenceCounts: CanonicalPreferenceSummary['counts']
  pricingPreference?: ConversationState['pricingPreference']
  currentExclusionSlugs: string[]
  refinementIntent?: ConversationState['refinementIntent']
  excludedLegacyFields: string[]
}

export interface ConversationStateDebugSnapshot {
  currentTripCriteria: CurrentTripCriteriaSummary
  canonicalPreferences: CanonicalPreferenceSummary
  legacyCompatibility: LegacyCompatibilitySummary
  currentFocus: CurrentFocusSummary
  flowCompatibility: FlowCompatibilitySummary
  ephemeralSignals: EphemeralSignalSummary
  memoryBoundary: MemoryBoundarySummary
  engineInput: EngineInputSummary
  warnings: StateDebugWarning[]
}

function presentEntries(source: Record<string, unknown>): string[] {
  return Object.entries(source)
    .filter(([, value]) => {
      if (Array.isArray(value)) return value.length > 0
      return value !== undefined && value !== null && value !== false
    })
    .map(([key]) => key)
    .sort()
}

function buildCurrentTripCriteria(state: ConversationState): CurrentTripCriteriaSummary {
  const criteria = {
    month: state.month,
    startDate: state.startDate,
    endDate: state.endDate,
    durationDays: state.durationDays,
    passengers: state.passengers,
    campingType: state.campingType,
    earliestAvailable: state.earliestAvailable,
    flexibleCriteria: state.flexibleCriteria,
  }

  return {
    month: state.month,
    startDate: state.startDate,
    endDate: state.endDate,
    durationDays: state.durationDays,
    passengers: state.passengers,
    campingType: state.campingType,
    earliestAvailable: state.earliestAvailable,
    flexibleCriteriaPresent: !!state.flexibleCriteria,
    fieldsPresent: presentEntries(criteria),
  }
}

function buildCanonicalPreferences(state: ConversationState): CanonicalPreferenceSummary {
  const featurePreferences = state.featurePreferences ?? []
  const attributePreferences = state.attributePreferences ?? []
  const capabilityPreferences = state.capabilityPreferences ?? []
  const unmappedPreferences = state.unmappedPreferences ?? []
  const ambiguousPreferences = state.ambiguousPreferences ?? []

  return {
    featurePreferences,
    attributePreferences,
    capabilityPreferences,
    pricingPreference: state.pricingPreference,
    unmappedPreferences,
    ambiguousPreferences,
    refinementIntent: state.refinementIntent,
    counts: {
      featurePreferences: featurePreferences.length,
      attributePreferences: attributePreferences.length,
      capabilityPreferences: capabilityPreferences.length,
      unmappedPreferences: unmappedPreferences.length,
      ambiguousPreferences: ambiguousPreferences.length,
    },
  }
}

function buildLegacyCompatibility(state: ConversationState): LegacyCompatibilitySummary {
  const legacy = {
    extraRequirements: state.extraRequirements,
    softPreferences: state.softPreferences,
    refinementPreference: state.refinementPreference,
    extraRequirementsAsked: state.extraRequirementsAsked,
    skippedChecklist: state.skippedChecklist,
    lastAskedField: state.lastAskedField,
    pendingAvailabilityAction: state.pendingAvailabilityAction,
    pendingAvailabilityConfirmation: state.pendingAvailabilityConfirmation,
  }

  return {
    extraRequirements: state.extraRequirements ?? [],
    softPreferences: state.softPreferences ?? [],
    refinementPreference: state.refinementPreference,
    extraRequirementsAsked: state.extraRequirementsAsked,
    skippedChecklist: state.skippedChecklist ?? [],
    lastAskedField: state.lastAskedField,
    pendingAvailabilityActionPresent: !!state.pendingAvailabilityAction,
    pendingAvailabilityConfirmationPresent: !!state.pendingAvailabilityConfirmation,
    fieldsPresent: presentEntries(legacy),
  }
}

function buildCurrentFocus(state: ConversationState): CurrentFocusSummary {
  return {
    selectedCamperSlug: state.selectedCamperSlug,
    lastShownCamperSlug: state.lastShownCamperSlug,
    lastShownPrice: state.lastShownPrice,
    alreadyRecommendedSlugs: state.alreadyRecommendedSlugs ?? [],
    notes: [
      'Current focus fields help short follow-up interpretation.',
      'They are not stable history and not recommendation truth source.',
    ],
  }
}

function buildFlowCompatibility(state: ConversationState, flowState?: FlowState): FlowCompatibilitySummary {
  return {
    stateLastAskedField: state.lastAskedField,
    flowPendingQuestionField: flowState?.pendingQuestionField,
    flowActiveFlow: flowState?.activeFlow,
    flowActiveStep: flowState?.activeStep,
    extraRequirementsAsked: state.extraRequirementsAsked,
    skippedChecklist: state.skippedChecklist ?? [],
    pendingAvailabilityAction: state.pendingAvailabilityAction,
    pendingAvailabilityConfirmationPresent: !!state.pendingAvailabilityConfirmation,
  }
}

function buildEphemeralSignals(state: ConversationState): EphemeralSignalSummary {
  const signals = {
    positiveAcknowledgement: state.positiveAcknowledgement,
    availabilityQuestion: state.availabilityQuestion,
    referenceTarget: state.referenceTarget,
    recommendationReference: state.recommendationReference,
    recommendationInteraction: state.recommendationInteraction,
    refinementIntent: state.refinementIntent,
  }

  return {
    positiveAcknowledgement: state.positiveAcknowledgement,
    availabilityQuestion: state.availabilityQuestion,
    referenceTarget: state.referenceTarget,
    recommendationReference: state.recommendationReference,
    recommendationInteraction: state.recommendationInteraction,
    refinementIntent: state.refinementIntent,
    fieldsPresent: presentEntries(signals),
  }
}

function buildMemoryBoundary(state: ConversationState): MemoryBoundarySummary {
  const currentFocusFields = presentEntries({
    selectedCamperSlug: state.selectedCamperSlug,
    lastShownCamperSlug: state.lastShownCamperSlug,
    lastShownPrice: state.lastShownPrice,
    alreadyRecommendedSlugs: state.alreadyRecommendedSlugs,
  })
  const conversationMemoryKeys = Object.keys(state.conversationMemory ?? {}).sort()
  const notSessionMemoryFields = [
    ...conversationMemoryKeys.map(key => `conversationMemory.${key}`),
    ...(state.lastAvailabilitySlots?.length ? ['lastAvailabilitySlots'] : []),
    ...currentFocusFields,
  ].sort()

  return {
    conversationMemoryPresent: !!state.conversationMemory,
    conversationMemoryKeys,
    lastAvailabilitySlotsCount: state.lastAvailabilitySlots?.length ?? 0,
    currentFocusFields,
    notSessionMemoryFields,
    notes: [
      'conversationMemory is prompt context, not SessionMemory.',
      'lastAvailabilitySlots is a legacy mirror, not canonical availability memory.',
      'current focus fields are not stable recommendation history.',
    ],
  }
}

function buildEngineInput(
  currentTripCriteria: CurrentTripCriteriaSummary,
  canonicalPreferences: CanonicalPreferenceSummary,
  state: ConversationState,
): EngineInputSummary {
  return {
    tripCriteriaFields: currentTripCriteria.fieldsPresent,
    canonicalPreferenceCounts: canonicalPreferences.counts,
    pricingPreference: state.pricingPreference,
    currentExclusionSlugs: state.alreadyRecommendedSlugs ?? [],
    refinementIntent: state.refinementIntent,
    excludedLegacyFields: [
      'extraRequirements',
      'softPreferences',
      'refinementPreference',
      'conversationMemory',
      'lastAvailabilitySlots',
      'lastAskedField',
      'pendingAvailabilityAction',
      'pendingAvailabilityConfirmation',
    ],
  }
}

function hasCanonicalPreferences(canonical: CanonicalPreferenceSummary): boolean {
  return canonical.counts.featurePreferences > 0 ||
    canonical.counts.attributePreferences > 0 ||
    canonical.counts.capabilityPreferences > 0 ||
    canonical.counts.unmappedPreferences > 0 ||
    canonical.counts.ambiguousPreferences > 0 ||
    !!canonical.pricingPreference
}

function buildWarnings(
  state: ConversationState,
  flowState: FlowState | undefined,
  canonical: CanonicalPreferenceSummary,
): StateDebugWarning[] {
  const warnings: StateDebugWarning[] = []

  if (state.extraRequirements?.length) warnings.push('legacy_extra_requirements_present')
  if (state.softPreferences?.length) warnings.push('legacy_soft_preferences_present')
  if (state.refinementPreference) warnings.push('legacy_refinement_preference_present')
  if (state.lastAskedField) warnings.push('last_asked_field_bridge_active')
  if (state.pendingAvailabilityAction || state.pendingAvailabilityConfirmation) {
    warnings.push('pending_availability_bridge_active')
  }
  if (state.conversationMemory) warnings.push('conversation_memory_prompt_context_present')
  if (state.lastAvailabilitySlots?.length) warnings.push('last_availability_slots_legacy_mirror_present')
  if (
    hasCanonicalPreferences(canonical) &&
    (!!state.extraRequirements?.length || !!state.softPreferences?.length || !!state.refinementPreference)
  ) {
    warnings.push('canonical_and_legacy_preference_overlap')
  }
  if (flowState?.pendingQuestionField || flowState?.activeFlow || flowState?.activeStep) {
    warnings.push('flow_state_overlap_detected')
  }

  return [...new Set(warnings)]
}

export function buildConversationStateDebugSnapshot(
  state: ConversationState,
  flowState?: FlowState,
): ConversationStateDebugSnapshot {
  const currentTripCriteria = buildCurrentTripCriteria(state)
  const canonicalPreferences = buildCanonicalPreferences(state)

  return {
    currentTripCriteria,
    canonicalPreferences,
    legacyCompatibility: buildLegacyCompatibility(state),
    currentFocus: buildCurrentFocus(state),
    flowCompatibility: buildFlowCompatibility(state, flowState),
    ephemeralSignals: buildEphemeralSignals(state),
    memoryBoundary: buildMemoryBoundary(state),
    engineInput: buildEngineInput(currentTripCriteria, canonicalPreferences, state),
    warnings: buildWarnings(state, flowState, canonicalPreferences),
  }
}
