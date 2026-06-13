import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { getTripBySlug } from '@/lib/supabase-trips'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export default async function TervPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const trip = await getTripBySlug(slug)
  if (!trip) notFound()

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/utazasok/${slug}`)

  const { data: purchase } = await supabaseAdmin
    .from('purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('trip_id', trip.id)
    .maybeSingle()

  if (!purchase) redirect(`/utazasok/${slug}`)

  const specs: [string, string][] = [
    ['Indulás', trip.from],
    ['Érkezés', trip.to],
    ['Táv', `${trip.km.toLocaleString('hu-HU')} km`],
    ['Nehézség', trip.difficulty],
    ['Legjobb időszak', trip.bestSeason],
    ['Kompok', `${trip.ferries} db`],
  ]

  return (
    <div className="bg-[#f7f6f3] min-h-screen">

      {/* Hero */}
      <section className="relative h-[300px] md:h-[400px] overflow-hidden">
        <Image src={trip.heroImage} alt={trip.title} fill className="object-cover" priority />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 flex flex-col justify-end px-4 md:px-10 pb-10">
          <div className="max-w-[960px] mx-auto w-full">
            <p className="text-[11px] tracking-[0.2em] uppercase text-white/50 mb-3">
              <Link href="/utazasok" className="hover:text-white/80 transition-colors">Útvonalak</Link>
              <span className="mx-2">/</span>
              <Link href={`/utazasok/${slug}`} className="hover:text-white/80 transition-colors">{trip.title}</Link>
              <span className="mx-2">/</span>
              Teljes terv
            </p>
            <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-2">
              {trip.title}
            </h1>
            <p className="text-white/60 text-sm">
              {trip.days} nap · {trip.km.toLocaleString('hu-HU')} km · {trip.country}
            </p>
          </div>
        </div>
      </section>

      <div className="max-w-[960px] mx-auto px-4 md:px-10 py-12">

        {/* PDF CTA */}
        <div className="bg-white border border-[#e6e4df] rounded-2xl p-6 mb-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-extrabold text-[#111] mb-1">PDF letöltés</p>
            <p className="text-[#999] text-sm">Offline elérhető változat — teljes útvonal, térképek, kempingek</p>
          </div>
          <button
            disabled
            className="flex-shrink-0 px-5 py-2.5 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold opacity-30 cursor-not-allowed"
          >
            Hamarosan elérhető
          </button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-12">
          {[
            { val: trip.days, label: 'nap' },
            { val: `${trip.km.toLocaleString('hu-HU')} km`, label: 'teljes táv' },
            { val: trip.campings, label: 'kemping' },
            { val: trip.sights, label: 'látnivaló' },
          ].map(({ val, label }) => (
            <div key={label} className="bg-white border border-[#e6e4df] rounded-2xl p-5 text-center">
              <p className="text-2xl font-black text-[#111]">{val}</p>
              <p className="text-[10px] tracking-[0.15em] uppercase text-[#bbb] mt-1">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-8 items-start">

          {/* Itinerary */}
          <div>
            <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-2">Napi bontás</p>
            <h2 className="text-2xl font-black text-[#111] mb-6">Teljes útvonalterv</h2>

            <div className="space-y-3">
              {trip.itinerary.map((day, i) => (
                <div key={i} className="bg-white border border-[#e6e4df] rounded-2xl p-6">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-9 h-9 rounded-full bg-[#f7f6f3] flex items-center justify-center">
                      <span className="text-xs font-black text-[#bbb]">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] tracking-[0.15em] uppercase text-[#bbb] mb-1">{day.day}</p>
                      <h4 className="font-extrabold text-[#111] mb-2">{day.title}</h4>
                      <p className="text-[#666] text-sm leading-relaxed">{day.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="sticky top-24 space-y-4">
            {/* Specs */}
            <div className="bg-white border border-[#e6e4df] rounded-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[#e6e4df]">
                <p className="text-[10px] tracking-[0.2em] uppercase text-[#bbb]">Útvonal adatok</p>
              </div>
              {specs.map(([label, val]) => (
                <div key={label} className="flex items-center justify-between px-5 py-3 border-b border-[#e6e4df] last:border-0">
                  <span className="text-[#999] text-sm">{label}</span>
                  <span className="text-[#111] text-sm font-semibold text-right">{val}</span>
                </div>
              ))}
            </div>

            {/* Note */}
            {trip.specNote && (
              <div className="bg-white border border-[#e6e4df] rounded-2xl p-5">
                <p className="text-[10px] tracking-[0.2em] uppercase text-[#bbb] mb-2">Megjegyzés</p>
                <p className="text-[#666] text-sm leading-relaxed">{trip.specNote}</p>
              </div>
            )}

            {/* Links */}
            <div className="flex flex-col gap-2">
              <Link
                href={`/utazasok/${slug}`}
                className="text-center px-5 py-2.5 rounded-full border border-[#e6e4df] text-[#555] text-sm hover:border-[#999] transition-colors"
              >
                ← Vissza az útvonal oldalára
              </Link>
              <Link
                href="/utazasok"
                className="text-center px-5 py-2.5 rounded-full border border-[#e6e4df] text-[#555] text-sm hover:border-[#999] transition-colors"
              >
                Összes útvonal
              </Link>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
