export interface TripItineraryDay {
  day: string
  title: string
  desc: string
}

export interface Trip {
  id: string
  slug: string
  num: number
  country: string
  km: number
  days: number
  nights: number
  title: string
  isFree: boolean
  priceHuf: number
  heroImage: string
  thumbImages: string[]
  from: string
  to: string
  difficulty: string
  bestSeason: string
  description: string
  itinerary: TripItineraryDay[]
  campings: number
  sights: number
  ferries: number
  specNote: string
}
