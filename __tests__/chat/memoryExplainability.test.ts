import { describe, expect, it } from 'vitest'
import { buildMemoryExplainabilitySnapshot } from '@/lib/chat/memoryExplainability'
import { auditSessionMemoryGovernance } from '@/lib/chat/sessionMemoryGovernance'
import type { ConversationState, SessionMemory } from '@/lib/chat/state'

const state: ConversationState = {
  month: '2026-07',
  durationDays: 7,
  passengers: 2,
  campingType: 'camping_site',
  lastShownCamperSlug: 'hobby-t75hf',
  lastShownPrice: 42000,
  alreadyRecommendedSlugs: ['hobby-t75hf'],
}

const memory: SessionMemory = {
  schemaVersion: 1,
  lastAvailabilityResult: {
    camperSlug: 'hobby-t75hf',
    camperName: 'Hobby T75HF',
    from: '2026-07-01',
    to: '2026-07-08',
    days: 7,
    source: 'availability_search',
    criteria: {
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
    },
    criteriaHash: 'availability-hash',
  },
  staleAvailabilityResults: [{
    camperSlug: 'old-van',
    camperName: 'Old Van',
    from: '2026-06-01',
    to: '2026-06-08',
    days: 7,
    source: 'availability_search',
    criteriaHash: 'old-hash',
  }],
  lastRecommendationResult: {
    optionId: 'rec_1_hobby',
    camperSlug: 'hobby-t75hf',
    camperName: 'Hobby T75HF',
    shownIndex: 1,
    criteria: {
      month: '2026-07',
      durationDays: 7,
      passengers: 2,
      campingType: 'camping_site',
    },
    criteriaHash: 'recommendation-hash',
    pricePerDay: 42000,
    totalPrice: 294000,
    score: 88,
    source: 'evaluation_engine',
    featureKeys: ['solar_panel', 'cassette_wc'],
    attributeFacts: { beds: 4, gearbox: 'Automata' },
    capabilityMatches: [{
      capabilityKey: 'off_grid',
      strength: 'soft',
      score: 0.8,
      matchedWeight: 8,
      totalWeight: 10,
      matchedFeatures: ['solar_panel'],
      missingFeatures: ['inverter'],
    }],
  },
  shownOptions: [
    {
      index: 1,
      optionId: 'rec_1_hobby',
      camperSlug: 'hobby-t75hf',
      camperName: 'Hobby T75HF',
      criteriaHash: 'recommendation-hash',
      pricePerDay: 42000,
      totalPrice: 294000,
      featureKeys: ['solar_panel', 'cassette_wc'],
      attributeFacts: { beds: 4, gearbox: 'Automata' },
      capabilityMatches: [{
        capabilityKey: 'off_grid',
        strength: 'soft',
        score: 0.8,
        matchedWeight: 8,
        totalWeight: 10,
        matchedFeatures: ['solar_panel'],
        missingFeatures: ['inverter'],
      }],
    },
  ],
  memoryEvents: [
    {
      eventId: 'event_shown',
      eventType: 'shown',
      timestamp: '2026-06-12T10:00:00.000Z',
      optionId: 'rec_1_hobby',
      camperSlug: 'hobby-t75hf',
      metadata: { shownIndex: 1 },
    },
    {
      eventId: 'event_selected',
      eventType: 'selected',
      timestamp: '2026-06-12T10:01:00.000Z',
      optionId: 'rec_1_hobby',
      camperSlug: 'hobby-t75hf',
    },
  ],
}

describe('memory explainability contract', () => {
  it('builds a backend-owned snapshot without making memory a decision source', () => {
    const snapshot = buildMemoryExplainabilitySnapshot(memory, state)

    expect(snapshot.schemaVersion).toBe(1)
    expect(snapshot.availabilityMemory.lastAvailabilityResult).toEqual(expect.objectContaining({
      camperSlug: 'hobby-t75hf',
      criteriaHash: 'availability-hash',
    }))
    expect(snapshot.availabilityMemory.previousAvailabilityCount).toBe(0)
    expect(snapshot.availabilityMemory.staleAvailabilityCount).toBe(1)
    expect(snapshot.availabilityMemory.compatibility).toEqual({
      status: 'compatible',
      reasons: [],
      safeForReference: true,
      safeForCurrentDecision: false,
    })

    expect(snapshot.recommendationMemory.lastRecommendationResult).toEqual(expect.objectContaining({
      optionId: 'rec_1_hobby',
      featureKeys: ['solar_panel', 'cassette_wc'],
      attributeKeys: ['beds', 'gearbox'],
      capabilityKeys: ['off_grid'],
    }))
    expect(snapshot.recommendationMemory.shownOptionsPreview).toHaveLength(1)
    expect(snapshot.recommendationMemory.compatibility?.safeForCurrentDecision).toBe(false)

    expect(snapshot.memoryEvents.countsByType).toEqual({
      shown: 1,
      referenced: 0,
      selected: 1,
      dismissed: 0,
      compared: 0,
    })
    expect(snapshot.memoryEvents.latestEvents[0]).toEqual(expect.objectContaining({
      eventId: 'event_shown',
      metadataKeys: ['shownIndex'],
    }))
    expect(snapshot.warnings).toContain('stale_availability_present')
    expect(snapshot.warnings).toContain('legacy_mirror_present')
  })

  it('marks needs_recheck compatibility without allowing current decisions from memory', () => {
    const snapshot = buildMemoryExplainabilitySnapshot(memory, {
      ...state,
      passengers: 5,
    })

    expect(snapshot.recommendationMemory.compatibility).toEqual(expect.objectContaining({
      status: 'needs_recheck',
      safeForReference: false,
      safeForCurrentDecision: false,
    }))
    expect(snapshot.warnings).toContain('recommendation_needs_recheck')
  })

  it('reports missing memory and missing schema version explicitly', () => {
    const snapshot = buildMemoryExplainabilitySnapshot(undefined, {})

    expect(snapshot.availabilityMemory.previousAvailabilityCount).toBe(0)
    expect(snapshot.recommendationMemory.shownOptionsCount).toBe(0)
    expect(snapshot.warnings).toContain('session_memory_missing')
    expect(snapshot.warnings).toContain('schema_version_missing')
  })
})

describe('session memory governance', () => {
  it('sanitizes invalid input and reports governance findings', () => {
    const report = auditSessionMemoryGovernance({
      memoryEvents: [{
        eventId: 'bad',
        eventType: 'selected',
        timestamp: '2026-06-12T10:00:00.000Z',
      }],
      lastComparedCamper: 'legacy-camper',
    }, state)

    expect(report.isValid).toBe(false)
    expect(report.sanitizedMemory.memoryEvents).toBeUndefined()
    expect(report.sanitizedMemory.lastComparedCamper).toBeUndefined()
    expect(report.validationWarnings).toContain('memory_events_invalid')
    expect(report.validationWarnings).toContain('last_compared_camper_deprecated')
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'invalid_session_memory_input', severity: 'warning' }),
        expect.objectContaining({
          code: 'invalid_session_memory_input',
          layer: 'SessionMemory',
          message: expect.stringContaining('last_compared_camper_deprecated'),
        }),
        expect.objectContaining({ code: 'legacy_mirror_present', layer: 'ConversationState' }),
      ]),
    )
  })

  it('accepts valid memory while still documenting non-fatal compatibility warnings', () => {
    const report = auditSessionMemoryGovernance(memory, state)

    expect(report.isValid).toBe(true)
    expect(report.validationWarnings).toEqual([])
    expect(report.sanitizedMemory.lastRecommendationResult?.camperSlug).toBe('hobby-t75hf')
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'stale_availability_present' }),
        expect.objectContaining({ code: 'legacy_mirror_present', severity: 'info' }),
      ]),
    )
  })
})
