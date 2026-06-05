'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import PageHeader from '@/components/layout/PageHeader'

interface FilterOption { id: number; label?: string; name?: string }
interface CamperCard {
  id: string
  name: string
  slug: string
  price_per_day: number
  image_url: string | null
  capacity_id: number | null
  type_id: number | null
  capacity: string
  year: number | null
  gearbox: string | null
  fuel_type: string | null
  features: string[]
}

const PRICE_RANGES = [
  { label: 'Akár 40 000 Ft', min: 0, max: 40000 },
  { label: '40 000 – 60 000 Ft', min: 40000, max: 60000 },
  { label: '60 000 – 80 000 Ft', min: 60000, max: 80000 },
  { label: '80 000 Ft felett', min: 80000, max: Infinity },
]

const KEY_FEATURES = ['Automata váltó', 'Manuális váltó', 'Zuhanyzó', 'WC', 'Főzőlap', 'WiFi', 'Légkondi', 'Fix ágy']

function FilterSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="py-5 border-b border-[#f0f0ee] last:border-0">
      <p className="text-[10px] tracking-[0.2em] uppercase text-[#999] font-semibold mb-3">{label}</p>
      <div className="flex flex-col gap-0.5">
        {children}
      </div>
    </div>
  )
}

function FilterBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`text-left text-sm px-3 py-2 rounded-lg transition-all duration-150 ${
        active
          ? 'bg-[#1a3a2a] text-white font-medium'
          : 'text-[#444] hover:bg-[#f5f5f0] hover:text-[#111]'
      }`}
    >
      {children}
    </button>
  )
}

export default function KatalogusPage() {
  const [campers, setCampers] = useState<CamperCard[]>([])
  const [capacities, setCapacities] = useState<FilterOption[]>([])
  const [types, setTypes] = useState<FilterOption[]>([])

  const [capacityId, setCapacityId] = useState<number | null>(null)
  const [typeId, setTypeId] = useState<number | null>(null)
  const [priceRange, setPriceRange] = useState<string | null>(null)

  useEffect(() => {
    async function loadFilters() {
      const [cap, typ] = await Promise.all([
        supabase.from('capacities').select('id, label, sort_order').order('sort_order'),
        supabase.from('camper_types').select('id, name, sort_order').order('sort_order'),
      ])
      if (cap.data) setCapacities(cap.data)
      if (typ.data) setTypes(typ.data)
    }
    loadFilters()
  }, [])

  useEffect(() => {
    async function loadCampers() {
      let query = supabase
        .from('campers')
        .select('id, name, slug, price_per_day, image_url, capacity_id, type_id, year, gearbox, fuel_type, capacities(label), camper_features(features(name))')
        .eq('available', true)
        .order('price_per_day')

      if (capacityId) query = query.eq('capacity_id', capacityId)
      if (typeId) query = query.eq('type_id', typeId)

      const { data } = await query
      if (data) {
        setCampers(data.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          price_per_day: c.price_per_day,
          image_url: c.image_url,
          capacity_id: c.capacity_id,
          type_id: c.type_id,
          capacity: c.capacities?.label ?? '',
          year: c.year ?? null,
          gearbox: c.gearbox ?? null,
          fuel_type: c.fuel_type ?? null,
          features: (c.camper_features ?? [])
            .map((cf: any) => cf.features?.name)
            .filter(Boolean)
            .filter((f: string) => KEY_FEATURES.includes(f))
            .slice(0, 3),
        })))
      }
    }
    loadCampers()
  }, [capacityId, typeId])

  const filtered = campers.filter(c => {
    if (!priceRange) return true
    const range = PRICE_RANGES.find(r => r.label === priceRange)
    if (!range) return true
    return c.price_per_day >= range.min && c.price_per_day < range.max
  })

  return (
    <>
      <PageHeader />

      <section className="max-w-[1300px] mx-auto px-10 pt-14 pb-6 text-center">
        <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Válassz egy lakóautót</span>
        <h1 className="text-4xl font-extrabold text-[#111] mb-3">Találd meg az utadhoz illő járművet</h1>
        <p className="text-[#666] text-base max-w-lg mx-auto">
          Kompakt furgonoktól a családi alkóvosig — minden kalandhoz van megfelelő lakóautónk.
        </p>
      </section>

      <section className="max-w-[1300px] mx-auto px-10 py-10 flex gap-12 items-start">

        {/* Sidebar */}
        <aside className="w-52 flex-shrink-0">
          <FilterSection label="Férőhely">
            <FilterBtn active={capacityId === null} onClick={() => setCapacityId(null)}>Mind</FilterBtn>
            {capacities.map(c => (
              <FilterBtn key={c.id} active={capacityId === c.id} onClick={() => setCapacityId(c.id)}>
                {c.label} fő
              </FilterBtn>
            ))}
          </FilterSection>

          <FilterSection label="Típus">
            <FilterBtn active={typeId === null} onClick={() => setTypeId(null)}>Mind</FilterBtn>
            {types.map(t => (
              <FilterBtn key={t.id} active={typeId === t.id} onClick={() => setTypeId(t.id)}>
                {t.name}
              </FilterBtn>
            ))}
          </FilterSection>

          <FilterSection label="Ár / nap">
            <FilterBtn active={priceRange === null} onClick={() => setPriceRange(null)}>Mind</FilterBtn>
            {PRICE_RANGES.map(r => (
              <FilterBtn key={r.label} active={priceRange === r.label} onClick={() => setPriceRange(r.label)}>
                {r.label}
              </FilterBtn>
            ))}
          </FilterSection>
        </aside>

        {/* Grid */}
        <div className="flex-1">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-[#888]">
              <p className="text-lg">Nincs találat a szűrési feltételekre.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-5">
              {filtered.map(camper => (
                <Link key={camper.id} href={`/katalogus/${camper.slug}`}
                  className="group bg-white border border-[#ece9e4] rounded-2xl overflow-hidden hover:shadow-md transition-shadow duration-200 block">
                  <div className="relative h-60 w-full overflow-hidden">
                    {camper.image_url ? (
                      <Image src={camper.image_url} alt={camper.name} fill className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full bg-[#f0f0ee]" />
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-extrabold text-[#111] mb-3">{camper.name}</h3>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {camper.capacity && (
                        <span className="text-[11px] text-[#555] bg-[#f0f0ec] px-2.5 py-1 rounded-full">👥 {camper.capacity} fő</span>
                      )}
                      {camper.year && (
                        <span className="text-[11px] text-[#555] bg-[#f0f0ec] px-2.5 py-1 rounded-full">📅 {camper.year}</span>
                      )}
                      {camper.gearbox && (
                        <span className="text-[11px] text-[#555] bg-[#f0f0ec] px-2.5 py-1 rounded-full">⚙️ {camper.gearbox}</span>
                      )}
                      {camper.fuel_type && (
                        <span className="text-[11px] text-[#555] bg-[#f0f0ec] px-2.5 py-1 rounded-full">⛽ {camper.fuel_type}</span>
                      )}
                    </div>

                    <div className="flex items-end justify-between border-t border-[#f5f5f0] pt-3">
                      <div>
                        <span className="text-xl font-extrabold text-[#111]">
                          {camper.price_per_day.toLocaleString('hu-HU')} Ft
                        </span>
                        <p className="text-xs text-[#aaa] mt-0.5">/ nap</p>
                      </div>
                      <span className="text-xs font-semibold text-[#1a3a2a] group-hover:underline tracking-wide">
                        Részletek →
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

      </section>

      <section className="relative flex items-center justify-center text-white text-center py-24 overflow-hidden">
        <Image src="/cta-katalogus.png" alt="" fill className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 px-6 max-w-[700px] mx-auto">
          <span className="block text-[10px] tracking-[0.25em] uppercase text-white/60 font-semibold mb-5">
            Következő lépés
          </span>
          <h2 className="text-3xl md:text-4xl font-extrabold leading-tight mb-5">
            Nem tudod, merre indulj?
          </h2>
          <p className="text-white/70 text-base leading-relaxed mb-10">
            Fedezd fel ajánlott európai útvonalainkat vagy kérj segítséget a megfelelő lakóautó kiválasztásához.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/utazasok"
              className="inline-block bg-white text-[#111] font-semibold text-sm px-8 py-3.5 rounded-xl tracking-wide hover:bg-white/90 hover:shadow-lg transition-all duration-200"
            >
              Útvonalak felfedezése
            </Link>
            <Link
              href="/kapcsolat"
              className="inline-block border border-white/60 text-white font-semibold text-sm px-8 py-3.5 rounded-xl hover:border-white hover:bg-white/10 transition-all duration-200"
            >
              Kapcsolatfelvétel
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
