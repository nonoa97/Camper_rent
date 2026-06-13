import { supabase } from '@/lib/supabase'
import { ConversationState } from './state'
import { positivePriceOrNull } from './priceUtils'

export interface CamperResult {
  slug: string
  name: string
  image_url: string
  price_per_day: number | null
  type: string | null
  beds: number | null
  availableSlots: { from: string; to: string; days: number }[]
}

const MIN_RENTAL_DAYS = 3

type AvailabilitySeason = {
  id: string
  fromMd: string
  toMd: string
  sortOrder: number
}

async function loadPricesForSeason(seasonId: string): Promise<Record<string, number>> {
  const { data } = await supabase.from('camper_prices').select('camper_id, price').eq('season_id', seasonId)
  const map: Record<string, number> = {}
  for (const row of (data ?? []) as any[]) map[row.camper_id] = row.price
  return map
}

function mdFromDate(date: string): string {
  return date.slice(5, 10)
}

function seasonContains(season: AvailabilitySeason, md: string): boolean {
  if (season.fromMd <= season.toMd) return md >= season.fromMd && md <= season.toMd
  return md >= season.fromMd || md <= season.toMd
}

function getPricingDateForAvailability(state: ConversationState): string {
  if (state.startDate) return state.startDate
  const preferredStartWindow = state.flexibleCriteria?.preferredStartWindows
    ?.filter(window => window.startDate <= window.endDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0]
  if (preferredStartWindow) return preferredStartWindow.startDate
  if (state.month) return `${state.month}-01`
  return new Date().toISOString().split('T')[0]
}

async function resolveAvailabilitySeasonId(state: ConversationState): Promise<string | undefined> {
  const { data } = await supabase
    .from('seasons')
    .select('id, from_md, to_md, sort_order')
    .order('sort_order')

  const seasons: AvailabilitySeason[] = ((data ?? []) as any[]).map(row => ({
    id: row.id,
    fromMd: row.from_md,
    toMd: row.to_md,
    sortOrder: row.sort_order ?? 0,
  }))
  const md = mdFromDate(getPricingDateForAvailability(state))
  return seasons
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find(season => seasonContains(season, md))
    ?.id
}

async function loadAvailabilityPrices(state: ConversationState): Promise<Record<string, number>> {
  const seasonId = await resolveAvailabilitySeasonId(state)
  if (!seasonId) return {}
  return loadPricesForSeason(seasonId)
}
type BookingRow = { start_date: string; end_date: string; status?: string | null }

function getPrimaryImage(row: any): string {
  const images = Array.isArray(row.camper_images)
    ? [...row.camper_images].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []
  return images.find((image: any) => typeof image.url === 'string' && image.url.length > 0)?.url
    ?? row.image_url
    ?? ''
}

export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

export function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

function lastDayOfMonth(year: number, monthOneBased: number): string {
  return new Date(Date.UTC(year, monthOneBased, 0)).toISOString().split('T')[0]
}

export function computeFreeSlots(
  bookings: BookingRow[],
  windowFrom: string,
  windowTo: string,
  minDays: number,
): { from: string; to: string; days: number }[] {
  const windowEndExclusive = addDays(windowTo, 1)
  const sorted = [...bookings]
    .filter(b => b.start_date < windowEndExclusive && b.end_date > windowFrom)
    .sort((a, b) => a.start_date.localeCompare(b.start_date))
  const slots: { from: string; to: string; days: number }[] = []
  let cursor = windowFrom

  for (const b of sorted) {
    const bookingStart = b.start_date < windowFrom ? windowFrom : b.start_date
    const bookingEnd = b.end_date > windowEndExclusive ? windowEndExclusive : b.end_date
    if (bookingEnd <= cursor) continue

    const gapEnd = bookingStart < cursor ? cursor : bookingStart
    const gap = daysBetween(cursor, gapEnd)
    if (gap >= minDays) {
      slots.push({ from: cursor, to: addDays(gapEnd, -1), days: gap })
    }
    if (bookingEnd > cursor) cursor = bookingEnd
  }

  const finalGap = daysBetween(cursor, windowEndExclusive)
  if (finalGap >= minDays) slots.push({ from: cursor, to: windowTo, days: finalGap })

  return slots
}

export function pickSlots(
  freeSlots: { from: string; to: string; days: number }[],
  durationDays?: number,
): { from: string; to: string; days: number }[] {
  const picked: { from: string; to: string; days: number }[] = []
  for (const slot of freeSlots) {
    if (picked.length >= 2) break
    const prev = picked[picked.length - 1]
    if (prev && prev.to >= slot.from) continue // overlap
    if (durationDays) {
      const slotTo = addDays(slot.from, durationDays - 1)
      if (slotTo <= slot.to) picked.push({ from: slot.from, to: slotTo, days: durationDays })
    } else {
      picked.push(slot)
    }
  }
  return picked
}

function getPreferredStartWindows(
  state: ConversationState,
): NonNullable<NonNullable<ConversationState['flexibleCriteria']>['preferredStartWindows']> {
  return state.flexibleCriteria?.preferredStartWindows?.filter(window => window.startDate <= window.endDate) ?? []
}

export function getPreferredStartSearchWindow(
  state: ConversationState,
  minDays = state.durationDays ?? MIN_RENTAL_DAYS,
): { from?: string; to?: string } {
  const windows = getPreferredStartWindows(state)
  if (!windows.length) return {}
  const from = windows.map(window => window.startDate).sort()[0]
  const latestStart = windows.map(window => window.endDate).sort().at(-1)!
  return {
    from,
    to: addDays(latestStart, Math.max(minDays, MIN_RENTAL_DAYS) - 1),
  }
}

export function pickSlotsForPreferredStartWindows(
  freeSlots: { from: string; to: string; days: number }[],
  windows: NonNullable<ConversationState['flexibleCriteria']>['preferredStartWindows'],
  durationDays?: number,
): { from: string; to: string; days: number }[] {
  const validWindows = (windows ?? []).filter(window => window.startDate <= window.endDate)
  if (!validWindows.length) return pickSlots(freeSlots, durationDays)

  const picked: { from: string; to: string; days: number }[] = []
  for (const slot of freeSlots) {
    if (picked.length >= 2) break
    for (const window of validWindows) {
      const start = slot.from > window.startDate ? slot.from : window.startDate
      if (start > window.endDate) continue
      if (durationDays) {
        const to = addDays(start, durationDays - 1)
        if (to <= slot.to) {
          picked.push({ from: start, to, days: durationDays })
          break
        }
      } else {
        const days = daysBetween(start, addDays(slot.to, 1))
        if (days >= MIN_RENTAL_DAYS) {
          picked.push({ from: start, to: slot.to, days })
          break
        }
      }
    }
  }
  return picked
}

function traceAvailability(
  label: string,
  payload: {
    searchStart: string
    searchEnd: string
    camper?: { slug: string; name: string }
    bookings?: BookingRow[]
    freeSlots?: { from: string; to: string; days: number }[]
    pickedSlots?: { from: string; to: string; days: number }[]
  },
) {
  if (process.env.CHAT_AVAILABILITY_DEBUG !== 'true') return
  console.log(`[availability:${label}]`, JSON.stringify(payload, null, 2))
}

export async function searchAvailableCampers(state: ConversationState): Promise<CamperResult[]> {
  const today = new Date().toISOString().split('T')[0]

  // Determine search window
  let windowFrom: string
  let windowTo: string
  const exactRange = !!(state.startDate && state.endDate)

  if (exactRange) {
    windowFrom = state.startDate!
    windowTo = state.endDate!
  } else if (getPreferredStartSearchWindow(state).from && getPreferredStartSearchWindow(state).to) {
    const preferredWindow = getPreferredStartSearchWindow(state)
    windowFrom = preferredWindow.from!
    windowTo = preferredWindow.to!
  } else if (state.month) {
    const [y, m] = state.month.split('-').map(Number)
    windowFrom = `${state.month}-01`
    windowTo = lastDayOfMonth(y, m)
  } else {
    windowFrom = today
    const now = new Date()
    windowTo = lastDayOfMonth(now.getUTCFullYear(), now.getUTCMonth() + 3)
  }

  // Fetch campers
  const [{ data: rows, error }, seasonPrices] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        type, beds,
        camper_images(url, sort_order)
      `)
      .eq('available', true)
      .order('name'),
    loadAvailabilityPrices(state),
  ])

  if (error || !rows) return []

  const campers = (rows as any[])
    .map(r => ({
      slug: r.slug,
      name: r.name,
      image_url: getPrimaryImage(r),
      price_per_day: positivePriceOrNull(seasonPrices[r.id]),
      type: r.type ?? null,
      beds: (r.beds ?? null) as number | null,
    }))

  // Filter by passengers
  const filtered = campers.filter(c => {
    if (state.passengers && (c.beds ?? 0) > 0 && (c.beds ?? 0) < state.passengers) return false
    return true
  })

  if (filtered.length === 0) return []

  // Fetch bookings for all filtered campers in the window
  const slugs = filtered.map(c => c.slug)
  const searchEndExclusive = addDays(windowTo, 1)
  traceAvailability('search-window', { searchStart: windowFrom, searchEnd: searchEndExclusive })

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('start_date, end_date, status, campers!inner(slug)')
    .eq('status', 'confirmed')
    .lt('start_date', searchEndExclusive)
    .gt('end_date', windowFrom)

  const bookingsByCamper: Record<string, BookingRow[]> = {}
  for (const slug of slugs) bookingsByCamper[slug] = []

  for (const b of (bookingRows ?? [])) {
    const slug = (b as any).campers?.slug as string | undefined
    if (slug && bookingsByCamper[slug]) {
      bookingsByCamper[slug].push({ start_date: b.start_date, end_date: b.end_date, status: (b as any).status })
    }
  }

  const results: CamperResult[] = []
  const minDays = state.durationDays ?? MIN_RENTAL_DAYS

  for (const c of filtered) {
    const camperBookings = bookingsByCamper[c.slug] ?? []

    if (exactRange) {
      const exactSearchEndExclusive = addDays(state.endDate!, 1)
      const isAvailable = !camperBookings.some(
        b => b.start_date < exactSearchEndExclusive && b.end_date > state.startDate!,
      )
      if (isAvailable) {
        results.push({
          slug: c.slug,
          name: c.name,
          image_url: c.image_url,
          price_per_day: c.price_per_day,
          type: c.type,
          beds: c.beds,
          availableSlots: [{
            from: state.startDate!,
            to: state.endDate!,
            days: state.durationDays ?? daysBetween(state.startDate!, exactSearchEndExclusive),
          }],
        })
      }
    } else {
      const freeSlots = computeFreeSlots(camperBookings, windowFrom, windowTo, minDays)
      const picked = pickSlotsForPreferredStartWindows(
        freeSlots,
        state.flexibleCriteria?.preferredStartWindows,
        state.durationDays,
      )
      traceAvailability('camper-slots', {
        searchStart: windowFrom,
        searchEnd: searchEndExclusive,
        camper: { slug: c.slug, name: c.name },
        bookings: camperBookings,
        freeSlots,
        pickedSlots: picked,
      })
      if (picked.length > 0) {
        results.push({
          slug: c.slug,
          name: c.name,
          image_url: c.image_url,
          price_per_day: c.price_per_day,
          type: c.type,
          beds: c.beds,
          availableSlots: picked,
        })
      }
    }
  }

  return results
}

/**
 * Returns all free slots for a single specific camper.
 * Used for follow-up availability questions like "ez mikor elérhető?".
 * If no month/dates in state, searches the next N months.
 */
export async function getSpecificCamperAvailability(
  slug: string,
  state: ConversationState,
  monthsAhead = 6,
): Promise<CamperResult[]> {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]

  let windowFrom: string
  let windowTo: string

  if (state.startDate && state.endDate) {
    windowFrom = state.startDate
    windowTo = state.endDate
  } else if (state.month) {
    const [y, m] = state.month.split('-').map(Number)
    windowFrom = `${state.month}-01`
    windowTo = lastDayOfMonth(y, m)
  } else {
    windowFrom = todayStr
    windowTo = lastDayOfMonth(today.getUTCFullYear(), today.getUTCMonth() + monthsAhead)
  }

  const [{ data: row, error }, seasonPrices] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        type, beds,
        camper_images(url, sort_order)
      `)
      .eq('slug', slug)
      .eq('available', true)
      .single(),
    loadAvailabilityPrices(state),
  ])

  if (error || !row) return []

  const r = row as any
  const camper = {
    slug: r.slug as string,
    name: r.name as string,
    image_url: getPrimaryImage(r),
    price_per_day: positivePriceOrNull(seasonPrices[r.id]),
    type: (r.type ?? null) as string | null,
    beds: (r.beds ?? null) as number | null,
  }

  const searchEndExclusive = addDays(windowTo, 1)
  traceAvailability('specific-search-window', { searchStart: windowFrom, searchEnd: searchEndExclusive, camper: { slug, name: slug } })

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('start_date, end_date, status, campers!inner(slug)')
    .eq('status', 'confirmed')
    .lt('start_date', searchEndExclusive)
    .gt('end_date', windowFrom)

  const camperBookings: BookingRow[] = []
  for (const b of (bookingRows ?? [])) {
    const bSlug = (b as any).campers?.slug as string | undefined
    if (bSlug === slug) {
      camperBookings.push({ start_date: b.start_date, end_date: b.end_date, status: (b as any).status })
    }
  }

  const minDays = state.durationDays ?? MIN_RENTAL_DAYS
  const freeSlots = computeFreeSlots(camperBookings, windowFrom, windowTo, minDays)

  if (freeSlots.length === 0) return []

  const slots = state.durationDays
    ? freeSlots
        .filter(s => s.days >= state.durationDays!)
        .map(s => ({
          from: s.from,
          to: addDays(s.from, state.durationDays! - 1),
          days: state.durationDays!,
        }))
    : freeSlots

  traceAvailability('specific-camper-slots', {
    searchStart: windowFrom,
    searchEnd: searchEndExclusive,
    camper: { slug: camper.slug, name: camper.name },
    bookings: camperBookings,
    freeSlots,
    pickedSlots: slots,
  })

  if (slots.length === 0) return []

  return [{
    slug: camper.slug,
    name: camper.name,
    image_url: camper.image_url,
    price_per_day: camper.price_per_day,
    type: camper.type,
    beds: camper.beds,
    availableSlots: slots,
  }]
}

/**
 * Searches the next N months to find the earliest available slot for each camper.
 * Used when the user has no specific time constraint or asked for "leghamarabb".
 */
export async function findEarliestAvailableCamper(
  state: ConversationState,
  monthsAhead = 6,
): Promise<CamperResult[]> {
  const today = new Date()
  const windowFrom = today.toISOString().split('T')[0]
  const windowTo = lastDayOfMonth(today.getUTCFullYear(), today.getUTCMonth() + monthsAhead)

  const [{ data: rows, error }, seasonPrices] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        type, beds,
        camper_images(url, sort_order)
      `)
      .eq('available', true)
      .order('name'),
    loadAvailabilityPrices(state),
  ])

  if (error || !rows) return []

  const campers = (rows as any[])
    .map(r => ({
      slug: r.slug as string,
      name: r.name as string,
      image_url: getPrimaryImage(r),
      price_per_day: positivePriceOrNull(seasonPrices[r.id]),
      type: (r.type ?? null) as string | null,
      beds: (r.beds ?? null) as number | null,
    }))

  const filtered = campers.filter(c => {
    if (state.passengers && (c.beds ?? 0) > 0 && (c.beds ?? 0) < state.passengers) return false
    return true
  })

  if (filtered.length === 0) return []

  const searchEndExclusive = addDays(windowTo, 1)
  traceAvailability('earliest-search-window', { searchStart: windowFrom, searchEnd: searchEndExclusive })

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('start_date, end_date, status, campers!inner(slug)')
    .eq('status', 'confirmed')
    .lt('start_date', searchEndExclusive)
    .gt('end_date', windowFrom)

  const bookingsByCamper: Record<string, BookingRow[]> = {}
  for (const c of filtered) bookingsByCamper[c.slug] = []
  for (const b of (bookingRows ?? [])) {
    const slug = (b as any).campers?.slug as string | undefined
    if (slug && bookingsByCamper[slug]) {
      bookingsByCamper[slug].push({ start_date: b.start_date, end_date: b.end_date, status: (b as any).status })
    }
  }

  const minDays = state.durationDays ?? MIN_RENTAL_DAYS
  const results: CamperResult[] = []

  for (const c of filtered) {
    const freeSlots = computeFreeSlots(bookingsByCamper[c.slug] ?? [], windowFrom, windowTo, minDays)
    if (freeSlots.length === 0) continue

    // Take only the earliest slot
    const earliest = freeSlots[0]
    const slot = state.durationDays
      ? { from: earliest.from, to: addDays(earliest.from, state.durationDays - 1), days: state.durationDays }
      : { from: earliest.from, to: earliest.to, days: earliest.days }

    traceAvailability('earliest-camper-slots', {
      searchStart: windowFrom,
      searchEnd: searchEndExclusive,
      camper: { slug: c.slug, name: c.name },
      bookings: bookingsByCamper[c.slug] ?? [],
      freeSlots,
      pickedSlots: [slot],
    })

    results.push({
      slug: c.slug,
      name: c.name,
      image_url: c.image_url,
      price_per_day: c.price_per_day,
      type: c.type,
      beds: c.beds,
      availableSlots: [slot],
    })
  }

  // Sort by earliest slot date
  results.sort((a, b) => a.availableSlots[0].from.localeCompare(b.availableSlots[0].from))

  return results
}
