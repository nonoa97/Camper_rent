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

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().split('T')[0]
}

function daysBetween(from: string, to: string): number {
  return Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
}

function computeFreeSlots(
  bookings: { start_date: string; end_date: string }[],
  windowFrom: string,
  windowTo: string,
  minDays: number,
): { from: string; to: string; days: number }[] {
  const sorted = [...bookings].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const slots: { from: string; to: string; days: number }[] = []
  let cursor = windowFrom

  for (const b of sorted) {
    if (b.start_date > windowTo) break
    const gapEnd = b.start_date < windowFrom ? windowFrom : b.start_date
    const gap = daysBetween(cursor, gapEnd)
    if (gap >= minDays) {
      slots.push({ from: cursor, to: addDays(gapEnd, -1), days: gap })
    }
    const nextCursor = addDays(b.end_date, 1)
    if (nextCursor > cursor) cursor = nextCursor
  }

  const finalGap = daysBetween(cursor, windowTo)
  if (finalGap >= minDays) slots.push({ from: cursor, to: windowTo, days: finalGap })

  return slots
}

function parseMaxPassengers(label: string | null): number {
  if (!label) return 0
  const nums = label.match(/\d+/g)
  return nums ? Math.max(...nums.map(Number)) : 0
}

function pickSlots(
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
    windowTo = new Date(y, m, 0).toISOString().split('T')[0]
  } else {
    windowFrom = today
    windowTo = new Date(
      new Date().getFullYear(),
      new Date().getMonth() + 3,
      0,
    ).toISOString().split('T')[0]
  }

  // Fetch campers
  const { data: rows, error } = await supabase
    .from('campers')
    .select(`
      slug, name, image_url, price_per_day,
      camper_types!type_id(name),
      capacities!capacity_id(label),
      wild_camping_suitable
    `)
    .eq('available', true)
    .order('price_per_day')

  if (error || !rows) return []

  const campers = (rows as any[]).map(r => ({
    slug: r.slug,
    name: r.name,
    image_url: r.image_url,
    price_per_day: r.price_per_day,
    type: r.camper_types?.name ?? null,
    capacity: r.capacities?.label ?? null,
    wildCampingSuitable: r.wild_camping_suitable ?? null,
    maxPassengers: parseMaxPassengers(r.capacities?.label ?? null),
  }))

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
  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('start_date, end_date, campers!inner(slug)')
    .eq('status', 'confirmed')
    .gte('end_date', windowFrom)
    .lte('start_date', windowTo)

  const bookingsByCamper: Record<string, { start_date: string; end_date: string }[]> = {}
  for (const slug of slugs) bookingsByCamper[slug] = []

  for (const b of (bookingRows ?? [])) {
    const slug = (b as any).campers?.slug as string | undefined
    if (slug && bookingsByCamper[slug]) {
      bookingsByCamper[slug].push({ start_date: b.start_date, end_date: b.end_date })
    }
  }

  const results: CamperResult[] = []
  const minDays = state.durationDays ?? MIN_RENTAL_DAYS

  for (const c of filtered) {
    const camperBookings = bookingsByCamper[c.slug] ?? []

    if (exactRange) {
      const isAvailable = !camperBookings.some(
        b => b.start_date <= state.endDate! && b.end_date >= state.startDate!,
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
            days: daysBetween(state.startDate!, state.endDate!),
          }],
        })
      }
    } else {
      const freeSlots = computeFreeSlots(camperBookings, windowFrom, windowTo, minDays)
      const picked = pickSlots(freeSlots, state.durationDays)
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
    windowTo = new Date(y, m, 0).toISOString().split('T')[0]
  } else {
    windowFrom = todayStr
    windowTo = new Date(today.getFullYear(), today.getMonth() + monthsAhead, 0)
      .toISOString().split('T')[0]
  }

  const { data: row, error } = await supabase
    .from('campers')
    .select(`
      slug, name, image_url, price_per_day,
      camper_types!type_id(name),
      capacities!capacity_id(label),
      wild_camping_suitable
    `)
    .eq('slug', slug)
    .eq('available', true)
    .single()

  if (error || !row) return []

  const r = row as any
  const camper = {
    slug: r.slug as string,
    name: r.name as string,
    image_url: r.image_url as string,
    price_per_day: r.price_per_day as number,
    type: (r.camper_types?.name ?? null) as string | null,
    capacity: (r.capacities?.label ?? null) as string | null,
    wildCampingSuitable: (r.wild_camping_suitable ?? null) as boolean | null,
  }

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('start_date, end_date, campers!inner(slug)')
    .eq('status', 'confirmed')
    .gte('end_date', windowFrom)
    .lte('start_date', windowTo)

  const camperBookings: { start_date: string; end_date: string }[] = []
  for (const b of (bookingRows ?? [])) {
    const bSlug = (b as any).campers?.slug as string | undefined
    if (bSlug === slug) {
      camperBookings.push({ start_date: b.start_date, end_date: b.end_date })
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
  const windowTo = new Date(today.getFullYear(), today.getMonth() + monthsAhead, 0)
    .toISOString().split('T')[0]

  const { data: rows, error } = await supabase
    .from('campers')
    .select(`
      slug, name, image_url, price_per_day,
      camper_types!type_id(name),
      capacities!capacity_id(label),
      wild_camping_suitable
    `)
    .eq('available', true)
    .order('price_per_day')

  if (error || !rows) return []

  const campers = (rows as any[]).map(r => ({
    slug: r.slug as string,
    name: r.name as string,
    image_url: r.image_url as string,
    price_per_day: r.price_per_day as number,
    type: (r.camper_types?.name ?? null) as string | null,
    capacity: (r.capacities?.label ?? null) as string | null,
    wildCampingSuitable: (r.wild_camping_suitable ?? null) as boolean | null,
    maxPassengers: parseMaxPassengers(r.capacities?.label ?? null),
  }))

  const filtered = campers.filter(c => {
    if (state.passengers && c.maxPassengers > 0 && c.maxPassengers < state.passengers) return false
    if (state.campingType === 'wild' && c.wildCampingSuitable === false) return false
    return true
  })

  if (filtered.length === 0) return []

  const { data: bookingRows } = await supabase
    .from('bookings')
    .select('start_date, end_date, campers!inner(slug)')
    .eq('status', 'confirmed')
    .gte('end_date', windowFrom)
    .lte('start_date', windowTo)

  const bookingsByCamper: Record<string, { start_date: string; end_date: string }[]> = {}
  for (const c of filtered) bookingsByCamper[c.slug] = []
  for (const b of (bookingRows ?? [])) {
    const slug = (b as any).campers?.slug as string | undefined
    if (slug && bookingsByCamper[slug]) {
      bookingsByCamper[slug].push({ start_date: b.start_date, end_date: b.end_date })
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
