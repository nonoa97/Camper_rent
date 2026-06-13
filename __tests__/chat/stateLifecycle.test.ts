import { describe, expect, it } from 'vitest'
import type { ConversationState, SessionMemory } from '@/lib/chat/state'
import {
  applyStateLifecycleUpdate,
  hasSpecificUserUpdate,
} from '@/lib/chat/stateLifecycle'

describe('stateLifecycle', () => {
  it('preserves checklist flow when a FAQ interruption does not answer the pending field', () => {
    const incomingState: ConversationState = {
      intent: 'recommendation',
      lastAskedField: 'durationDays',
    }

    const result = applyStateLifecycleUpdate({
      incomingState,
      stateUpdate: { intent: 'faq' },
      message: 'Milyen jogosítvány kell?',
      sessionMemory: {},
    })

    expect(result.isFaqInterruption).toBe(true)
    expect(result.state.intent).toBe('recommendation')
    expect(result.state.lastAskedField).toBe('durationDays')
  })

  it('keeps checklist intent when the current checklist field is answered', () => {
    const incomingState: ConversationState = {
      intent: 'availability',
      lastAskedField: 'passengers',
    }

    const result = applyStateLifecycleUpdate({
      incomingState,
      stateUpdate: { passengers: 4 },
      message: 'Négyen megyünk',
      sessionMemory: {},
    })

    expect(result.hasChecklistAnswer).toBe(true)
    expect(result.answeredCurrentField).toBe(true)
    expect(result.state.intent).toBe('availability')
  })

  it('applies pending availability confirmation and stores accepted constraints', () => {
    const incomingState: ConversationState = {
      pendingAvailabilityConfirmation: {
        startDate: '2026-08-10',
        endDate: '2026-08-15',
        durationDays: 6,
        camperSlug: 'hobby-t75hf',
      },
      earliestAvailable: true,
      conversationMemory: {
        pendingDecision: {
          type: 'availability_option',
          label: '2026-08-10',
        },
      },
    }

    const result = applyStateLifecycleUpdate({
      incomingState,
      stateUpdate: { positiveAcknowledgement: true },
      message: 'jó lesz',
      sessionMemory: {},
    })

    expect(result.confirmedPendingAvailability).toBe(true)
    expect(result.state.startDate).toBe('2026-08-10')
    expect(result.state.endDate).toBe('2026-08-15')
    expect(result.state.durationDays).toBe(6)
    expect(result.state.earliestAvailable).toBeUndefined()
    expect(result.state.pendingAvailabilityConfirmation).toBeUndefined()
    expect(result.state.pendingAvailabilityAction).toBeUndefined()
    expect(result.state.conversationMemory?.pendingDecision).toBeUndefined()
    expect(result.state.conversationMemory?.acceptedConstraints).toEqual(
      expect.arrayContaining([
        { field: 'startDate', value: '2026-08-10' },
        { field: 'endDate', value: '2026-08-15' },
        { field: 'durationDays', value: 6 },
      ]),
    )
  })

  it('clears pending availability confirmation when the user answers the pending field instead', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {
        lastAskedField: 'durationDays',
        pendingAvailabilityConfirmation: {
          startDate: '2026-08-10',
          durationDays: 5,
        },
        pendingAvailabilityAction: 'find_earliest_availability',
      },
      stateUpdate: { durationDays: 7 },
      message: 'inkább hét nap',
      sessionMemory: {},
    })

    expect(result.confirmedPendingAvailability).toBe(false)
    expect(result.answeredCurrentField).toBe(true)
    expect(result.state.pendingAvailabilityConfirmation).toBeUndefined()
    expect(result.state.pendingAvailabilityAction).toBeUndefined()
  })

  it('marks availability memory stale and clears current recommendation focus on availability changes', () => {
    const sessionMemory: SessionMemory = {
      lastAvailabilityResult: {
        camperSlug: 'old-camper',
        camperName: 'Old Camper',
        from: '2026-07-01',
        to: '2026-07-07',
        days: 7,
        source: 'availability_search',
        criteria: {
          month: '2026-07',
          durationDays: 7,
          passengers: 2,
        },
      },
    }

    const result = applyStateLifecycleUpdate({
      incomingState: {
        month: '2026-07',
        durationDays: 7,
        passengers: 2,
        alreadyRecommendedSlugs: ['old-camper'],
        lastShownCamperSlug: 'old-camper',
        selectedCamperSlug: 'old-camper',
        lastShownPrice: 35000,
        extrasOffered: true,
      },
      stateUpdate: { month: '2026-08' },
      message: 'inkább augusztusban',
      sessionMemory,
    })

    expect(result.changedAvailabilityFields).toEqual(['month'])
    expect(result.hasAvailabilityChange).toBe(true)
    expect(result.state.alreadyRecommendedSlugs).toEqual([])
    expect(result.state.lastShownCamperSlug).toBeUndefined()
    expect(result.state.selectedCamperSlug).toBeUndefined()
    expect(result.state.lastShownPrice).toBeUndefined()
    expect(result.state.extrasOffered).toBeUndefined()
    expect(result.sessionMemory.staleAvailabilityResults?.[0]?.camperSlug).toBe('old-camper')
  })

  it('applies flexible defaults before downstream flow decisions', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {},
      stateUpdate: {
        flexibleCriteria: {
          months: ['2026-09'],
          durationDays: { alternatives: [5] },
          passengers: { alternatives: [2, 4], max: 4 },
          campingTypes: ['camping_site'],
        },
      },
      message: 'szeptember, 5 nap, ketten vagy négyen',
      sessionMemory: {},
    })

    expect(result.state.month).toBe('2026-09')
    expect(result.state.durationDays).toBe(5)
    expect(result.state.passengers).toBe(4)
    expect(result.state.campingType).toBe('camping_site')
  })

  it('bridges legacy refinementPreference to canonical refinementIntent', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {},
      stateUpdate: { refinementPreference: 'cheaper' },
      message: 'van olcsóbb?',
      sessionMemory: {},
    })

    expect(result.stateUpdate.refinementIntent).toEqual({
      intent: 'cheaper',
      sourceText: 'van olcsóbb?',
    })
    expect(result.state.refinementIntent).toEqual({
      intent: 'cheaper',
      sourceText: 'van olcsóbb?',
    })
    expect(result.stateUpdate.refinementPreference).toBeUndefined()
    expect(result.state.refinementPreference).toBeUndefined()
  })

  it('treats canonical preferences as answers to the extraRequirements checklist field', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {
        intent: 'recommendation',
        lastAskedField: 'extraRequirements',
      },
      stateUpdate: {
        featurePreferences: [{ key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' }],
      },
      message: 'kell wc',
      sessionMemory: {},
    })

    expect(result.hasChecklistAnswer).toBe(true)
    expect(result.answeredCurrentField).toBe(true)
    expect(result.state.intent).toBe('recommendation')
    expect(result.state.featurePreferences).toEqual([
      { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' },
    ])
  })

  it('removes legacy preference mirrors when a canonical capability constraint is removed', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {
        extraRequirements: ['bringát is vinnénk'],
        capabilityPreferences: [
          { key: 'bike_transport', strength: 'hard', sourceText: 'bringát is vinnénk', detectedLocale: 'hu' },
        ],
        conversationMemory: {
          acceptedConstraints: [
            { field: 'extraRequirements', value: ['bringát is vinnénk'] },
            { field: 'month', value: '2026-07' },
          ],
        },
      },
      stateUpdate: {
        removedCapabilityPreferenceKeys: ['bike_transport'],
        refinementIntent: {
          intent: 'remove_constraint',
          sourceText: 'nem akarok bringát vinni',
        },
      },
      message: 'nem akarok bringát vinni',
      sessionMemory: {},
    })

    expect(result.state.capabilityPreferences).toEqual([])
    expect(result.state.extraRequirements).toBeUndefined()
    expect(result.state.conversationMemory?.acceptedConstraints).toEqual([
      { field: 'month', value: '2026-07' },
    ])
    expect('removedCapabilityPreferenceKeys' in result.state).toBe(false)
  })

  it('keeps extraRequirements open when a user only removes a prior wild camping constraint', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {
        intent: 'recommendation',
        lastAskedField: 'extraRequirements',
        capabilityPreferences: [
          { key: 'wild_camping', strength: 'hard', sourceText: 'vadkempingeznék', detectedLocale: 'hu' },
        ],
      },
      stateUpdate: {
        campingType: 'camping_site',
        removedCapabilityPreferenceKeys: ['wild_camping'],
        extraRequirementsAsked: true,
      },
      message: 'meggondoltam magam, nem muszáj vadkempingre alkalmas legyen',
      sessionMemory: {},
    })

    expect(result.state.campingType).toBe('camping_site')
    expect(result.state.capabilityPreferences).toEqual([])
    expect(result.state.extraRequirementsAsked).toBeUndefined()
    expect(result.answeredCurrentField).toBe(false)
    expect(result.state.conversationMemory?.acceptedConstraints).toEqual([
      { field: 'campingType', value: 'camping_site' },
    ])
    expect('removedCapabilityPreferenceKeys' in result.state).toBe(false)
  })

  it('allows closing extraRequirements when a constraint correction also says nothing else is needed', () => {
    const result = applyStateLifecycleUpdate({
      incomingState: {
        intent: 'recommendation',
        lastAskedField: 'extraRequirements',
        capabilityPreferences: [
          { key: 'wild_camping', strength: 'hard', sourceText: 'vadkempingeznék', detectedLocale: 'hu' },
        ],
      },
      stateUpdate: {
        campingType: 'camping_site',
        removedCapabilityPreferenceKeys: ['wild_camping'],
        extraRequirementsAsked: true,
      },
      message: 'nem muszáj vadkempingre alkalmas legyen, más nem',
      sessionMemory: {},
    })

    expect(result.state.capabilityPreferences).toEqual([])
    expect(result.state.extraRequirementsAsked).toBe(true)
    expect(result.answeredCurrentField).toBe(true)
  })

  it('detects specific user updates for earliest availability continuation guards', () => {
    expect(hasSpecificUserUpdate({ durationDays: 4 })).toBe(true)
    expect(hasSpecificUserUpdate({ intent: 'catalog' })).toBe(true)
    expect(hasSpecificUserUpdate({})).toBe(false)
  })
})
