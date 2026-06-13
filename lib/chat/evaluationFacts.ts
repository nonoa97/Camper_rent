import { supabase } from '@/lib/supabase'
import type { ConversationState } from './state'
import type { FeatureDisplayNameMap } from './featureExplainability'
import { getMonthSearchWindow, getPreferredStartSearchWindow } from './availability'

export interface CamperFact {
  id: string
  slug: string
  name: string
  imageUrl: string
  type: string | null
  gearbox: string | null
  fuelType: string | null
  year: number | null
  beds: number | null
  features: { key: string; name: string }[]
  featureKeys: Set<string>
}

export interface BookingFact {
  camperId: string
  startDate: string
  endDate: string
}

export interface SeasonFact {
  id: string
  name: string
  fromMd: string
  toMd: string
  sortOrder: number
}

export interface DiscountFact {
  minDays: number
  discountPercent: number
  active: boolean
}

export interface EvaluationFacts {
  campers: CamperFact[]
  bookingsByCamperId: Record<string, BookingFact[]>
  pricesByCamperSeason: Record<string, Record<string, number>>
  seasons: SeasonFact[]
  discounts: DiscountFact[]
  globalDiscountsActive: boolean
  featureDisplayNames: FeatureDisplayNameMap
}

function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().split('T')[0]
}

function lastDayOfMonth(year: number, monthOneBased: number): string {
  return new Date(Date.UTC(year, monthOneBased, 0)).toISOString().split('T')[0]
}

function getPrimaryImage(row: any): string {
  const images = Array.isArray(row.camper_images)
    ? [...row.camper_images].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []
  return images.find((image: any) => typeof image.url === 'string' && image.url.length > 0)?.url
    ?? row.image_url
    ?? ''
}

export function getSearchWindow(state: ConversationState): { from?: string; to?: string; hasAvailabilityConstraint: boolean } {
  if (state.startDate && state.endDate) {
    return { from: state.startDate, to: state.endDate, hasAvailabilityConstraint: true }
  }
  const preferredStartWindow = getPreferredStartSearchWindow(state)
  if (preferredStartWindow.from && preferredStartWindow.to) {
    return { from: preferredStartWindow.from, to: preferredStartWindow.to, hasAvailabilityConstraint: true }
  }
  if (state.month) {
    const monthWindow = getMonthSearchWindow(state.month)
    return { from: monthWindow.from, to: monthWindow.to, hasAvailabilityConstraint: true }
  }
  return { hasAvailabilityConstraint: false }
}

function collectBookingWindow(states: ConversationState[]): { from?: string; to?: string } {
  const windows = states
    .map(getSearchWindow)
    .filter((window): window is { from: string; to: string; hasAvailabilityConstraint: true } => !!window.from && !!window.to)
  if (windows.length === 0) return {}
  return {
    from: windows.map(window => window.from).sort()[0],
    to: windows.map(window => window.to).sort().at(-1),
  }
}

export async function loadEvaluationFacts(states: ConversationState[]): Promise<EvaluationFacts> {
  const bookingWindow = collectBookingWindow(states)

  const [
    { data: camperRows },
    { data: priceRows },
    { data: seasonRows },
    { data: discountRows },
    { data: settingRow },
  ] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, image_url,
        type, gearbox, fuel_type, year, beds,
        camper_images(url, sort_order),
        camper_features(features(key, name, category_id, feature_categories(name, sort_order)))
      `)
      .eq('available', true)
      .order('name'),
    supabase.from('camper_prices').select('camper_id, season_id, price'),
    supabase.from('seasons').select('id, name, from_md, to_md, sort_order').order('sort_order'),
    supabase.from('long_stay_tiers').select('min_days, discount_pct, active, sort_order').order('sort_order'),
    supabase.from('app_settings').select('value').eq('key', 'long_stay_enabled').single(),
  ])

  let bookingRows: any[] = []
  if (bookingWindow.from && bookingWindow.to) {
    const searchEndExclusive = addDays(bookingWindow.to, 1)
    const { data } = await supabase
      .from('bookings')
      .select('camper_id, start_date, end_date, status')
      .eq('status', 'confirmed')
      .lt('start_date', searchEndExclusive)
      .gt('end_date', bookingWindow.from)
    bookingRows = data ?? []
  }

  const campers: CamperFact[] = ((camperRows ?? []) as any[]).map(row => {
    const features = (row.camper_features ?? [])
      .map((cf: any) => ({
        key: cf.features?.key,
        name: cf.features?.name,
      }))
      .filter((feature: { key?: unknown; name?: unknown }): feature is { key: string; name: string } =>
        typeof feature.key === 'string' &&
        feature.key.length > 0 &&
        typeof feature.name === 'string' &&
        feature.name.length > 0,
      )

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      imageUrl: getPrimaryImage(row),
      type: row.type ?? null,
      gearbox: row.gearbox ?? null,
      fuelType: row.fuel_type ?? null,
      year: row.year ?? null,
      beds: row.beds ?? null,
      features,
      featureKeys: new Set(features.map((feature: { key: string; name: string }) => feature.key)),
    }
  })
  const featureDisplayNames: FeatureDisplayNameMap = {}
  for (const camper of campers) {
    for (const feature of camper.features) {
      if (!featureDisplayNames[feature.key]) {
        featureDisplayNames[feature.key] = feature.name
      }
    }
  }

  const pricesByCamperSeason: Record<string, Record<string, number>> = {}
  for (const row of (priceRows ?? []) as any[]) {
    if (!pricesByCamperSeason[row.camper_id]) pricesByCamperSeason[row.camper_id] = {}
    pricesByCamperSeason[row.camper_id][row.season_id] = row.price
  }

  const bookingsByCamperId: Record<string, BookingFact[]> = {}
  for (const camper of campers) bookingsByCamperId[camper.id] = []
  for (const row of bookingRows) {
    if (!bookingsByCamperId[row.camper_id]) bookingsByCamperId[row.camper_id] = []
    bookingsByCamperId[row.camper_id].push({
      camperId: row.camper_id,
      startDate: row.start_date,
      endDate: row.end_date,
    })
  }

  return {
    campers,
    bookingsByCamperId,
    pricesByCamperSeason,
    seasons: ((seasonRows ?? []) as any[]).map(row => ({
      id: row.id,
      name: row.name,
      fromMd: row.from_md,
      toMd: row.to_md,
      sortOrder: row.sort_order ?? 0,
    })),
    discounts: ((discountRows ?? []) as any[]).map(row => ({
      minDays: row.min_days,
      discountPercent: row.discount_pct,
      active: row.active,
    })),
    globalDiscountsActive: String((settingRow as any)?.value ?? 'false') === 'true',
    featureDisplayNames,
  }
}
