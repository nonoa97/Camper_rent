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

const PRICE_MIN = 0
const PRICE_MAX = 120000
const PRICE_STEP = 5000

const KEY_FEATURES = ['Automata váltó', 'Manuális váltó', 'Zuhanyzó', 'WC', 'Főzőlap', 'WiFi', 'Légkondi', 'Fix ágy']

function PriceSlider({ min, max, onChange }: {
  min: number
  max: number
  onChange: (min: number, max: number) => void
}) {
  const minPct = ((min - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100
  const maxPct = ((max - PRICE_MIN) / (PRICE_MAX - PRICE_MIN)) * 100

  const thumbStyle: React.CSSProperties = {
    position: 'absolute', width: '100%', height: '100%',
    appearance: 'none', background: 'none', pointerEvents: 'none',
    outline: 'none', margin: 0, padding: 0,
  }

  return (
    <div className="pb-5 px-1">
      <div className="flex justify-between text-xs text-[#666] mb-4">
        <span>{min.toLocaleString('hu-HU')} Ft</span>
        <span>{max >= PRICE_MAX ? `${PRICE_MAX.toLocaleString('hu-HU')}+ Ft` : `${max.toLocaleString('hu-HU')} Ft`}</span>
      </div>
      <div className="relative h-1.5">
        <div className="absolute inset-0 bg-[#e8e8e4] rounded-full" />
        <div
          className="absolute h-full bg-[#1a3a2a] rounded-full"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <style>{`
          .price-thumb::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #1a3a2a; cursor:pointer; pointer-events:all; }
          .price-thumb::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #1a3a2a; cursor:pointer; pointer-events:all; }
        `}</style>
        <input
          type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={min}
          className="price-thumb"
          style={{ ...thumbStyle, zIndex: min >= max - PRICE_STEP ? 5 : 3 }}
          onChange={e => { const v = Number(e.target.value); if (v <= max) onChange(v, max) }}
        />
        <input
          type="range" min={PRICE_MIN} max={PRICE_MAX} step={PRICE_STEP} value={max}
          className="price-thumb"
          style={{ ...thumbStyle, zIndex: 4 }}
          onChange={e => { const v = Number(e.target.value); if (v >= min) onChange(min, v) }}
        />
      </div>
    </div>
  )
}

function FilterSection({ label, children, defaultOpen = false }: { label: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border-b border-[#f0f0ee] last:border-0">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-4 text-left md:cursor-default"
      >
        <span className="text-[10px] tracking-[0.2em] uppercase text-[#999] font-semibold">{label}</span>
        <svg
          className={`md:hidden w-3.5 h-3.5 text-[#bbb] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`flex-col gap-0.5 pb-4 ${open ? 'flex' : 'hidden md:flex'}`}>
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
  const [minPrice, setMinPrice] = useState(PRICE_MIN)
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX)

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
        .select('id, name, slug, image_url, capacity_id, type_id, year, gearbox, fuel_type, capacities(label), camper_features(features(name))')
        .eq('available', true)
        .order('name')

      if (capacityId) query = query.eq('capacity_id', capacityId)
      if (typeId) query = query.eq('type_id', typeId)

      const [{ data }, { data: priceRows }] = await Promise.all([
        query,
        supabase.from('camper_prices').select('camper_id, price').eq('season_id', 'peak'),
      ])
      const peakPrices: Record<string, number> = {}
      for (const p of (priceRows ?? []) as any[]) peakPrices[p.camper_id] = p.price
      if (data) {
        setCampers(data.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          price_per_day: peakPrices[c.id] ?? 0,
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

  const filtered = campers.filter(c =>
    c.price_per_day >= minPrice && c.price_per_day <= maxPrice
  )

  return (
    <>
      <PageHeader />

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 pt-14 pb-6 text-center">
        <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Válassz egy lakóautót</span>
        <h1 className="text-4xl font-extrabold text-[#111] mb-3">Találd meg az utadhoz illő járművet</h1>
        <p className="text-[#666] text-base max-w-lg mx-auto">
          Kompakt furgonoktól a családi alkóvosig — minden kalandhoz van megfelelő lakóautónk.
        </p>
      </section>

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 flex flex-col md:flex-row gap-8 md:gap-12 items-start">

        {/* Sidebar */}
        <aside className="w-full md:w-52 md:flex-shrink-0">
          <FilterSection label="Ár / nap">
            <PriceSlider
              min={minPrice}
              max={maxPrice}
              onChange={(min, max) => { setMinPrice(min); setMaxPrice(max) }}
            />
          </FilterSection>

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
        </aside>

        {/* Grid */}
        <div className="flex-1">
          {filtered.length === 0 ? (
            <div className="text-center py-20 text-[#888]">
              <p className="text-lg">Nincs találat a szűrési feltételekre.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
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
