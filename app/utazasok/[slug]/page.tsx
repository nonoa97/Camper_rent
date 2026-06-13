import { notFound, redirect } from 'next/navigation'
import Image from 'next/image'
import Link from 'next/link'
import { getTripBySlug, getTripSlugs } from '@/lib/supabase-trips'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import TripCTA from '@/components/sections/TripCTA'

export const dynamic = 'force-dynamic'

export async function generateStaticParams() {
  const slugs = await getTripSlugs()
  return slugs.map(slug => ({ slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const trip = await getTripBySlug(slug)
  if (!trip) return {}
  return {
    title: `${trip.title} — ${trip.days} napos útvonal — VanLife Europe`,
    description: trip.description,
  }
}

export default async function TripDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const trip = await getTripBySlug(slug)
  if (!trip) notFound()

  // If user already has access → redirect directly to the full plan
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) {
    const { data: purchase } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('trip_id', trip.id)
      .maybeSingle()
    if (purchase) redirect(`/utazasok/${slug}/terv`)
  }

  const specsRows: [string, string][] = [
    ['Időtartam', `${trip.days} nap / ${trip.nights} éj`],
    ['Táv', `${trip.km.toLocaleString('hu-HU')} km`],
    ['Indulás', trip.from],
    ['Érkezés', trip.to],
    ['Nehézség', trip.difficulty],
    ['Legjobb időszak', trip.bestSeason],
  ]

  return (
    <>
      {/* Hero */}
      <section className="pt-10 pb-14 px-4 md:px-10 bg-[#f7f6f3] border-b border-[#e6e4df]">
        <div className="max-w-[1200px] mx-auto grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-16 items-start">

          {/* Left: info */}
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#888] mb-3">
              Útvonal {String(trip.num).padStart(2, '0')} · {trip.country}
            </p>

            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#111] mb-5 leading-tight">
              {trip.title}
            </h1>

            <p className="text-[#555] text-base leading-relaxed mb-8 max-w-[52ch]">
              {trip.description}
            </p>

            {/* Spec table */}
            <div className="border-t border-[#e6e4df]">
              {specsRows.map(([label, value]) => (
                <div key={label} className="flex items-center justify-between py-3 border-b border-[#e6e4df]">
                  <span className="text-[#999] text-sm">{label}</span>
                  <span className="text-[#111] text-sm font-semibold text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Right: gallery */}
          <div>
            <div className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden mb-3 shadow-sm">
              <Image
                src={trip.heroImage}
                alt={trip.title}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
                priority
              />
            </div>
            <div className="grid grid-cols-4 gap-2">
              {trip.thumbImages.map((src, i) => (
                <div key={i} className="relative h-[68px] rounded-xl overflow-hidden">
                  <Image
                    src={src}
                    alt={`${trip.title} kép ${i + 2}`}
                    fill
                    sizes="120px"
                    className="object-cover"
                  />
                </div>
              ))}
            </div>
            <p className="text-[10px] tracking-[0.1em] uppercase text-[#bbb] mt-2.5">
              <span className="font-bold mr-1.5">01–0{trip.thumbImages.length + 1}</span>
              {trip.country} · {trip.from} → {trip.to}
            </p>

            {/* Plan box */}
            <div className="bg-white rounded-2xl p-6 border border-[#e6e4df] mt-5">
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#bbb] mb-2">Útvonalterv</p>
              <p className="text-2xl font-extrabold text-[#111] mb-1 flex items-baseline gap-2 flex-wrap">
                {trip.isFree ? 'Ingyenes' : `${trip.priceHuf.toLocaleString('hu-HU')} Ft`}
                <span className="text-sm font-normal text-[#aaa]">
                  {trip.isFree ? '— bemutató terv' : '/ terv · PDF + interaktív térkép'}
                </span>
              </p>
              {trip.isFree && (
                <p className="text-[#aaa] text-xs mb-2">A többi útvonal terve 4 900 Ft / terv.</p>
              )}
              <TripCTA slug={trip.slug} isFree={trip.isFree} priceHuf={trip.priceHuf} />
            </div>
          </div>
        </div>
      </section>

      {/* Itinerary */}
      <section className="py-14 px-4 md:px-10 bg-white border-b border-[#e6e4df]" id="terv">
        <div className="max-w-[1200px] mx-auto">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-10">
            <div>
              <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-2">Napi bontás</p>
              <h2 className="text-3xl md:text-4xl font-black text-[#111] leading-tight">
                Az út, napról napra.
              </h2>
            </div>
            <p className="text-[#bbb] text-sm italic pb-1">
              Részlet — az első {trip.itinerary.length} nap
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
            {/* Days */}
            <div className="divide-y divide-[#f0ede7]">
              {trip.itinerary.map((day, i) => (
                <div key={i} className="py-6">
                  <span className="block text-[10px] tracking-[0.18em] uppercase text-[#bbb] mb-2">{day.day}</span>
                  <h4 className="text-base font-extrabold text-[#111] mb-1.5">{day.title}</h4>
                  <p className="text-[#666] text-sm leading-relaxed">{day.desc}</p>
                </div>
              ))}
            </div>

            {/* Side image + stats */}
            <div>
              <div className="relative w-full h-[260px] rounded-2xl overflow-hidden mb-5 shadow-sm">
                <Image
                  src={trip.thumbImages[0]}
                  alt={trip.itinerary[2]?.title ?? trip.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
                {trip.itinerary[2] && (
                  <p className="absolute bottom-3 left-3 text-white text-[10px] tracking-[0.1em] uppercase bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full">
                    <span className="font-bold mr-1.5">03</span>
                    {trip.itinerary[2].title}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-4 gap-3 mb-5">
                {[
                  { val: trip.campings, label: 'Kemping' },
                  { val: trip.sights, label: 'Látnivaló' },
                  { val: trip.ferries, label: 'Komp' },
                  { val: 'PDF', label: '+ térkép' },
                ].map(({ val, label }) => (
                  <div key={label} className="flex flex-col items-center justify-center bg-[#f7f6f3] rounded-xl py-4 px-2">
                    <span className="text-xl font-black text-[#111]">{val}</span>
                    <span className="text-[9px] tracking-[0.1em] uppercase text-[#999] mt-0.5 text-center">{label}</span>
                  </div>
                ))}
              </div>

              <p className="text-[#888] text-sm leading-relaxed">{trip.specNote}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Recommended campers */}
      <section className="py-14 px-4 md:px-10 bg-[#f7f6f3] border-b border-[#e6e4df]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-2">Ehhez az úthoz ajánljuk</p>
          <h2 className="text-2xl md:text-3xl font-black text-[#111] mb-8">
            Ehhez az úthoz ezt a két autót ajánljuk.
          </h2>

          <div className="border border-[#e6e4df] rounded-2xl overflow-hidden bg-white divide-y divide-[#e6e4df]">
            {[
              { num: '01', name: 'Hymer Ayers Rock', meta: 'Kompakt — a keskeny és hegyi utakra ideális', price: '32 900 Ft', slug: 'hymer-ayers-rock' },
              { num: '02', name: 'VW Crafter Offgrid', meta: 'Napelemes — ritkán lakott szakaszokra', price: '36 500 Ft', slug: 'vw-crafter-offgrid' },
            ].map(({ num, name, meta, price, slug: camperSlug }) => (
              <Link
                key={num}
                href={`/katalogus/${camperSlug}`}
                className="flex items-center gap-4 p-5 hover:bg-[#f7f6f3] transition-colors group"
              >
                <span className="text-[11px] font-bold tracking-[0.2em] text-[#ddd] flex-shrink-0 w-7">{num}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-extrabold text-[#111] text-base group-hover:text-[#444] transition-colors">{name}</h3>
                  <p className="text-[#aaa] text-xs mt-0.5">{meta}</p>
                </div>
                <div className="flex-shrink-0 text-right hidden sm:block">
                  <span className="text-[#111] font-semibold text-sm">{price}</span>
                  <span className="text-[#bbb] text-xs font-normal"> / nap-tól</span>
                </div>
                <span className="text-[#ccc] group-hover:text-[#111] transition-colors text-lg flex-shrink-0">→</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="py-12 px-4 md:px-10" style={{ background: '#111' }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">
            {trip.country.split('&')[0].trim()} vár.{' '}
            <em className="not-italic font-light text-white/60">
              {trip.km.toLocaleString('hu-HU')} kilométeren át.
            </em>
          </h2>
          <Link
            href="/katalogus"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#111] text-sm font-semibold hover:bg-[#f0f0f0] transition-colors"
          >
            Autót választok <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  )
}
