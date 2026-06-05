'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Camper } from '@/lib/types'
import Filters from '@/components/sections/Filters'
import CamperGrid from '@/components/sections/CamperGrid'

export default function KatalogusPage() {
  const [campers, setCampers] = useState<Camper[]>([])
  const [people, setPeople] = useState('')
  const [type, setType] = useState('')
  const [comfort, setComfort] = useState('')

  useEffect(() => {
    async function fetchCampers() {
      let query = supabase.from('campers').select('*')
      if (people) query = query.eq('people', people)
      if (type) query = query.eq('type', type)
      if (comfort) query = query.eq('comfort', comfort)
      const { data } = await query
      if (data) setCampers(data)
    }
    fetchCampers()
  }, [people, type, comfort])

  const filtered = campers.filter(c => {
    if (people && c.people !== people) return false
    if (type && c.type !== type) return false
    if (comfort && c.comfort !== comfort) return false
    return true
  })

  return (
    <div className="pt-20">
      <section className="max-w-[1200px] mx-auto px-10 py-16">
        <span className="block text-xs text-[#666] uppercase tracking-[0.2em] mb-4">Flottánk</span>
        <h1 className="text-4xl font-extrabold text-[#111] mb-3">Lakóautó katalógus</h1>
        <p className="text-[#666] text-lg mb-8">Válaszd ki az utazásodhoz legjobban illő járművet.</p>

        <Filters
          people={people}
          type={type}
          comfort={comfort}
          onPeople={setPeople}
          onType={setType}
          onComfort={setComfort}
        />

        <div className="mt-8">
          <CamperGrid campers={filtered} />
        </div>
      </section>
    </div>
  )
}
