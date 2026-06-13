import { describe, expect, it } from 'vitest'
import { mergeState, type ConversationState } from '@/lib/chat/state'

describe('mergeState', () => {
  it('keeps unchanged durable fields while resetting ephemeral turn signals', () => {
    const current: ConversationState = {
      month: '2026-07',
      durationDays: 7,
      passengers: 4,
      positiveAcknowledgement: true,
      availabilityQuestion: 'longest_duration',
      referenceTarget: 'lastRecommendation',
      recommendationReference: { kind: 'feature', featureKey: 'solar_panel' },
      recommendationInteraction: {
        type: 'selected',
        targetReference: 'firstShownOption',
        sourceText: 'az első jó lesz',
      },
      refinementPreference: 'cheaper',
      refinementIntent: {
        intent: 'cheaper',
        sourceText: 'van olcsóbb?',
      },
    }

    const merged = mergeState(current, { passengers: 2 })

    expect(merged.month).toBe('2026-07')
    expect(merged.durationDays).toBe(7)
    expect(merged.passengers).toBe(2)
    expect(merged.positiveAcknowledgement).toBeUndefined()
    expect(merged.availabilityQuestion).toBeUndefined()
    expect(merged.referenceTarget).toBeUndefined()
    expect(merged.recommendationReference).toBeUndefined()
    expect(merged.recommendationInteraction).toBeUndefined()
    expect(merged.refinementPreference).toBeUndefined()
    expect(merged.refinementIntent).toBeUndefined()
  })

  it('preserves explicitly updated ephemeral fields for the current turn', () => {
    const merged = mergeState(
      {
        month: '2026-07',
        refinementIntent: {
          intent: 'different',
          sourceText: 'mutass mást',
        },
      },
      {
        referenceTarget: 'lastRecommendation',
        refinementIntent: {
          intent: 'cheaper',
          targetReference: 'lastRecommendation',
          sourceText: 'abból olcsóbbat',
          strength: 'soft',
        },
      },
    )

    expect(merged.referenceTarget).toBe('lastRecommendation')
    expect(merged.refinementIntent).toEqual({
      intent: 'cheaper',
      targetReference: 'lastRecommendation',
      sourceText: 'abból olcsóbbat',
      strength: 'soft',
    })
  })

  it('merges and dedupes legacy arrays and checklist skips', () => {
    const merged = mergeState(
      {
        extraRequirements: ['wc', 'zuhany'],
        softPreferences: ['napelem'],
        skippedChecklist: ['campingType'],
        alreadyRecommendedSlugs: ['camper-a'],
      },
      {
        extraRequirements: ['wc', 'biciklitartó'],
        softPreferences: ['napelem', 'automata'],
        skippedChecklist: ['campingType', 'extraRequirements'],
        alreadyRecommendedSlugs: ['camper-a', 'camper-b'],
      },
    )

    expect(merged.extraRequirements).toEqual(['wc', 'zuhany', 'biciklitartó'])
    expect(merged.softPreferences).toEqual(['napelem', 'automata'])
    expect(merged.skippedChecklist).toEqual(['campingType', 'extraRequirements'])
    expect(merged.alreadyRecommendedSlugs).toEqual(['camper-a', 'camper-b'])
  })

  it('dedupes canonical preferences by their contract keys', () => {
    const merged = mergeState(
      {
        featurePreferences: [
          { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' },
        ],
        attributePreferences: [
          { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'soft', sourceText: 'jó lenne automata' },
        ],
        capabilityPreferences: [
          { key: 'off_grid', strength: 'soft', sourceText: 'off-grid jó lenne' },
        ],
      },
      {
        featurePreferences: [
          { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' },
          { key: 'solar_panel', strength: 'soft', sourceText: 'jó lenne napelem' },
        ],
        attributePreferences: [
          { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'soft', sourceText: 'jó lenne automata' },
        ],
        capabilityPreferences: [
          { key: 'off_grid', strength: 'soft', sourceText: 'off-grid jó lenne' },
          { key: 'remote_work', strength: 'soft', sourceText: 'dolgoznánk belőle' },
        ],
      },
    )

    expect(merged.featurePreferences).toEqual([
      { key: 'cassette_wc', strength: 'hard', sourceText: 'kell wc' },
      { key: 'solar_panel', strength: 'soft', sourceText: 'jó lenne napelem' },
    ])
    expect(merged.attributePreferences).toEqual([
      { key: 'gearbox', value: 'Automata', operator: 'eq', strength: 'soft', sourceText: 'jó lenne automata' },
    ])
    expect(merged.capabilityPreferences).toEqual([
      { key: 'off_grid', strength: 'soft', sourceText: 'off-grid jó lenne' },
      { key: 'remote_work', strength: 'soft', sourceText: 'dolgoznánk belőle' },
    ])
  })

  it('removes canonical capability preferences through explicit state delta', () => {
    const merged = mergeState(
      {
        capabilityPreferences: [
          { key: 'wild_camping', strength: 'hard', sourceText: 'vadkemping' },
          { key: 'bike_transport', strength: 'hard', sourceText: 'vinnénk bringákat' },
        ],
      },
      {
        removedCapabilityPreferenceKeys: ['bike_transport'],
      },
    )

    expect(merged.capabilityPreferences).toEqual([
      { key: 'wild_camping', strength: 'hard', sourceText: 'vadkemping' },
    ])
    expect('removedCapabilityPreferenceKeys' in merged).toBe(false)
  })

  it('replaces pricingPreference and merges flexibleCriteria with limits', () => {
    const merged = mergeState(
      {
        pricingPreference: {
          intent: 'premium_ok',
          strength: 'soft',
          sourceText: 'lehet prémium',
        },
        flexibleCriteria: {
          months: ['2026-07'],
          durationDays: { alternatives: [5, 6] },
        },
      },
      {
        pricingPreference: {
          intent: 'cheaper',
          strength: 'soft',
          sourceText: 'inkább olcsóbb',
        },
        flexibleCriteria: {
          months: ['2026-08', '2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'],
          durationDays: { min: 4, alternatives: [4, 5, 6, 7, 8, 9, 10] },
          passengers: { alternatives: [2, 2, 3, 4, 5, 6, 7] },
          campingTypes: ['camping_site', 'wild', 'camping_site'],
        },
      },
    )

    expect(merged.pricingPreference).toEqual({
      intent: 'cheaper',
      strength: 'soft',
      sourceText: 'inkább olcsóbb',
    })
    expect(merged.flexibleCriteria?.months).toEqual(['2026-08', '2026-09', '2026-10', '2026-11', '2026-12', '2027-01'])
    expect(merged.flexibleCriteria?.durationDays).toEqual({ alternatives: [4, 5, 6, 7, 8, 9], min: 4 })
    expect(merged.flexibleCriteria?.passengers?.alternatives).toEqual([2, 3, 4, 5, 6, 7])
    expect(merged.flexibleCriteria?.campingTypes).toEqual(['camping_site', 'wild'])
  })

  it('merges conversationMemory with dedupe and limits', () => {
    const currentNotes = Array.from({ length: 19 }, (_, index) => ({
      type: 'fact' as const,
      text: `note-${index}`,
    }))
    const updateNotes = [
      { type: 'fact' as const, text: 'note-0' },
      { type: 'preference' as const, text: 'new-note' },
    ]

    const merged = mergeState(
      {
        conversationMemory: {
          notes: currentNotes,
          mentionedCampers: [
            { slug: 'camper-a', name: 'A' },
            { slug: 'camper-b', name: 'B' },
          ],
          acceptedConstraints: [
            { field: 'softPreferences', value: ['napelem'] },
          ],
        },
      },
      {
        conversationMemory: {
          notes: updateNotes,
          mentionedCampers: [
            { slug: 'camper-b', name: 'B updated' },
            { slug: 'camper-c', name: 'C' },
          ],
          acceptedConstraints: [
            { field: 'softPreferences', value: ['automata'] },
          ],
          pendingDecision: {
            type: 'checklist_question',
            field: 'extraRequirements',
          },
        },
      },
    )

    expect(merged.conversationMemory?.notes).toHaveLength(20)
    expect(merged.conversationMemory?.notes?.at(-1)).toEqual({ type: 'preference', text: 'new-note' })
    expect(merged.conversationMemory?.mentionedCampers).toEqual([
      { slug: 'camper-a', name: 'A' },
      { slug: 'camper-b', name: 'B updated' },
      { slug: 'camper-c', name: 'C' },
    ])
    expect(merged.conversationMemory?.acceptedConstraints).toEqual([
      { field: 'softPreferences', value: ['automata'] },
    ])
    expect(merged.conversationMemory?.pendingDecision).toEqual({
      type: 'checklist_question',
      field: 'extraRequirements',
    })
  })
})
