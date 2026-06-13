import { createClient } from '@supabase/supabase-js'
import type { Trip, TripItineraryDay } from './trips'

// Anonymous read-only client — trips are public data, no auth needed
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

type DbTrip = {
  id: string
  slug: string
  num: number
  country: string
  km: number
  days: number
  nights: number
  title: string
  is_free: boolean
  price_huf: number
  hero_image: string
  thumb_images: string[]
  from_city: string
  to_city: string
  difficulty: string
  best_season: string
  description: string
  itinerary: TripItineraryDay[]
  campings: number
  sights: number
  ferries: number
  spec_note: string
}

function mapRow(row: DbTrip): Trip {
  return {
    id: row.id,
    slug: row.slug,
    num: row.num,
    country: row.country,
    km: row.km,
    days: row.days,
    nights: row.nights,
    title: row.title,
    isFree: row.is_free,
    priceHuf: row.price_huf,
    heroImage: row.hero_image,
    thumbImages: row.thumb_images ?? [],
    from: row.from_city,
    to: row.to_city,
    difficulty: row.difficulty,
    bestSeason: row.best_season,
    description: row.description,
    itinerary: row.itinerary ?? [],
    campings: row.campings,
    sights: row.sights,
    ferries: row.ferries,
    specNote: row.spec_note,
  }
}

export async function getTrips(): Promise<Trip[]> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('available', true)
    .order('num')
  if (error || !data) return []
  return data.map(mapRow)
}

export async function getTripSlugs(): Promise<string[]> {
  const { data } = await supabase
    .from('trips')
    .select('slug')
    .eq('available', true)
  return (data ?? []).map((r: { slug: string }) => r.slug)
}

export async function getTripBySlug(slug: string): Promise<Trip | null> {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('slug', slug)
    .eq('available', true)
    .single()
  if (error || !data) return null
  return mapRow(data)
}
