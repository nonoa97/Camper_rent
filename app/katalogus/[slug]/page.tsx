import { notFound } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { createClient } from '@supabase/supabase-js'
import AvailabilityCalendar from '@/components/sections/AvailabilityCalendar'
import TripStack from '@/components/sections/TripStack'
import { resolveCurrentSeason, type SeasonRow } from '@/lib/season'

export const dynamic = 'force-dynamic'

// Anonymous read-only client — campers are public data
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
)

const DISPLAY_TRIPS = [
  { id: '1', name: 'Dolomitok körút',   days: 5,  image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80' },
  { id: '2', name: 'Garda-tó környéke', days: 7,  image: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80' },
  { id: '3', name: 'Szlovén Alpok',     days: 4,  image: 'https://images.unsplash.com/photo-1501854140801-50d01698950b?w=800&q=80' },
  { id: '5', name: 'Horvát tengerpart', days: 8,  image: 'https://images.unsplash.com/photo-1516483638261-f4dbaf036963?w=800&q=80' },
  { id: '6', name: 'Norvég fjordok',    days: 14, image: 'https://images.unsplash.com/photo-1601439678777-b2b3c56fa627?w=800&q=80' },
]

interface FeatureGroup {
  category: string
  sort: number
  items: string[]
}

interface CamperDetail {
  id: string
  name: string
  slug: string
  description: string | null
  overview_title: string | null
  overview_body: string | null
  price_per_day: number
  season_name: string
  seasonPrices: { id: string; name: string; range: string; price: number; current: boolean }[]
  discounts: { minDays: number; pct: number }[]
  images: string[]
  available: boolean
  beds: number | null
  type: string
  year: number | null
  gearbox: string | null
  fuel_type: string | null
  featureGroups: FeatureGroup[]
}

const HU_MONTHS_ABBR = ['jan.', 'febr.', 'márc.', 'ápr.', 'máj.', 'jún.', 'júl.', 'aug.', 'szept.', 'okt.', 'nov.', 'dec.']
function formatMd(md: string): string {
  const [m, d] = md.split('-').map(Number)
  return `${HU_MONTHS_ABBR[m - 1] ?? ''} ${d}.`
}

async function getCamperBySlug(slug: string): Promise<CamperDetail | null> {
  const { data: c } = await supabase
    .from('campers')
    .select(`
      id, name, slug, description, overview_title, overview_body,
      image_url, available, year, gearbox, fuel_type, type, beds,
      camper_features(features(name, category_id, feature_categories(name, sort_order))),
      camper_images(url, sort_order)
    `)
    .eq('slug', slug)
    .single()

  if (!c) return null

  // Aktuális szezon a mai dátum alapján (a seasons tábla from_md..to_md tartományaiból,
  // évhatárt is kezelve), majd annak az ára — nem fixen a főszezon.
  const { data: seasonRows } = await supabase
    .from('seasons')
    .select('id, name, from_md, to_md, sort_order')

  const { id: seasonId, name: seasonName } = resolveCurrentSeason((seasonRows ?? []) as SeasonRow[])

  const { data: priceRows } = await supabase
    .from('camper_prices')
    .select('season_id, price')
    .eq('camper_id', c.id)
  const prices = (priceRows ?? []) as { season_id: string; price: number }[]
  const priceRow = prices.find(p => p.season_id === seasonId) ?? prices[0]

  // Összes szezon ára (sort_order szerint), az aktuális megjelölve
  const seasonPrices = ((seasonRows ?? []) as (SeasonRow & { sort_order: number })[])
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map(s => ({
      id: s.id,
      name: s.name,
      range: `${formatMd(s.from_md)} – ${formatMd(s.to_md)}`,
      price: prices.find(p => p.season_id === s.id)?.price ?? 0,
      current: s.id === seasonId,
    }))

  // Aktív hosszú-tartózkodási kedvezmények (több is lehet) min_days szerint
  const { data: tierRows } = await supabase
    .from('long_stay_tiers')
    .select('min_days, discount_pct, active')
    .eq('active', true)
    .order('min_days')
  const discounts = ((tierRows ?? []) as { min_days: number; discount_pct: number }[])
    .map(t => ({ minDays: t.min_days, pct: t.discount_pct }))

  const images = [
    c.image_url,
    ...((c.camper_images ?? []) as { url: string; sort_order: number }[])
      .sort((a, b) => a.sort_order - b.sort_order)
      .map(i => i.url),
  ].filter(Boolean) as string[]

  const groups: Record<string, FeatureGroup> = {}
  for (const cf of (c.camper_features ?? []) as any[]) {
    const f = cf.features
    if (!f?.name) continue
    const category = f.feature_categories?.name ?? 'Egyéb'
    const sort = f.feature_categories?.sort_order ?? 99
    if (!groups[category]) groups[category] = { category, sort, items: [] }
    groups[category].items.push(f.name)
  }
  const featureGroups = Object.values(groups).sort((a, b) => a.sort - b.sort)

  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    overview_title: c.overview_title,
    overview_body: c.overview_body,
    price_per_day: priceRow?.price ?? 0,
    season_name: seasonName,
    seasonPrices,
    discounts,
    images,
    available: c.available,
    beds: c.beds ?? null,
    type: c.type ?? '',
    year: c.year ?? null,
    gearbox: c.gearbox ?? null,
    fuel_type: c.fuel_type ?? null,
    featureGroups,
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const camper = await getCamperBySlug(slug)
  if (!camper) return {}
  return {
    title: `${camper.name} — Lakóautó bérlés — VanLife Europe`,
    description: camper.description ?? undefined,
  }
}

function BookingCard({ camper }: { camper: CamperDetail }) {
  return (
    <div className="bg-white border border-[#e6e4df] rounded-2xl p-6 shadow-sm">
      <p className="text-[10px] tracking-[0.2em] uppercase text-[#bbb] mb-2">Bérleti díj</p>
      <p className="text-3xl font-extrabold text-[#111] mb-1 leading-none">
        {camper.price_per_day.toLocaleString('hu-HU')} Ft
        <span className="text-sm font-normal text-[#aaa] ml-1.5">/ nap</span>
      </p>
      <p className="text-[#aaa] text-xs mb-5">{camper.season_name} ár · az időszaktól függően változhat</p>

      <div className="flex flex-col gap-2.5">
        <Link
          href="/kapcsolat"
          className="w-full bg-[#1a3a2a] text-white text-sm font-semibold py-3 rounded-full text-center tracking-wide hover:bg-[#2d4a2d] transition-colors"
        >
          Ajánlatkérés →
        </Link>
        <Link
          href="/kapcsolat"
          className="w-full border border-[#e6e4df] text-[#444] text-sm py-2.5 rounded-full text-center hover:border-[#999] transition-colors"
        >
          Kérdésed van?
        </Link>
      </div>

      <div className="border-t border-[#e6e4df] mt-5 pt-4 space-y-1.5">
        <p className="text-xs text-[#777] flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[#1a3a2a]" /> Ingyenes lemondás 7 napig
        </p>
        <p className="text-xs text-[#777] flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[#1a3a2a]" /> Magyar ügyfélszolgálat
        </p>
        <p className="text-xs text-[#777] flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-[#1a3a2a]" /> Korlátlan kilométer
        </p>
      </div>
    </div>
  )
}

export default async function CamperDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const camper = await getCamperBySlug(slug)
  if (!camper) notFound()

  const meta: string[] = [
    camper.beds != null ? `${camper.beds} fő` : '',
    camper.type,
    camper.gearbox ?? '',
    camper.fuel_type ?? '',
    camper.year ? String(camper.year) : '',
  ].filter(Boolean)

  const specsRows: [string, string][] = [
    camper.beds != null ? ['Férőhely', `${camper.beds} fő`] : null,
    camper.type ? ['Típus', camper.type] : null,
    camper.gearbox ? ['Váltó', camper.gearbox] : null,
    camper.fuel_type ? ['Üzemanyag', camper.fuel_type] : null,
    camper.year ? ['Évjárat', String(camper.year)] : null,
  ].filter(Boolean) as [string, string][]

  const heroImage = camper.images[0] ?? '/menu_pic.png'
  const sideImages = camper.images.slice(1, 5)
  const overviewLines = camper.overview_body ? camper.overview_body.split('\n').filter(Boolean) : []

  return (
    <>
      {/* Gallery */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 pt-8">
        {/* Mobile: single hero */}
        <div className="md:hidden relative aspect-[4/3] rounded-2xl overflow-hidden shadow-sm">
          <Image src={heroImage} alt={camper.name} fill sizes="100vw" className="object-cover" priority />
        </div>

        {/* Desktop: mosaic */}
        <div className="hidden md:grid grid-cols-[1.5fr_1fr] gap-2 h-[460px] rounded-2xl overflow-hidden">
          <div className="relative">
            <Image src={heroImage} alt={camper.name} fill sizes="60vw" className="object-cover" priority />
          </div>
          {sideImages.length > 0 && (
            <div className="grid grid-rows-2 grid-cols-2 gap-2">
              {sideImages.map((src, i) => (
                <div key={i} className="relative">
                  <Image src={src} alt={`${camper.name} kép ${i + 2}`} fill sizes="25vw" className="object-cover" />
                </div>
              ))}
              {/* fill empty cells with a soft surface so the grid stays even */}
              {Array.from({ length: Math.max(0, 4 - sideImages.length) }).map((_, i) => (
                <div key={`fill-${i}`} className="bg-[#f0ede7]" />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Title */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 pt-8 pb-6">
        <Link href="/katalogus" className="text-[13px] text-[#999] hover:text-[#333] transition-colors mb-4 inline-block">
          ← Vissza a katalógushoz
        </Link>
        <p className="text-[11px] tracking-[0.2em] uppercase text-[#888] mb-2">
          Lakóautó{camper.type ? ` · ${camper.type}` : ''}
        </p>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#111] leading-tight mb-3">
          {camper.name}
        </h1>
        {meta.length > 0 && (
          <p className="text-[#666] text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
            {meta.map((m, i) => (
              <span key={m} className="flex items-center gap-2">
                {i > 0 && <span className="text-[#ccc]">·</span>}
                {m}
              </span>
            ))}
          </p>
        )}
      </section>

      {/* Szezonális díjak — teljes szélességű sáv */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 pb-6">
        <div className="bg-[#f7f6f3] rounded-2xl p-6 md:p-8">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-4">Szezonális díjak</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            {camper.seasonPrices.map(s => (
              <div
                key={s.id}
                className={`rounded-xl px-5 py-4 flex items-center justify-between gap-3 sm:block ${
                  s.current ? 'bg-[#1a3a2a] text-white' : 'bg-white border border-[#e6e4df]'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className={`text-[11px] tracking-[0.12em] uppercase ${s.current ? 'text-white' : 'text-[#111]'}`}>
                      {s.name}
                    </p>
                    {s.current && (
                      <span className="text-[9px] uppercase tracking-wide bg-white/15 text-white px-1.5 py-0.5 rounded-full">most</span>
                    )}
                  </div>
                  <p className={`text-[11px] mt-0.5 ${s.current ? 'text-white/55' : 'text-[#aaa]'}`}>{s.range}</p>
                </div>
                <p className={`text-lg font-extrabold leading-none whitespace-nowrap sm:mt-2.5 ${s.current ? 'text-white' : 'text-[#111]'}`}>
                  {s.price.toLocaleString('hu-HU')} Ft
                  <span className={`text-xs font-normal ${s.current ? 'text-white/50' : 'text-[#aaa]'}`}> / nap</span>
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Body: content + sticky booking card */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 pb-16">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 lg:gap-14 items-start">

          {/* Main content */}
          <div className="order-2 lg:order-1 min-w-0">

            {/* Description / overview */}
            {(camper.description || camper.overview_title || overviewLines.length > 0) && (
              <div className="pb-10 border-b border-[#e6e4df]">
                {camper.overview_title && (
                  <h2 className="text-2xl font-black text-[#111] mb-4 leading-tight">{camper.overview_title}</h2>
                )}
                {camper.description && (
                  <p className="text-[#555] text-base leading-relaxed mb-3">{camper.description}</p>
                )}
                <div className="space-y-3 text-[#555] text-[15px] leading-relaxed">
                  {overviewLines.map((line, i) => <p key={i}>{line}</p>)}
                </div>
              </div>
            )}

            {/* Spec table */}
            {specsRows.length > 0 && (
              <div className="py-10">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-5">Műszaki adatok</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 sm:gap-y-px">
                  {specsRows.map(([label, value]) => (
                    <div key={label} className="flex items-center justify-between py-3 border-b border-[#e6e4df]">
                      <span className="text-[#999] text-sm">{label}</span>
                      <span className="text-[#111] text-sm font-semibold text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Features */}
            {camper.featureGroups.length > 0 && (
              <div className="py-10 border-b border-[#e6e4df]">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-7">Felszereltség</p>
                <div className="space-y-8">
                  {camper.featureGroups.map(group => (
                    <div key={group.category}>
                      <div className="flex items-center gap-5 mb-4">
                        <span className="text-[10px] tracking-[0.28em] uppercase text-[#aaa] whitespace-nowrap font-medium">
                          {group.category}
                        </span>
                        <span className="flex-1 h-px bg-[#e6e4df]" />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5">
                        {group.items.map(name => (
                          <span key={name} className="text-[14px] text-[#333] leading-snug">{name}</span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>

          {/* Sticky booking card */}
          <aside className="order-1 lg:order-2 lg:sticky lg:top-24">
            <BookingCard camper={camper} />
          </aside>

        </div>
      </section>

      {/* Availability (full width) */}
      <section className="bg-white border-t border-[#e6e4df] py-14 px-4 md:px-10">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-2">Foglaltság</p>
          <h2 className="text-2xl md:text-3xl font-black text-[#111] mb-8">Mikor szabad ez az autó?</h2>
          <AvailabilityCalendar camperSlug={camper.slug} />
        </div>
      </section>

      {/* Hosszú bérlés kedvezmény — promo, a naptár alatt (több aktív is lehet) */}
      {camper.discounts.length > 0 && (
        <section className="py-14 px-4 md:px-10 bg-[#1a3a2a]">
          <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-white/50 mb-3">Hosszú bérlés kedvezmény</p>
              <h2 className="text-2xl md:text-3xl font-black text-white mb-3 leading-tight">
                Minél tovább maradsz, annál olcsóbb
              </h2>
              <p className="text-white/70 text-sm md:text-base leading-relaxed max-w-md">
                A foglalt éjszakák száma alapján automatikusan levonjuk a kedvezményt — nincs kód, nincs feltétel.
                Egy hosszabb út így napról napra kedvezőbb.
              </p>
            </div>
            <div className="flex gap-3 sm:gap-4 lg:justify-end">
              {camper.discounts.map(d => (
                <div
                  key={d.minDays}
                  className="flex-1 lg:flex-none lg:w-40 bg-white/5 border border-white/10 rounded-2xl px-5 py-6 text-center"
                >
                  <p className="text-3xl md:text-4xl font-black text-white leading-none">−{d.pct}%</p>
                  <p className="text-xs text-white/60 mt-2">{d.minDays}+ éjszaka</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Extra equipment */}
      <section className="bg-white border-t border-[#e6e4df] py-14 px-4 md:px-10">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-center">
          <div className="order-2 lg:order-1">
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-3">Személyre szabva</p>
            <h2 className="text-2xl md:text-3xl font-black text-[#111] mb-5 leading-tight">
              Pakold fel az autót, ahogy neked kell
            </h2>
            <div className="space-y-3 text-[#555] text-[15px] leading-relaxed mb-7">
              <p>
                Egy igazán emlékezetes út nem csak a lakóautóról szól, hanem arról is, mit viszel magaddal.
                Kerékpár az eldugott ösvényekhez, tetősátor az extra hálóhelynek, kerti bútor az esti megállókhoz.
              </p>
              <p>
                Az extrákat előre kérheted — mi felkészítjük az autót, mire átveszed.
              </p>
            </div>
            <Link
              href="/extrak"
              className="inline-flex items-center gap-2 bg-[#1a3a2a] text-white text-sm font-semibold px-6 py-3 rounded-full tracking-wide hover:bg-[#2d4a2d] transition-colors"
            >
              Extrák megtekintése <span aria-hidden>→</span>
            </Link>
          </div>
          <div className="order-1 lg:order-2 relative h-[280px] lg:h-[360px] rounded-2xl overflow-hidden shadow-sm">
            <Image
              src="https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=900&q=80"
              alt="Extra felszerelés lakóautóhoz"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {/* Recommended trips */}
      <section className="py-14 bg-[#f7f6f3] border-y border-[#e6e4df]">
        <div className="text-center mb-8 px-4 md:px-10">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-2">Ehhez az autóhoz</p>
          <h2 className="text-2xl md:text-3xl font-black text-[#111]">
            Fedezd fel Európa legszebb útvonalait.
          </h2>
        </div>
        <TripStack trips={DISPLAY_TRIPS} />
      </section>

      {/* CTA band */}
      <section className="py-12 px-4 md:px-10" style={{ background: '#1a3a2a' }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white text-center md:text-left">
            Készen állsz az indulásra?{' '}
            <em className="not-italic font-light text-white/60">Kérj ajánlatot pár perc alatt.</em>
          </h2>
          <Link
            href="/kapcsolat"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#1a3a2a] text-sm font-semibold hover:bg-[#f0f0f0] transition-colors"
          >
            Ajánlatkérés <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  )
}
