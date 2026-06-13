import { describe, expect, it } from 'vitest'
import {
  sanitizeSessionMemory,
  SESSION_MEMORY_LIMITS,
  validateAndSanitizeSessionMemory,
} from '@/lib/chat/sessionMemoryValidation'

describe('sessionMemoryValidation', () => {
  it('treats missing or non-object memory as empty memory with a warning', () => {
    const result = validateAndSanitizeSessionMemory(null)

    expect(result.memory).toEqual({})
    expect(result.warnings).toEqual(['memory_not_object'])
  })

  it('keeps valid availability and recommendation memory fields while dropping deprecated compared mirror', () => {
    const result = validateAndSanitizeSessionMemory({
      schemaVersion: 1,
      lastAvailabilityResult: {
        camperSlug: 'van-a',
        camperName: 'Van A',
        from: '2026-07-01',
        to: '2026-07-06',
        days: 5,
        pricePerDay: 20000,
        source: 'availability_search',
        criteriaHash: 'abc',
      },
      lastRecommendationResult: {
        optionId: 'rec_1',
        camperSlug: 'van-a',
        camperName: 'Van A',
        score: 42,
        source: 'evaluation_engine',
        featureKeys: ['solar_panel'],
      },
      shownOptions: [{
        index: 1,
        optionId: 'rec_1',
        camperSlug: 'van-a',
        camperName: 'Van A',
        featureKeys: ['solar_panel'],
      }],
      memoryEvents: [{
        eventId: 'event_1',
        eventType: 'shown',
        timestamp: '2026-06-13T00:00:00.000Z',
        optionId: 'rec_1',
        camperSlug: 'van-a',
        metadata: {
          source: 'recommendation',
          ignored: { nested: true },
        },
      }],
      lastComparedCamper: 'van-a',
    })
    const memory = result.memory

    expect(memory.schemaVersion).toBe(1)
    expect(memory.lastAvailabilityResult?.camperSlug).toBe('van-a')
    expect(memory.lastRecommendationResult?.featureKeys).toEqual(['solar_panel'])
    expect(memory.shownOptions?.[0].optionId).toBe('rec_1')
    expect(memory.memoryEvents?.[0].metadata).toEqual({ source: 'recommendation' })
    expect(memory.lastComparedCamper).toBeUndefined()
    expect(result.warnings).toEqual(['last_compared_camper_deprecated'])
  })

  it('drops invalid nested memory entries and reports warnings', () => {
    const result = validateAndSanitizeSessionMemory({
      schemaVersion: 'latest',
      lastAvailabilityResult: { camperSlug: 'missing-fields' },
      previousAvailabilityResults: [{ camperSlug: 'bad' }],
      lastRecommendationResult: { camperSlug: 'bad' },
      shownOptions: [{ optionId: 'missing-index' }],
      memoryEvents: [{ eventType: 'shown', optionId: 'missing-id' }],
      lastComparedCamper: 42,
    })

    expect(result.memory).toEqual({})
    expect(result.warnings).toEqual(expect.arrayContaining([
      'schema_version_invalid',
      'availability_result_invalid',
      'availability_history_invalid',
      'recommendation_result_invalid',
      'shown_options_invalid',
      'memory_events_invalid',
      'last_compared_camper_invalid',
    ]))
  })

  it('limits client-carried arrays to the same memory contract sizes', () => {
    const shownOptions = Array.from({ length: SESSION_MEMORY_LIMITS.shownOptions + 2 }, (_, index) => ({
      index,
      optionId: `rec_${index}`,
      camperSlug: `van-${index}`,
      camperName: `Van ${index}`,
    }))
    const memoryEvents = Array.from({ length: SESSION_MEMORY_LIMITS.memoryEvents + 2 }, (_, index) => ({
      eventId: `event_${index}`,
      eventType: 'shown',
      timestamp: '2026-06-13T00:00:00.000Z',
      optionId: `rec_${index}`,
    }))

    const memory = sanitizeSessionMemory({ shownOptions, memoryEvents })

    expect(memory.shownOptions).toHaveLength(SESSION_MEMORY_LIMITS.shownOptions)
    expect(memory.shownOptions?.[0].optionId).toBe('rec_2')
    expect(memory.memoryEvents).toHaveLength(SESSION_MEMORY_LIMITS.memoryEvents)
    expect(memory.memoryEvents?.[0].eventId).toBe('event_2')
  })
})
