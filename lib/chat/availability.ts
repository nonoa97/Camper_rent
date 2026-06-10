import { supabase } from '@/lib/supabase'
import { ConversationState } from './state'

export interface CamperResult {
  slug: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  capacity: string | null
  wildCampingSuitable: boolean | null
  availableSlots: { from: string; to: string; days: number }[]
}

const MIN_RENTAL_DAYS = 3

async function loadPeakPrices(): Promise<Record<string, number>> {
  const { data } = await supabase.from('camper_prices').select('camper_id, price').eq('season_id', 'peak')
  const map: Record<string, number> = {}
  for (const row of (data ?? []) as any[]) map[row.camper_id] = row.price
  return map
}
type BookingRow = { start_date: string; end_date: string; status?: string | null }

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
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

function parseMaxPassengers(label: string | null): number {
  if (!label) return 0
  const nums = label.match(/\d+/g)
  return nums ? Math.max(...nums.map(Number)) : 0
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
  const [{ data: rows, error }, peakPrices] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        camper_types!type_id(name),
        capacities!capacity_id(label),
        wild_camping_suitable
      `)
      .eq('available', true)
      .order('name'),
    loadPeakPrices(),
  ])

  if (error || !rows) return []

  const campers = (rows as any[])
    .map(r => ({
      slug: r.slug,
      name: r.name,
      image_url: r.image_url,
      price_per_day: peakPrices[r.id] ?? 0,
      type: r.camper_types?.name ?? null,
      capacity: r.capacities?.label ?? null,
      wildCampingSuitable: r.wild_camping_suitable ?? null,
      maxPassengers: parseMaxPassengers(r.capacities?.label ?? null),
    }))
    .sort((a, b) => a.price_per_day - b.price_per_day)

  // Filter by passengers
  const filtered = campers.filter(c => {
    if (state.passengers && c.maxPassengers > 0 && c.maxPassengers < state.passengers) return false
    // Only filter by wild camping if field is explicitly set on the camper
    if (state.campingType === 'wild' && c.wildCampingSuitable === false) return false
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
          capacity: c.capacity,
          wildCampingSuitable: c.wildCampingSuitable,
          availableSlots: [{
            from: state.startDate!,
            to: state.endDate!,
            days: state.durationDays ?? daysBetween(state.startDate!, exactSearchEndExclusive),
          }],
        })
      }
    } else {
      const freeSlots = computeFreeSlots(camperBookings, windowFrom, windowTo, minDays)
      const picked = pickSlots(freeSlots, state.durationDays)
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
          capacity: c.capacity,
          wildCampingSuitable: c.wildCampingSuitable,
          availableSlots: picked,
        })
      }
    }
  }

  // Prefer wild camping suitable cars if that's what they want
  if (state.campingType === 'wild') {
    results.sort((a, b) => {
      const aWild = a.wildCampingSuitable === true ? 1 : 0
      const bWild = b.wildCampingSuitable === true ? 1 : 0
      return bWild - aWild
    })
  }

  // Exclude already recommended
  const excluded = new Set(state.alreadyRecommendedSlugs ?? [])
  return results.filter(c => !excluded.has(c.slug))
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

  const [{ data: row, error }, peakPrices] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        camper_types!type_id(name),
        capacities!capacity_id(label),
        wild_camping_suitable
      `)
      .eq('slug', slug)
      .eq('available', true)
      .single(),
    loadPeakPrices(),
  ])

  if (error || !row) return []

  const r = row as any
  const camper = {
    slug: r.slug as string,
    name: r.name as string,
    image_url: r.image_url as string,
    price_per_day: (peakPrices[r.id] ?? 0) as number,
    type: (r.camper_types?.name ?? null) as string | null,
    capacity: (r.capacities?.label ?? null) as string | null,
    wildCampingSuitable: (r.wild_camping_suitable ?? null) as boolean | null,
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
    capacity: camper.capacity,
    wildCampingSuitable: camper.wildCampingSuitable,
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

  const [{ data: rows, error }, peakPrices] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        camper_types!type_id(name),
        capacities!capacity_id(label),
        wild_camping_suitable
      `)
      .eq('available', true)
      .order('name'),
    loadPeakPrices(),
  ])

  if (error || !rows) return []

  const campers = (rows as any[])
    .map(r => ({
      slug: r.slug as string,
      name: r.name as string,
      image_url: r.image_url as string,
      price_per_day: (peakPrices[r.id] ?? 0) as number,
      type: (r.camper_types?.name ?? null) as string | null,
      capacity: (r.capacities?.label ?? null) as string | null,
      wildCampingSuitable: (r.wild_camping_suitable ?? null) as boolean | null,
      maxPassengers: parseMaxPassengers(r.capacities?.label ?? null),
    }))
    .sort((a, b) => a.price_per_day - b.price_per_day)

  const filtered = campers.filter(c => {
    if (state.passengers && c.maxPassengers > 0 && c.maxPassengers < state.passengers) return false
    if (state.campingType === 'wild' && c.wildCampingSuitable === false) return false
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
      capacity: c.capacity,
      wildCampingSuitable: c.wildCampingSuitable,
      availableSlots: [slot],
    })
  }

  // Sort by earliest slot date
  results.sort((a, b) => a.availableSlots[0].from.localeCompare(b.availableSlots[0].from))

  if (state.campingType === 'wild') {
    results.sort((a, b) => (b.wildCampingSuitable ? 1 : 0) - (a.wildCampingSuitable ? 1 : 0))
  }

  const excluded = new Set(state.alreadyRecommendedSlugs ?? [])
  return results.filter(c => !excluded.has(c.slug))
}
