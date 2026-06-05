export interface Capacity {
  id: number
  label: string
  sort_order: number
}

export interface CamperType {
  id: number
  name: string
  sort_order: number
}

export interface ComfortLevel {
  id: number
  name: string
  sort_order: number
}

export interface Feature {
  id: number
  name: string
  icon?: string
}

export interface Camper {
  id: string
  name: string
  slug?: string
  capacity_id?: number
  type_id?: number
  comfort_id?: number
  // joined relations (when queried with select)
  capacity?: Capacity
  camper_type?: CamperType
  comfort_level?: ComfortLevel
  features?: Feature[]
  description?: string
  price_per_day?: number
  image_url?: string
  images?: string[]
  available?: boolean
  detail_url?: string
  inquiry_url?: string
  created_at?: string
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
