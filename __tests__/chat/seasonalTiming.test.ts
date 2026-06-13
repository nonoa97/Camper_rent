import { describe, expect, it } from 'vitest'

import { isSeasonalTimingOnlyMessage, resolveSeasonalTiming } from '@/lib/chat/seasonalTiming'

describe('seasonalTiming', () => {
  it('resolves summer as a flexible month range instead of one canonical month', () => {
    const result = resolveSeasonalTiming('valamikor nyáron', new Date('2026-06-13T00:00:00.000Z'))

    expect(result?.months).toEqual(['2026-06', '2026-07', '2026-08'])
    expect(result?.seasonKeys).toEqual(['summer'])
    expect(result?.preferredStartWindows).toEqual([
      expect.objectContaining({
        startDate: '2026-06-01',
        endDate: '2026-08-31',
        precision: 'season',
      }),
    ])
  })

  it('resolves autumn as a flexible month range', () => {
    const result = resolveSeasonalTiming('ősszel mennénk', new Date('2026-06-13T00:00:00.000Z'))

    expect(result?.months).toEqual(['2026-09', '2026-10', '2026-11'])
    expect(result?.seasonKeys).toEqual(['autumn'])
  })

  it('combines summer and autumn as a broad flexible range', () => {
    const result = resolveSeasonalTiming('nyáron vagy ősszel valamikor', new Date('2026-06-13T00:00:00.000Z'))

    expect(result?.months).toEqual(['2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'])
  })

  it('detects pure seasonal timing without trip defaults', () => {
    expect(isSeasonalTimingOnlyMessage('valamikor nyáron')).toBe(true)
    expect(isSeasonalTimingOnlyMessage('nyáron 7 napra ketten')).toBe(false)
  })

  it('narrows season beginning, middle, and end to the matching season month', () => {
    const today = new Date('2026-01-10T00:00:00.000Z')

    expect(resolveSeasonalTiming('nyár elején', today)?.months).toEqual(['2026-06'])
    expect(resolveSeasonalTiming('nyár közepén', today)?.months).toEqual(['2026-07'])
    expect(resolveSeasonalTiming('nyár végén', today)?.months).toEqual(['2026-08'])
    expect(resolveSeasonalTiming('nyár végén', today)?.preferredStartWindows).toEqual([
      expect.objectContaining({
        startDate: '2026-08-01',
        endDate: '2026-08-31',
        precision: 'season_part',
        part: 'late',
      }),
    ])
  })

  it('resolves month vicinity to previous, current, and next month', () => {
    const result = resolveSeasonalTiming('szeptember környékén', new Date('2026-06-13T00:00:00.000Z'))

    expect(result?.months).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(result?.segment).toBe('around')
    expect(result?.monthNumber).toBe(9)
    expect(result?.preferredStartWindows).toEqual([
      expect.objectContaining({
        startDate: '2026-08-27',
        endDate: '2026-10-05',
        precision: 'around_month',
        toleranceDays: 5,
      }),
    ])
  })

  it('keeps month beginning, middle, and end as the named month', () => {
    const today = new Date('2026-06-13T00:00:00.000Z')

    expect(resolveSeasonalTiming('szeptember elején', today)?.months).toEqual(['2026-09'])
    expect(resolveSeasonalTiming('szeptember közepén', today)?.months).toEqual(['2026-09'])
    expect(resolveSeasonalTiming('szeptember végén', today)?.months).toEqual(['2026-09'])
    expect(resolveSeasonalTiming('szeptember végén', today)?.preferredStartWindows).toEqual([
      expect.objectContaining({
        startDate: '2026-09-21',
        endDate: '2026-09-30',
        precision: 'month_part',
        part: 'late',
      }),
    ])
  })
})
