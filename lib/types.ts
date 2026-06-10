export type CamperGearbox = 'Automata' | 'Manuális'
export type CamperFuel = 'Dízel' | 'Benzin' | 'Elektromos' | 'Hibrid'
export type CamperType = 'Camper van' | 'Alkóvos' | 'Integrált' | 'Félintegrált'

export interface Feature {
  id: number
  name: string
  icon?: string
}

export interface Camper {
  id: string
  name: string
  slug?: string
  beds?: number | null
  type?: CamperType | null
  features?: Feature[]
  description?: string
  image_url?: string
  images?: string[]
  available?: boolean
  detail_url?: string
  inquiry_url?: string
  created_at?: string
  gearbox?: CamperGearbox | null
  fuel_type?: CamperFuel | null
  year?: number | null
  wild_camping_suitable?: boolean | null
}

export interface Trip {
  id: string
  title: string
  description?: string
  image_url?: string
  icon?: string
  link?: string
  created_at?: string
}
