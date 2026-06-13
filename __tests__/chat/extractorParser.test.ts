import { describe, expect, it } from 'vitest'

import { parseExtractorStateUpdate } from '@/lib/chat/extractorParser'
import { resolveSeasonalTiming } from '@/lib/chat/seasonalTiming'
import type { ConversationState } from '@/lib/chat/state'

const normalizeForMatch = (message: string) =>
  message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()

describe('parseExtractorStateUpdate', () => {
  it('parses scalar trip fields and canonical refinement intent', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        intent: 'recommendation',
        month: '2026-07',
        durationDays: 7,
        passengers: 4,
        refinementIntent: {
          intent: 'cheaper',
          targetReference: 'lastRecommendation',
          sourceText: 'van olcsóbb?',
          strength: 'soft',
        },
      }),
      message: 'júliusban 4 főre 7 napra, van olcsóbb?',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.intent).toBe('recommendation')
    expect(update.month).toBe('2026-07')
    expect(update.durationDays).toBe(7)
    expect(update.passengers).toBe(4)
    expect(update.refinementIntent).toEqual({
      intent: 'cheaper',
      targetReference: 'lastRecommendation',
      sourceText: 'van olcsóbb?',
      strength: 'soft',
    })
    expect(update.refinementPreference).toBeUndefined()
  })

  it('bridges legacy refinementPreference to canonical refinementIntent without writing the legacy mirror', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        refinementPreference: 'cheaper',
      }),
      message: 'van olcsóbb?',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.refinementIntent).toEqual({
      intent: 'cheaper',
      sourceText: 'van olcsóbb?',
    })
    expect(update.refinementPreference).toBeUndefined()
  })

  it('keeps wild camping out of campingType and maps it to capability preference', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        campingType: 'wild',
      }),
      message: 'vadkempingeznénk',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.campingType).toBeUndefined()
    expect(update.capabilityPreferences).toEqual([
      {
        key: 'wild_camping',
        strength: 'hard',
        sourceText: 'vadkempingeznénk',
        detectedLocale: 'hu',
      },
    ])
    expect(update.skippedChecklist).toContain('campingType')
  })

  it('marks wild camping capability for removal when the user backs away to camping sites', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        campingType: 'camping_site',
      }),
      message: 'meggondoltam magam, nem muszáj vadkempingre alkalmas legyen',
      currentState: {
        capabilityPreferences: [
          { key: 'wild_camping', strength: 'hard', sourceText: 'vadkempingeznék' },
        ],
      } as ConversationState,
      normalizeForMatch,
    })

    expect(update.campingType).toBe('camping_site')
    expect(update.removedCapabilityPreferenceKeys).toEqual(['wild_camping'])
    expect(update.capabilityPreferences).toBeUndefined()
  })

  it('bridges legacy raw pricing preference into canonical pricingPreference', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        softPreferences: ['olcsóbb opció jó lenne'],
      }),
      message: 'olcsóbb opció jó lenne',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.pricingPreference).toEqual({
      intent: 'cheaper',
      strength: 'soft',
      sourceText: 'olcsóbb opció jó lenne',
    })
    expect(update.softPreferences).toBeUndefined()
  })

  it('corrects season-only extractor output to flexible months without invented trip defaults', () => {
    const expectedMonths = resolveSeasonalTiming('nyáron vagy ősszel valamikor')?.months
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        intent: 'recommendation',
        month: '2026-07',
        durationDays: 7,
        passengers: 2,
        campingType: 'camping_site',
        extraRequirementsAsked: true,
        flexibleCriteria: {
          months: ['2026-07'],
        },
      }),
      message: 'nyáron vagy ősszel valamikor',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.intent).toBe('recommendation')
    expect(update.month).toBeUndefined()
    expect(update.flexibleCriteria?.months).toEqual(expectedMonths)
    expect(update.flexibleCriteria?.preferredStartWindows).toEqual([
      expect.objectContaining({ precision: 'season' }),
      expect.objectContaining({ precision: 'season' }),
    ])
    expect(update.durationDays).toBeUndefined()
    expect(update.passengers).toBeUndefined()
    expect(update.campingType).toBeUndefined()
    expect(update.extraRequirementsAsked).toBeUndefined()
  })

  it('keeps explicit non-season trip values while normalizing seasonal timing', () => {
    const expectedMonths = resolveSeasonalTiming('nyáron 7 napra ketten')?.months
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        intent: 'recommendation',
        durationDays: 7,
        passengers: 2,
        flexibleCriteria: {
          months: ['2026-07'],
        },
      }),
      message: 'nyáron 7 napra ketten',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.flexibleCriteria?.months).toEqual(expectedMonths)
    expect(update.durationDays).toBe(7)
    expect(update.passengers).toBe(2)
  })

  it('drops extractor-invented flexible months when the message has no concrete timing signal', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        flexibleCriteria: {
          months: ['2026-06', '2026-07', '2026-08'],
          preferredStartWindows: [
            {
              startDate: '2026-06-01',
              endDate: '2026-08-31',
              precision: 'season',
            },
          ],
        },
      }),
      message: 'Szia, valamikor szeretnénk elutazni',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.intent).toBe('recommendation')
    expect(update.flexibleCriteria).toBeUndefined()
  })

  it('keeps explicit flexible month alternatives when the user names months', () => {
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        flexibleCriteria: {
          months: ['2026-07', '2026-08'],
        },
      }),
      message: 'július vagy augusztus jó lenne',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.flexibleCriteria?.months).toEqual(['2026-07', '2026-08'])
  })

  it('corrects month-around wording to flexible adjacent months instead of one exact month', () => {
    const expectedMonths = resolveSeasonalTiming('szeptember környékén')?.months
    const update = parseExtractorStateUpdate({
      raw: JSON.stringify({
        intent: 'recommendation',
        month: '2026-09',
      }),
      message: 'szeptember környékén',
      currentState: {} as ConversationState,
      normalizeForMatch,
    })

    expect(update.intent).toBe('recommendation')
    expect(update.month).toBeUndefined()
    expect(update.flexibleCriteria?.months).toEqual(expectedMonths)
    expect(update.flexibleCriteria?.preferredStartWindows).toEqual([
      expect.objectContaining({
        startDate: '2026-08-27',
        endDate: '2026-10-05',
        precision: 'around_month',
      }),
    ])
  })

  it('throws on malformed JSON so the extractor fallback can handle it', () => {
    expect(() =>
      parseExtractorStateUpdate({
        raw: '{not-json',
        message: 'bármi',
        currentState: {} as ConversationState,
        normalizeForMatch,
      }),
    ).toThrow()
  })
})
