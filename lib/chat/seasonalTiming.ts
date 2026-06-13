export type SeasonKey = 'spring' | 'summer' | 'autumn' | 'winter'
type PeriodSegment = 'early' | 'middle' | 'late' | 'around'

const SEASON_MONTHS: Record<SeasonKey, number[]> = {
  spring: [3, 4, 5],
  summer: [6, 7, 8],
  autumn: [9, 10, 11],
  winter: [12, 1, 2],
}

export interface SeasonalTimingResult {
  months: string[]
  seasonKeys: SeasonKey[]
  segment?: PeriodSegment
  monthNumber?: number
  preferredStartWindows: PreferredStartWindowResolution[]
}

export interface PreferredStartWindowResolution {
  startDate: string
  endDate: string
  precision:
    | 'month'
    | 'month_part'
    | 'around_month'
    | 'around_date'
    | 'season'
    | 'season_part'
    | 'around_season'
  sourceText?: string
  label?: string
  part?: 'early' | 'middle' | 'late'
  toleranceDays?: number
}

const MONTH_ALIASES: Array<{ pattern: RegExp; month: number }> = [
  { pattern: /\b(januar|január|january|jan)\b/, month: 1 },
  { pattern: /\b(februar|február|february|feb)\b/, month: 2 },
  { pattern: /\b(marcius|március|march|mar)\b/, month: 3 },
  { pattern: /\b(aprilis|április|april|apr)\b/, month: 4 },
  { pattern: /\b(majus|május|may)\b/, month: 5 },
  { pattern: /\b(junius|június|june|jun)\b/, month: 6 },
  { pattern: /\b(julius|július|july|jul)\b/, month: 7 },
  { pattern: /\b(augusztus|august|aug)\b/, month: 8 },
  { pattern: /\b(szeptember|september|sep)\b/, month: 9 },
  { pattern: /\b(oktober|október|october|oct|okt)\b/, month: 10 },
  { pattern: /\b(november|nov)\b/, month: 11 },
  { pattern: /\b(december|dec)\b/, month: 12 },
]

function normalizeForSeasonMatch(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function formatMonth(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

function formatDate(year: number, month: number, day: number): string {
  return `${formatMonth(year, month)}-${String(day).padStart(2, '0')}`
}

function lastDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function shiftDate(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta
  const normalizedMonth = ((zeroBased % 12) + 12) % 12
  return {
    year: Math.floor(zeroBased / 12),
    month: normalizedMonth + 1,
  }
}

function seasonYearForMonth(currentYear: number, currentMonth: number, month: number): number {
  return month >= currentMonth ? currentYear : currentYear + 1
}

function buildSeasonMonths(season: SeasonKey, today = new Date()): string[] {
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1

  if (season === 'winter') {
    const winterStartYear = currentMonth <= 2
      ? currentYear - 1
      : currentMonth <= 12
        ? currentYear
        : currentYear + 1
    return SEASON_MONTHS.winter
      .map(month => formatMonth(month === 12 ? winterStartYear : winterStartYear + 1, month))
      .filter(month => {
        const [, rawMonth] = month.split('-')
        const monthNumber = Number(rawMonth)
        const yearNumber = Number(month.slice(0, 4))
        return yearNumber > currentYear || monthNumber >= currentMonth
      })
  }

  return SEASON_MONTHS[season]
    .filter(month => month >= currentMonth || seasonYearForMonth(currentYear, currentMonth, month) > currentYear)
    .map(month => formatMonth(seasonYearForMonth(currentYear, currentMonth, month), month))
}

function detectSegment(normalized: string): PeriodSegment | undefined {
  if (/\b(eleje|elejen|elején|early|beginning|start)\b/.test(normalized)) return 'early'
  if (/\b(kozepe|közepe|kozepen|közepén|middle|mid)\b/.test(normalized)) return 'middle'
  if (/\b(vege|vége|vegen|végén|late|end)\b/.test(normalized)) return 'late'
  if (/\b(kornyeke|környéke|kornyeken|környékén|around|near|about)\b/.test(normalized)) return 'around'
  return undefined
}

function detectMonth(normalized: string): number | undefined {
  return MONTH_ALIASES.find(item => item.pattern.test(normalized))?.month
}

export function hasExplicitFlexibleTimingSignal(message: string): boolean {
  const normalized = normalizeForSeasonMatch(message)
  return !!detectMonth(normalized) ||
    /\b(tavasz|tavasszal|spring|nyar|nyaron|summer|osz|osszel|autumn|fall|tel|telen|winter)\b/.test(normalized) ||
    /\b(ebben|erre)\s+a?\s*honap\b/.test(normalized) ||
    /\bjovo\s+honap\b/.test(normalized) ||
    /\b(leghamarabb|minel\s*elobb|mindegy\s*mikor|amikor\s*(lehet|van)|asap|earliest|legkorabb)\b/.test(normalized) ||
    /\b\d{4}[-./]\d{2}[-./]\d{2}\b/.test(normalized)
}

function buildExplicitMonthMonths(month: number, segment: PeriodSegment | undefined, today = new Date()): string[] {
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const year = seasonYearForMonth(currentYear, currentMonth, month)

  if (segment === 'around') {
    return [-1, 0, 1]
      .map(delta => addMonths(year, month, delta))
      .map(value => formatMonth(value.year, value.month))
  }

  return [formatMonth(year, month)]
}

function monthWindow(month: number, segment: PeriodSegment | undefined, today = new Date()): PreferredStartWindowResolution {
  const currentYear = today.getFullYear()
  const currentMonth = today.getMonth() + 1
  const year = seasonYearForMonth(currentYear, currentMonth, month)
  const lastDay = lastDayOfMonth(year, month)
  const sourceText = undefined

  if (segment === 'early') {
    return {
      startDate: formatDate(year, month, 1),
      endDate: formatDate(year, month, Math.min(10, lastDay)),
      precision: 'month_part',
      part: 'early',
      sourceText,
    }
  }
  if (segment === 'middle') {
    return {
      startDate: formatDate(year, month, Math.min(11, lastDay)),
      endDate: formatDate(year, month, Math.min(20, lastDay)),
      precision: 'month_part',
      part: 'middle',
      sourceText,
    }
  }
  if (segment === 'late') {
    return {
      startDate: formatDate(year, month, Math.min(21, lastDay)),
      endDate: formatDate(year, month, lastDay),
      precision: 'month_part',
      part: 'late',
      sourceText,
    }
  }
  if (segment === 'around') {
    return {
      startDate: shiftDate(formatDate(year, month, 1), -5),
      endDate: shiftDate(formatDate(year, month, lastDay), 5),
      precision: 'around_month',
      toleranceDays: 5,
      sourceText,
    }
  }
  return {
    startDate: formatDate(year, month, 1),
    endDate: formatDate(year, month, lastDay),
    precision: 'month',
    sourceText,
  }
}

function seasonWindow(season: SeasonKey, segment: PeriodSegment | undefined, today = new Date()): PreferredStartWindowResolution | null {
  const monthStrings = buildSeasonMonths(season, today)
  if (!monthStrings.length) return null
  const monthNumbers = segment && segment !== 'around'
    ? applySeasonSegment(SEASON_MONTHS[season], segment)
    : SEASON_MONTHS[season]
  const windows = monthStrings
    .filter(month => monthNumbers.includes(Number(month.slice(5, 7))))
    .map(month => {
      const year = Number(month.slice(0, 4))
      const monthNumber = Number(month.slice(5, 7))
      return monthWindow(monthNumber, undefined, new Date(`${year}-${String(monthNumber).padStart(2, '0')}-01T00:00:00.000Z`))
    })
  if (!windows.length) return null
  const startDate = windows.map(window => window.startDate).sort()[0]
  const endDate = windows.map(window => window.endDate).sort().at(-1)!
  if (segment === 'around') {
    return {
      startDate: shiftDate(startDate, -14),
      endDate: shiftDate(endDate, 14),
      precision: 'around_season',
      toleranceDays: 14,
    }
  }
  return {
    startDate,
    endDate,
    precision: segment ? 'season_part' : 'season',
    part: segment,
  }
}

function applySeasonSegment(months: number[], segment: PeriodSegment | undefined): number[] {
  if (!segment || segment === 'around') return months
  if (segment === 'early') return months.slice(0, 1)
  if (segment === 'middle') return months.slice(1, 2)
  return months.slice(-1)
}

export function resolveSeasonalTiming(message: string, today = new Date()): SeasonalTimingResult | null {
  const normalized = normalizeForSeasonMatch(message)
  const segment = detectSegment(normalized)
  const monthNumber = detectMonth(normalized)
  if (monthNumber) {
    const window = monthWindow(monthNumber, segment, today)
    return {
      months: buildExplicitMonthMonths(monthNumber, segment, today).slice(0, 6),
      seasonKeys: [],
      segment,
      monthNumber,
      preferredStartWindows: [{ ...window, sourceText: message.trim() }],
    }
  }

  const seasonKeys: SeasonKey[] = []

  if (/\b(tavasz|tavasszal|spring)\b/.test(normalized)) seasonKeys.push('spring')
  if (/\b(nyar|nyaron|summer)\b/.test(normalized)) seasonKeys.push('summer')
  if (/\b(osz|osszel|autumn|fall)\b/.test(normalized)) seasonKeys.push('autumn')
  if (/\b(tel|telen|winter)\b/.test(normalized)) seasonKeys.push('winter')

  if (!seasonKeys.length) return null

  const months = [
    ...new Set(seasonKeys.flatMap(season => {
      const seasonMonthNumbers = applySeasonSegment(SEASON_MONTHS[season], segment)
      const resolvedMonths = buildSeasonMonths(season, today)
      if (!segment || segment === 'around') return resolvedMonths
      return resolvedMonths.filter(month => {
        const monthNumber = Number(month.slice(5, 7))
        return seasonMonthNumbers.includes(monthNumber)
      })
    })),
  ].sort()
  const preferredStartWindows = seasonKeys
    .map(season => seasonWindow(season, segment, today))
    .filter((window): window is PreferredStartWindowResolution => !!window)
    .map(window => ({ ...window, sourceText: message.trim() }))

  return {
    months: months.slice(0, 6),
    seasonKeys,
    segment,
    preferredStartWindows: preferredStartWindows.slice(0, 6),
  }
}

export function isSeasonalTimingOnlyMessage(message: string): boolean {
  const normalized = normalizeForSeasonMatch(message)
  if (!resolveSeasonalTiming(message)) return false

  const hasExplicitDuration = /\b(\d+|egy|ket|kett[oő]|harom|három|negy|négy|ot|öt|hat|het|hét|nyolc|kilenc|tiz|tíz)\s*(nap|napra|het|hét|week|days?)\b/.test(normalized)
    || /\b\d+\s*[-–]\s*\d+\s*(nap|days?)\b/.test(normalized)
  const hasExplicitPassengers = /\b(\d+|egyedul|egyedül|ketten|harman|hárman|negyen|négyen|oten|öten|hatan)\s*(fo|fovel|fő|fővel|ember|szemely|személy|people|persons?)?\b/.test(normalized)
  const hasExplicitCamping = /\b(vadkemp|kempinghely|kempingben|camping_site|campsite|wild camping)\b/.test(normalized)
  const hasExtraRequirementSignal = /\b(wc|zuhany|napelem|automata|klima|klíma|bicikli|bringa|kutya|kisallat|kisállat)\b/.test(normalized)

  return !hasExplicitDuration && !hasExplicitPassengers && !hasExplicitCamping && !hasExtraRequirementSignal
}
