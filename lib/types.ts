export interface Camper {
  id: string
  name: string
  people: '2-3' | '2-4' | '4-6' | '6+'
  type: 'camper-van' | 'alkóvos' | 'integrált'
  comfort: 'alap' | 'comfort' | 'prémium'
  description?: string
  price?: string
  image_url?: string
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
