'use client'

import { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { resolveCurrentSeason, type SeasonRow } from '@/lib/season'
import type { CamperGearbox, CamperFuel, CamperType } from '@/lib/types'
import { CATALOG_CARD_FEATURE_KEYS, selectFeatureNamesByKeys, type DisplayFeature } from '@/lib/featureDisplay'

const CAMPER_TYPES: CamperType[] = ['Camper van', 'Alkóvos', 'Integrált', 'Félintegrált']

interface CamperCard {
  id: string
  name: string
  slug: string
  price_per_day: number
  image_url: string | null
  beds: number | null
  type: CamperType | null
  year: number | null
  gearbox: CamperGearbox | null
  fuel_type: CamperFuel | null
  features: string[]
}

const PRICE_MIN = 0
const PRICE_MAX = 120000
const PRICE_STEP = 5000

function getPrimaryImage(camper: any): string | null {
  if (typeof camper.image_url === 'string' && camper.image_url.length > 0) return camper.image_url
  const images = Array.isArray(camper.camper_images)
    ? [...camper.camper_images].sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    : []
  return images.find((image: any) => typeof image.url === 'string' && image.url.length > 0)?.url ?? null
}

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
        <div className="absolute inset-0 bg-[#e6e4df] rounded-full" />
        <div
          className="absolute h-full bg-[#111] rounded-full"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <style>{`
          .price-thumb::-webkit-slider-thumb { -webkit-appearance:none; width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #111; cursor:pointer; pointer-events:all; }
          .price-thumb::-moz-range-thumb { width:16px; height:16px; border-radius:50%; background:#fff; border:2px solid #111; cursor:pointer; pointer-events:all; }
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
    <div className="border-b border-[#e6e4df] last:border-0">
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
          : 'text-[#555] hover:bg-[#f0ede7] hover:text-[#111]'
      }`}
    >
      {children}
    </button>
  )
}

const BED_FILTERS = [2, 4, 6]

export default function KatalogusPage() {
  const [campers, setCampers] = useState<CamperCard[]>([])
  const [minBeds, setMinBeds] = useState<number | null>(null)
  const [typeFilter, setTypeFilter] = useState<CamperType | null>(null)
  const [minPrice, setMinPrice] = useState(PRICE_MIN)
  const [maxPrice, setMaxPrice] = useState(PRICE_MAX)

  useEffect(() => {
    async function loadCampers() {
      let query = supabase
        .from('campers')
        .select('id, name, slug, image_url, beds, type, year, gearbox, fuel_type, camper_images(url, sort_order), camper_features(features(key, name))')
        .eq('available', true)
        .order('name')

      if (typeFilter) query = query.eq('type', typeFilter)

      const [{ data }, { data: priceRows }, { data: seasonRows }] = await Promise.all([
        query,
        supabase.from('camper_prices').select('camper_id, season_id, price'),
        supabase.from('seasons').select('id, name, from_md, to_md'),
      ])
      const { id: seasonId } = resolveCurrentSeason((seasonRows ?? []) as SeasonRow[])
      const seasonPrices: Record<string, number> = {}
      for (const p of (priceRows ?? []) as any[]) {
        if (p.season_id === seasonId) seasonPrices[p.camper_id] = p.price
      }
      if (data) {
        setCampers(data.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          price_per_day: seasonPrices[c.id] ?? 0,
          image_url: getPrimaryImage(c),
          beds: c.beds ?? null,
          type: c.type ?? null,
          year: c.year ?? null,
          gearbox: c.gearbox ?? null,
          fuel_type: c.fuel_type ?? null,
          features: selectFeatureNamesByKeys(
            (c.camper_features ?? [])
              .map((cf: any) => ({
                key: cf.features?.key,
                name: cf.features?.name,
              }))
              .filter((feature: any): feature is DisplayFeature =>
                typeof feature.key === 'string' &&
                feature.key.length > 0 &&
                typeof feature.name === 'string' &&
                feature.name.length > 0,
              ),
            CATALOG_CARD_FEATURE_KEYS,
            3,
          ),
        })))
      }
    }
    loadCampers()
  }, [typeFilter])

  const filtered = campers.filter(c => {
    if (c.price_per_day < minPrice || c.price_per_day > maxPrice) return false
    if (minBeds !== null && (c.beds ?? 0) < minBeds) return false
    return true
  })

  return (
    <>

      {/* Page heading */}
      <section className="bg-[#f7f6f3] pt-10 pb-12 px-4 md:px-10 border-b border-[#e6e4df]">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#111] mb-5 max-w-2xl leading-tight">
            Találd meg az utadhoz illő járművet.
          </h1>
          <p className="text-[#666] text-base md:text-lg max-w-xl leading-relaxed">
            Kompakt furgonoktól a családi alkóvosig — minden kalandhoz van megfelelő lakóautónk.
          </p>
        </div>
      </section>

      {/* Filter + grid */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 py-10 flex flex-col md:flex-row gap-8 md:gap-12 items-start">

        {/* Sidebar */}
        <aside className="w-full md:w-48 md:flex-shrink-0">
          <FilterSection label="Ár / nap" defaultOpen={false}>
            <PriceSlider
              min={minPrice}
              max={maxPrice}
              onChange={(min, max) => { setMinPrice(min); setMaxPrice(max) }}
            />
          </FilterSection>

          <FilterSection label="Férőhely">
            <FilterBtn active={minBeds === null} onClick={() => setMinBeds(null)}>Mind</FilterBtn>
            {BED_FILTERS.map(n => (
              <FilterBtn key={n} active={minBeds === n} onClick={() => setMinBeds(n)}>
                {n}+ fő
              </FilterBtn>
            ))}
          </FilterSection>

          <FilterSection label="Típus">
            <FilterBtn active={typeFilter === null} onClick={() => setTypeFilter(null)}>Mind</FilterBtn>
            {CAMPER_TYPES.map(t => (
              <FilterBtn key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t}
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
                  className="group bg-white border border-[#e6e4df] rounded-2xl overflow-hidden hover:shadow-lg transition-all duration-300 block">
                  <div className="relative h-[220px] w-full overflow-hidden">
                    {camper.image_url ? (
                      <Image
                        src={camper.image_url}
                        alt={camper.name}
                        fill
                        sizes="(max-width: 640px) 100vw, 50vw"
                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full bg-[#f0ede7]" />
                    )}
                  </div>
                  <div className="p-5">
                    <h3 className="text-lg font-extrabold text-[#111] mb-3 leading-snug">{camper.name}</h3>

                    <div className="flex flex-wrap gap-1.5 mb-4">
                      {camper.beds != null && (
                        <span className="text-[11px] text-[#666] bg-[#f7f6f3] border border-[#e6e4df] px-2.5 py-1 rounded-full">{camper.beds} fő</span>
                      )}
                      {camper.year && (
                        <span className="text-[11px] text-[#666] bg-[#f7f6f3] border border-[#e6e4df] px-2.5 py-1 rounded-full">{camper.year}</span>
                      )}
                      {camper.gearbox && (
                        <span className="text-[11px] text-[#666] bg-[#f7f6f3] border border-[#e6e4df] px-2.5 py-1 rounded-full">{camper.gearbox}</span>
                      )}
                      {camper.fuel_type && (
                        <span className="text-[11px] text-[#666] bg-[#f7f6f3] border border-[#e6e4df] px-2.5 py-1 rounded-full">{camper.fuel_type}</span>
                      )}
                    </div>

                    <div className="flex items-end justify-between border-t border-[#e6e4df] pt-3">
                      <div>
                        <span className="text-xl font-extrabold text-[#111]">
                          {camper.price_per_day.toLocaleString('hu-HU')} Ft
                        </span>
                        <p className="text-xs text-[#aaa] mt-0.5">/ nap</p>
                      </div>
                      <span className="text-xs font-semibold text-[#111] group-hover:underline tracking-wide">
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

      {/* CTA band */}
      <section className="py-12 px-4 md:px-10 border-t border-[#e6e4df]" style={{ background: '#111' }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl md:text-3xl font-extrabold text-white mb-1">
              Nem tudod, merre indulj?
            </h2>
            <p className="text-white/50 text-sm">Fedezd fel kipróbált európai útvonalainkat.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 flex-shrink-0">
            <Link
              href="/utazasok"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#111] text-sm font-semibold hover:bg-[#f0f0f0] transition-colors"
            >
              Útvonalak felfedezése <span aria-hidden>→</span>
            </Link>
            <Link
              href="/kapcsolat"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-full border border-white/30 text-white text-sm font-semibold hover:border-white/60 hover:bg-white/10 transition-colors"
            >
              Kapcsolatfelvétel
            </Link>
          </div>
        </div>
      </section>
    </>
  )
}
