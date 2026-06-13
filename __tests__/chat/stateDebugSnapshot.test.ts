import { describe, expect, it } from 'vitest'
import { buildConversationStateDebugSnapshot } from '@/lib/chat/stateDebugSnapshot'
import type { ConversationState, FlowState } from '@/lib/chat/state'

describe('ConversationState debug snapshot', () => {
  const state: ConversationState = {
    intent: 'recommendation',
    month: '2026-07',
    durationDays: 7,
    passengers: 2,
    campingType: 'camping_site',
    featurePreferences: [
      { key: 'cassette_wc', strength: 'hard', sourceText: 'kell WC' },
    ],
    attributePreferences: [
      { key: 'gearbox', value: 'Automata', strength: 'soft', sourceText: 'jó lenne automata' },
    ],
    capabilityPreferences: [
      { key: 'off_grid', strength: 'soft', sourceText: 'off-grid' },
    ],
    pricingPreference: {
      intent: 'cheaper',
      strength: 'soft',
      sourceText: 'olcsóbbat',
    },
    unmappedPreferences: [
      { sourceText: 'valami extra', reason: 'too_vague' },
    ],
    ambiguousPreferences: [
      { sourceText: 'klíma', reason: 'ambiguous_feature', candidates: ['cab_ac', 'living_ac'] },
    ],
    refinementIntent: {
      intent: 'cheaper',
      sourceText: 'van olcsóbb?',
    },
    extraRequirements: ['saját WC'],
    softPreferences: ['olcsóbb'],
    refinementPreference: 'cheaper',
    extraRequirementsAsked: true,
    skippedChecklist: ['extraRequirements'],
    lastAskedField: 'durationDays',
    pendingAvailabilityAction: 'find_earliest_availability',
    pendingAvailabilityConfirmation: {
      startDate: '2026-07-01',
      endDate: '2026-07-08',
      durationDays: 7,
      camperSlug: 'hobby-t75hf',
    },
    positiveAcknowledgement: true,
    referenceTarget: 'lastRecommendation',
    recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
    recommendationInteraction: {
      type: 'selected',
      targetReference: 'firstShownOption',
      sourceText: 'az első jó',
    },
    selectedCamperSlug: 'hobby-t75hf',
    lastShownCamperSlug: 'hobby-t75hf',
    lastShownPrice: 42000,
    alreadyRecommendedSlugs: ['hobby-t75hf'],
    conversationMemory: {
      notes: [{ type: 'preference', text: 'nem szeretne túl nagy autót' }],
      mentionedCampers: [{ slug: 'hobby-t75hf', name: 'Hobby T75HF' }],
    },
    lastAvailabilitySlots: [
      {
        startDate: '2026-07-01',
        endDate: '2026-07-08',
        durationDays: 7,
        camperSlug: 'hobby-t75hf',
        camperName: 'Hobby T75HF',
      },
    ],
  }

  const flowState: FlowState = {
    activeFlow: 'recommendation',
    activeStep: 'checklist',
    pendingQuestionField: 'durationDays',
    pendingQuestionText: 'Hány napra mennél?',
  }

  it('separates current trip criteria from canonical preferences', () => {
    const snapshot = buildConversationStateDebugSnapshot(state, flowState)

    expect(snapshot.currentTripCriteria).toEqual(expect.objectContaining({
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
      fieldsPresent: expect.arrayContaining(['month', 'durationDays', 'passengers', 'campingType']),
    }))
    expect(snapshot.canonicalPreferences.counts).toEqual({
      featurePreferences: 1,
      attributePreferences: 1,
      capabilityPreferences: 1,
      unmappedPreferences: 1,
      ambiguousPreferences: 1,
    })
    expect(snapshot.canonicalPreferences.refinementIntent).toEqual(expect.objectContaining({
      intent: 'cheaper',
    }))
  })

  it('keeps legacy compatibility fields out of canonical preference sections', () => {
    const snapshot = buildConversationStateDebugSnapshot(state, flowState)

    expect(snapshot.legacyCompatibility).toEqual(expect.objectContaining({
      extraRequirements: ['saját WC'],
      softPreferences: ['olcsóbb'],
      refinementPreference: 'cheaper',
      lastAskedField: 'durationDays',
      pendingAvailabilityActionPresent: true,
      pendingAvailabilityConfirmationPresent: true,
    }))
    expect(snapshot.warnings).toEqual(expect.arrayContaining([
      'legacy_extra_requirements_present',
      'legacy_soft_preferences_present',
      'legacy_refinement_preference_present',
      'canonical_and_legacy_preference_overlap',
    ]))
  })

  it('marks flow bridges and ephemeral signals without turning them into durable state', () => {
    const snapshot = buildConversationStateDebugSnapshot(state, flowState)

    expect(snapshot.flowCompatibility).toEqual(expect.objectContaining({
      stateLastAskedField: 'durationDays',
      flowPendingQuestionField: 'durationDays',
      flowActiveFlow: 'recommendation',
      flowActiveStep: 'checklist',
      pendingAvailabilityAction: 'find_earliest_availability',
    }))
    expect(snapshot.ephemeralSignals.fieldsPresent).toEqual(expect.arrayContaining([
      'positiveAcknowledgement',
      'referenceTarget',
      'recommendationReference',
      'recommendationInteraction',
      'refinementIntent',
    ]))
    expect(snapshot.warnings).toEqual(expect.arrayContaining([
      'last_asked_field_bridge_active',
      'pending_availability_bridge_active',
      'flow_state_overlap_detected',
    ]))
  })

  it('keeps conversationMemory and lastAvailabilitySlots out of engine input', () => {
    const snapshot = buildConversationStateDebugSnapshot(state, flowState)

    expect(snapshot.memoryBoundary).toEqual(expect.objectContaining({
      conversationMemoryPresent: true,
      conversationMemoryKeys: ['mentionedCampers', 'notes'],
      lastAvailabilitySlotsCount: 1,
      currentFocusFields: ['alreadyRecommendedSlugs', 'lastShownCamperSlug', 'lastShownPrice', 'selectedCamperSlug'],
    }))
    expect(snapshot.memoryBoundary.notSessionMemoryFields).toEqual(expect.arrayContaining([
      'conversationMemory.mentionedCampers',
      'conversationMemory.notes',
      'lastAvailabilitySlots',
      'lastShownCamperSlug',
    ]))
    expect(snapshot.engineInput.excludedLegacyFields).toEqual(expect.arrayContaining([
      'conversationMemory',
      'lastAvailabilitySlots',
      'refinementPreference',
    ]))
    expect(JSON.stringify(snapshot.engineInput)).not.toContain('mentionedCampers')
    expect(JSON.stringify(snapshot.engineInput)).not.toContain('lastAvailabilitySlotsCount')
  })

  it('returns a quiet snapshot for empty state', () => {
    const snapshot = buildConversationStateDebugSnapshot({})

    expect(snapshot.currentTripCriteria.fieldsPresent).toEqual([])
    expect(snapshot.canonicalPreferences.counts).toEqual({
      featurePreferences: 0,
      attributePreferences: 0,
      capabilityPreferences: 0,
      unmappedPreferences: 0,
      ambiguousPreferences: 0,
    })
    expect(snapshot.legacyCompatibility.fieldsPresent).toEqual([])
    expect(snapshot.memoryBoundary.notSessionMemoryFields).toEqual([])
    expect(snapshot.warnings).toEqual([])
  })
})
