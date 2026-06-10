'use client'

import { useEffect, useRef, useState } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import { useParams } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import PageHeader from '@/components/layout/PageHeader'
import AvailabilityCalendar from '@/components/sections/AvailabilityCalendar'
import TripStack from '@/components/sections/TripStack'
import { supabase } from '@/lib/supabase'
import type { CamperGearbox, CamperFuel } from '@/lib/types'

interface TripCard {
  id: string
  name: string
  days: number
  image: string
}

const DISPLAY_TRIPS = [
  { id: '1', name: 'Dolomitok körút',   days: 5,  image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80' },
  { id: '2', name: 'Garda-tó környéke', days: 7,  image: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80' },
  { id: '3', name: 'Szlovén Alpok',     days: 4,  image: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80' },
  { id: '5', name: 'Horvát tengerpart', days: 8,  image: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&q=80' },
  { id: '6', name: 'Norvég fjordok',    days: 14, image: 'https://images.unsplash.com/photo-1601439678777-b2b3c56fa627?w=800&q=80' },
]

const ALL_TRIPS: TripCard[] = [
  { id: '1', name: 'Dolomitok körút',        days: 5,  image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80' },
  { id: '2', name: 'Garda-tó környéke',      days: 7,  image: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80' },
  { id: '3', name: 'Szlovén Alpok',          days: 4,  image: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80' },
  { id: '4', name: 'Ausztria panorámaútjai', days: 6,  image: 'https://images.unsplash.com/photo-1571406252241-db0280bd36cd?w=800&q=80' },
  { id: '5', name: 'Horvát tengerpart',      days: 8,  image: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&q=80' },
  { id: '6', name: 'Norvég fjordok',         days: 14, image: 'https://images.unsplash.com/photo-1601439678777-b2b3c56fa627?w=800&q=80' },
]

function getSuggestedTrips(type: string): TripCard[] {
  if (type === 'camper-van') return [ALL_TRIPS[0], ALL_TRIPS[2], ALL_TRIPS[3], ALL_TRIPS[5]]
  if (type === 'integrált')  return [ALL_TRIPS[1], ALL_TRIPS[0], ALL_TRIPS[3], ALL_TRIPS[4]]
  return [ALL_TRIPS[0], ALL_TRIPS[1], ALL_TRIPS[2], ALL_TRIPS[3]]
}

interface CamperFeature {
  name: string
  emoji: string | null
  highlight_title: string | null
  highlight_desc: string | null
  category_name: string | null
  category_sort: number | null
}

interface CamperDetail {
  id: string
  name: string
  slug: string
  description: string | null
  overview_title: string | null
  overview_body: string | null
  price_per_day: number
  image_url: string | null
  images: string[]
  available: boolean
  beds: number | null
  type: string
  year: number | null
  gearbox: CamperGearbox | null
  fuel_type: CamperFuel | null
  features: CamperFeature[]
}

export default function CamperDetailPage() {
  const { slug } = useParams<{ slug: string }>()
  const [camper, setCamper] = useState<CamperDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const [heroIndex, setHeroIndex] = useState(0)
  const imageCount = camper ? [camper.image_url, ...(camper.images ?? [])].filter(Boolean).length : 0
  const heroSwipe = useSwipe(
    () => setHeroIndex(i => (i + 1) % imageCount),
    () => setHeroIndex(i => (i - 1 + imageCount) % imageCount),
  )

  useEffect(() => {
    async function load() {
      const { data: c } = await supabase
        .from('campers')
        .select(`
          id, name, slug, description, overview_title, overview_body,
          image_url, available,
          year, gearbox, fuel_type, type, beds,
          camper_features(
            features(name, emoji, highlight_title, highlight_desc, category_id, feature_categories(name, sort_order))
          ),
          camper_images(url, sort_order)
        `)
        .eq('slug', slug)
        .single()

      if (c) {
        const { data: priceRow } = await supabase
          .from('camper_prices')
          .select('price')
          .eq('camper_id', c.id)
          .eq('season_id', 'peak')
          .single()

        const features: CamperFeature[] = (c.camper_features ?? [])
          .map((cf: any) => ({
            name: cf.features?.name ?? '',
            emoji: cf.features?.emoji ?? null,
            highlight_title: cf.features?.highlight_title ?? null,
            highlight_desc: cf.features?.highlight_desc ?? null,
            category_name: cf.features?.feature_categories?.name ?? null,
            category_sort: cf.features?.feature_categories?.sort_order ?? null,
          }))
          .filter((f: CamperFeature) => f.name)

        setCamper({
          id: c.id, name: c.name, slug: c.slug,
          description: c.description,
          overview_title: c.overview_title,
          overview_body: c.overview_body,
          price_per_day: (priceRow as any)?.price ?? 0,
          image_url: c.image_url,
          images: (c.camper_images ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((i: any) => i.url),
          available: c.available,
          year: c.year ?? null,
          gearbox: c.gearbox ?? null,
          fuel_type: c.fuel_type ?? null,
          beds: c.beds ?? null,
          type: c.type ?? '',
          features,
        })
      }
      setLoading(false)
    }
    if (slug) load()
  }, [slug])

  useEffect(() => {
    if (lightboxIndex === null) return
    const len = camper ? [camper.image_url, ...(camper.images ?? [])].filter(Boolean).length : 1
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxIndex(null)
      if (e.key === 'ArrowLeft') setLightboxIndex(i => i !== null ? (i - 1 + len) % len : null)
      if (e.key === 'ArrowRight') setLightboxIndex(i => i !== null ? (i + 1) % len : null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightboxIndex, camper])

  if (loading) return (
    <>
      <PageHeader />
      <div className="max-w-[1300px] mx-auto px-10 py-20 text-center text-[#888]">Betöltés...</div>
    </>
  )

  if (!camper) return (
    <>
      <PageHeader />
      <div className="max-w-[1300px] mx-auto px-10 py-20 text-center text-[#888]">Az autó nem található.</div>
    </>
  )

  const allImages = [camper.image_url, ...(camper.images ?? [])].filter(Boolean) as string[]
  const hasFeature = (name: string) => camper.features.some(f => f.name === name)
  const top3 = camper.features.filter(f => f.highlight_title).slice(0, 3)
  const overviewLines = camper.overview_body ? camper.overview_body.split('\n').filter(Boolean) : []

  const quickItems = [
    camper.beds != null       ? { icon: '👥', label: `${camper.beds} fő` }             : null,
    camper.gearbox            ? { icon: '⚙️', label: camper.gearbox }                   : null,
    camper.fuel_type          ? { icon: '⛽', label: camper.fuel_type }                 : null,
    camper.year               ? { icon: '📅', label: `${camper.year}` }                 : null,
    hasFeature('Zuhanyzó')        ? { icon: '🚿', label: 'Saját zuhanyzó' }     : null,
    hasFeature('Kazettás WC')     ? { icon: '🚽', label: 'Saját WC' }           : null,
    hasFeature('Napelem')         ? { icon: '☀️', label: 'Napelemes rendszer' } : null,
    hasFeature('Lakótéri klíma')  ? { icon: '❄️', label: 'Légkondicionáló' }   : null,
  ].filter(Boolean) as { icon: string; label: string }[]

  const featuresByCategory = camper.features.reduce((acc, f) => {
    const key = f.category_name ?? 'Egyéb'
    const sort = f.category_sort ?? 99
    if (!acc[key]) acc[key] = { items: [], sort }
    acc[key].items.push(f.name)
    return acc
  }, {} as Record<string, { items: string[]; sort: number }>)

  const sortedCategories = Object.entries(featuresByCategory)
    .sort(([, a], [, b]) => a.sort - b.sort)

  const techSpecs = [
    camper.year        ? { label: 'Évjárat',   value: String(camper.year) } : null,
    camper.fuel_type   ? { label: 'Üzemanyag', value: camper.fuel_type }    : null,
    camper.gearbox     ? { label: 'Váltó',     value: camper.gearbox }      : null,
    camper.beds != null ? { label: 'Férőhely', value: `${camper.beds} fő` } : null,
    hasFeature('Napelem')        ? { label: 'Napelem', value: 'Igen' }       : null,
    hasFeature('Lakótéri klíma') ? { label: 'Klíma',   value: 'Igen' }      : null,
    camper.type        ? { label: 'Típus',     value: camper.type }         : null,
  ].filter(Boolean) as { label: string; value: string }[]

  const specStrip = [
    camper.beds != null  ? { icon: '👥', value: `${camper.beds} fő`, label: 'Férőhely' }          : null,
    camper.gearbox       ? { icon: '⚙️', value: camper.gearbox,       label: 'Váltó' }             : null,
    camper.fuel_type     ? { icon: '⛽', value: camper.fuel_type,      label: 'Üzemanyag' }         : null,
    camper.year          ? { icon: '📅', value: String(camper.year),   label: 'Évjárat' }           : null,
    hasFeature('Zuhanyzó')       ? { icon: '🚿', value: 'Saját', label: 'Zuhanyzó' }       : null,
    hasFeature('Kazettás WC')    ? { icon: '🚽', value: 'Saját', label: 'WC' }             : null,
    hasFeature('Napelem')        ? { icon: '☀️', value: 'Igen',  label: 'Napelem' }        : null,
    hasFeature('Lakótéri klíma') ? { icon: '❄️', value: 'Igen',  label: 'Légkondi' }      : null,
  ].filter(Boolean) as { icon: string; value: string; label: string }[]

  const thumbImages = allImages.slice(1, 5)
  const hiddenCount = allImages.length - 1 - thumbImages.length
  const storyIdx1 = Math.min(1, allImages.length - 1)

  return (
    <>
      <PageHeader />

      {/* ── HERO ──────────────────────────────────────────────────── */}
      <div className="max-w-[1300px] mx-auto px-4 md:px-10 pt-12 pb-10">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_300px] gap-8 md:gap-10 items-start">

          <div>
            <div className="relative h-[260px] md:h-[480px] rounded-2xl overflow-hidden mb-3 group" {...heroSwipe}>
              <button
                onClick={() => setLightboxIndex(heroIndex)}
                className="block w-full h-full cursor-zoom-in"
              >
                <Image
                  src={allImages[heroIndex]}
                  alt={camper.name}
                  fill
                  className="object-cover transition-all duration-500"
                  priority
                />
              </button>

              {allImages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setHeroIndex(i => (i - 1 + allImages.length) % allImages.length) }}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#111] shadow transition-all opacity-0 group-hover:opacity-100"
                >
                  ‹
                </button>
              )}

              {allImages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setHeroIndex(i => (i + 1) % allImages.length) }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-white/80 hover:bg-white flex items-center justify-center text-[#111] shadow transition-all opacity-0 group-hover:opacity-100"
                >
                  ›
                </button>
              )}

              {allImages.length > 1 && (
                <span className="absolute bottom-3 right-3 bg-black/50 text-white text-xs px-2.5 py-1 rounded-full">
                  {heroIndex + 1} / {allImages.length}
                </span>
              )}
            </div>

            {thumbImages.length > 0 && (
              <div className={`grid gap-2 mb-7 ${
                thumbImages.length === 1 ? 'grid-cols-1' :
                thumbImages.length === 2 ? 'grid-cols-2' :
                thumbImages.length === 3 ? 'grid-cols-3' : 'grid-cols-4'
              }`}>
                {thumbImages.map((img, i) => {
                  const isLast = i === thumbImages.length - 1
                  const showOverlay = isLast && hiddenCount > 0
                  const imgIndex = i + 1
                  const isActive = heroIndex === imgIndex
                  return (
                    <button
                      key={i}
                      onClick={() => showOverlay ? setLightboxIndex(imgIndex) : setHeroIndex(imgIndex)}
                      className={`block relative h-16 md:h-28 rounded-xl overflow-hidden group transition-all ${isActive ? 'ring-2 ring-[#1a3a2a]' : 'opacity-70 hover:opacity-100'}`}
                    >
                      <Image
                        src={img}
                        alt=""
                        fill
                        className="object-cover group-hover:scale-[1.03] transition-transform duration-500"
                      />
                      {showOverlay && (
                        <div className="absolute inset-0 bg-black/55 flex flex-col items-center justify-center rounded-xl">
                          <span className="text-white text-2xl font-bold leading-none">+{hiddenCount}</span>
                          <span className="text-white/75 text-xs mt-1 tracking-wide">fotó</span>
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>
            )}

            <h1 className="text-[2.6rem] font-extrabold text-[#111] mb-3 leading-tight tracking-tight text-center md:text-left">
              {camper.name}
            </h1>
            {camper.description && (
              <p className="text-[#444] text-base leading-relaxed mb-5 text-center md:text-left">
                {camper.description}
              </p>
            )}
          </div>

          <div className="sticky top-24">
            <div className="bg-white border border-[#ece9e4] rounded-2xl p-5 shadow-sm">
              <p className="text-[11px] tracking-[0.18em] uppercase text-[#888] mb-1">Bérleti díj</p>
              <div className="flex items-baseline gap-1.5 mb-5">
                <span className="text-3xl font-extrabold text-[#111]">
                  {camper.price_per_day.toLocaleString('hu-HU')} Ft
                </span>
                <span className="text-[#888] text-sm">/ nap</span>
              </div>
              <div className="flex flex-col gap-2.5 mb-4">
                <Link
                  href="/kapcsolat"
                  className="w-full bg-[#1a3a2a] text-white text-sm font-semibold py-3 rounded-xl text-center tracking-wide hover:bg-[#2d4a2d] transition-colors"
                >
                  Ajánlatkérés →
                </Link>
                <Link
                  href="/kapcsolat"
                  className="w-full border border-[#e0ddd9] text-[#444] text-sm py-2.5 rounded-xl text-center hover:border-[#999] transition-colors"
                >
                  Kérdésed van?
                </Link>
              </div>
              <p className="text-xs text-[#777] text-center leading-relaxed">
                Ingyenes lemondás 7 napig<br />Magyar ügyfélszolgálat
              </p>
            </div>
            <div className="mt-3 text-center">
              <Link href="/katalogus" className="text-[13px] text-[#777] hover:text-[#333] transition-colors">
                ← Vissza a katalógushoz
              </Link>
            </div>
          </div>

        </div>
      </div>

      {/* ── SPEC STRIP ────────────────────────────────────────────── */}
      {specStrip.length > 0 && (
        <div className="border-y border-[#ece9e4] py-4 mb-6 md:mb-10">
          <div className="max-w-[1300px] mx-auto px-4 md:px-10">
            <div className="flex flex-wrap justify-center">
              {specStrip.map(item => (
                <div key={item.label} className="flex flex-col items-center gap-0.5 py-2 px-3 w-1/4 md:flex-1">
                  <span className="text-sm leading-none mb-0.5">{item.icon}</span>
                  <span className="text-xs font-semibold text-[#111]">{item.value}</span>
                  <span className="text-[9px] text-[#888] uppercase tracking-wide">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── NAPTÁR ────────────────────────────────────────────────── */}
      <div className="max-w-[1300px] mx-auto px-4 md:px-10 mb-8 md:mb-16 pt-4 md:pt-10">
        <AvailabilityCalendar camperSlug={camper.slug} />
      </div>

      {/* ── MŰSZAKI ADATOK ────────────────────────────────────────── */}
      {techSpecs.length > 0 && (
        <div className="max-w-[1300px] mx-auto px-4 md:px-10 mb-16 border-t border-[#ece9e4] pt-10">
          <span className="block text-[11px] tracking-[0.22em] uppercase text-[#666] mb-7 text-center md:text-left">
            Műszaki adatok
          </span>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-6">
            {techSpecs.map(spec => (
              <div key={spec.label} className="text-center md:text-left">
                <p className="text-[11px] text-[#888] uppercase tracking-wider mb-1.5">{spec.label}</p>
                <p className="text-[15px] font-semibold text-[#111]">{spec.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="max-w-[1300px] mx-auto px-4 md:px-10">

        {/* ── STORY — kép + szöveg ──────────────────────────────── */}
        {allImages.length > 1 && (camper.overview_title || overviewLines.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center mb-16 md:mb-24">
            <button
              onClick={() => setLightboxIndex(storyIdx1)}
              className="block relative h-[260px] md:h-[480px] rounded-2xl overflow-hidden cursor-zoom-in group"
            >
              <Image
                src={allImages[storyIdx1]}
                alt=""
                fill
                style={{ objectFit: 'cover', objectPosition: 'center' }}
                className="group-hover:scale-[1.02] transition-transform duration-700"
              />
            </button>
            <div className="text-center md:text-left">
              <span className="block text-[11px] tracking-[0.22em] uppercase text-[#777] mb-4">A jármű</span>
              {camper.overview_title && (
                <h2 className="text-[1.9rem] font-extrabold text-[#111] mb-5 leading-tight tracking-tight">
                  {camper.overview_title}
                </h2>
              )}
              <div className="space-y-3 text-[#444] text-[15px] leading-relaxed">
                {overviewLines.map((line, i) => <p key={i}>{line}</p>)}
              </div>
            </div>
          </div>
        )}

        {/* ── FELSZERELTSÉG ─────────────────────────────────────── */}
        {sortedCategories.length > 0 && (
          <section className="mb-16 border-t border-[#ece9e4] pt-12">
            <p className="text-[11px] tracking-[0.22em] uppercase text-[#666] mb-12 text-center">
              Felszereltség
            </p>
            <div className="space-y-9 max-w-3xl mx-auto">
              {sortedCategories.map(([catName, { items }]) => (
                <div key={catName}>
                  <div className="flex items-center gap-5 mb-4">
                    <span className="text-[10px] tracking-[0.28em] uppercase text-[#aaa] whitespace-nowrap font-medium">
                      {catName}
                    </span>
                    <span className="flex-1 h-px bg-[#ece9e4]" />
                  </div>
                  <div className="flex flex-wrap gap-x-6 gap-y-2.5">
                    {items.map(name => (
                      <span key={name} className="text-[14px] text-[#333] leading-snug">{name}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

      </div>

      {/* ── EXTRÁK ───────────────────────────────────────────────── */}
      <div className="max-w-[1300px] mx-auto px-4 md:px-10 py-14 border-t border-[#ece9e4]">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-center">
          <div className="text-center md:text-left">
            <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Személyre szabva</span>
            <h2 className="text-2xl font-extrabold text-[#111] mb-4 leading-tight">
              Pakold fel az autót mindazzal,<br />amire szükséged van
            </h2>
            <div className="space-y-3 text-[#555] text-sm leading-relaxed mb-8">
              <p>
                Egy igazán emlékezetes út nem csak a lakóautóról szól — hanem arról is, hogy mit viszel magaddal. Kerékpárral felfedezheted az eldugott ösvényeket, elektromos rollerrel besiklhatsz a kisvárosokba, egy horgászfelszereléssel pedig a tó partján töltheted a reggelt.
              </p>
              <p>
                Mi mindent biztosítunk, amire szükséged lehet: tetősátrat az extra hálóhelynek, kerti bútort az esti megállókhoz, barbecue-t a közös grillezéshez. Csak szólj előre, és felkészítjük az autót az utadhoz.
              </p>
            </div>
            <Link
              href="/extrak"
              className="inline-block bg-[#1a3a2a] text-white text-sm font-semibold px-6 py-3 rounded-xl tracking-wide hover:bg-[#2d4a2d] transition-colors"
            >
              Szabd testre az utadat →
            </Link>
          </div>
          <div className="relative h-[360px] rounded-2xl overflow-hidden">
            <Image
              src="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=800&q=80"
              alt="Extra felszerelés"
              fill
              className="object-cover"
            />
          </div>
        </div>
      </div>

      {/* ── AJÁNLOTT ÚTVONALAK ───────────────────────────────────── */}
      <div className="py-14 border-t border-[#ece9e4]">
        <div className="text-center mb-8 px-4 md:px-10">
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Nem tudod, merre indulj?</span>
          <h2 className="text-2xl font-extrabold text-[#111]">Fedezd fel Európa legszebb útvonalait ezzel a lakóautóval.</h2>
        </div>
        <TripStack trips={DISPLAY_TRIPS} />
      </div>

      {/* ── CTA ───────────────────────────────────────────────────── */}
      <section className="relative flex items-center justify-center text-white py-24 overflow-hidden">
        <Image src="/cta-katalogus.png" alt="" fill className="object-cover object-center" />
        <div className="absolute inset-0 bg-black/45" />
        <div className="relative z-10 px-6 max-w-[580px] mx-auto text-center">
          <h2 className="text-3xl font-extrabold leading-tight mb-3">
            Van még kérdésed?
          </h2>
          <p className="text-white/80 text-sm leading-relaxed mb-6">
            Böngészd át a leggyakoribb kérdéseket, vagy keress minket közvetlenül — szívesen segítünk a foglalásban.
          </p>
          <div className="flex flex-col sm:flex-row gap-2.5 justify-center">
            <Link
              href="/gyik"
              className="inline-block bg-white text-[#111] font-semibold text-sm px-7 py-3 rounded-xl tracking-wide hover:bg-white/90 transition-colors"
            >
              Gyakori kérdések
            </Link>
            <Link
              href="/kapcsolat"
              className="inline-block border border-white/50 text-white font-semibold text-sm px-7 py-3 rounded-xl hover:border-white hover:bg-white/10 transition-colors"
            >
              Írj nekünk
            </Link>
          </div>
        </div>
      </section>

      {/* ── LIGHTBOX ──────────────────────────────────────────────── */}
      {lightboxIndex !== null && (
        <div
          className="fixed inset-0 z-50 bg-black/92 flex items-center justify-center"
          onClick={() => setLightboxIndex(null)}
        >
          <button
            onClick={() => setLightboxIndex(null)}
            className="absolute top-5 right-5 text-white/60 hover:text-white text-3xl leading-none z-10"
          >
            ✕
          </button>
          <span className="absolute top-5 left-1/2 -translate-x-1/2 text-white/60 text-xs tracking-widest uppercase">
            {lightboxIndex + 1} / {allImages.length}
          </span>
          {allImages.length > 1 && (
            <button
              onClick={e => {
                e.stopPropagation()
                setLightboxIndex(i => i !== null ? (i - 1 + allImages.length) % allImages.length : null)
              }}
              className="absolute left-4 text-white/50 hover:text-white text-4xl px-3 py-6 z-10"
            >
              ‹
            </button>
          )}
          <div
            className="relative w-full max-w-5xl mx-16 aspect-[16/10]"
            onClick={e => e.stopPropagation()}
          >
            <Image
              src={allImages[lightboxIndex]}
              alt={camper.name}
              fill
              className="object-contain"
              sizes="(max-width: 1280px) 100vw, 1280px"
            />
          </div>
          {allImages.length > 1 && (
            <button
              onClick={e => {
                e.stopPropagation()
                setLightboxIndex(i => i !== null ? (i + 1) % allImages.length : null)
              }}
              className="absolute right-4 text-white/50 hover:text-white text-4xl px-3 py-6 z-10"
            >
              ›
            </button>
          )}
        </div>
      )}
    </>
  )
}
