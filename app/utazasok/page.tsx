import Image from 'next/image'
import Link from 'next/link'
import { getTrips } from '@/lib/supabase-trips'

export const revalidate = 3600

export const metadata = {
  title: 'Útvonalak — VanLife Europe',
  description: 'Nyolc kipróbált európai útvonal lakóautóval: napi bontás, kempingek, megállók.',
}

export default async function UtazasokPage() {
  const trips = await getTrips()

  return (
    <>

      {/* Page heading */}
      <section className="bg-[#f7f6f3] pt-10 pb-12 px-4 md:px-10 border-b border-[#e6e4df]">
        <div className="max-w-[1200px] mx-auto">
          <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#111] mb-5 max-w-2xl leading-tight">
            Nyolc út. Mind végigjárva.
          </h1>
          <p className="text-[#666] text-base md:text-lg max-w-xl leading-relaxed">
            Nem térképről terveztük — végigvezettük mindet. Kempingek, megállók, napi bontás: minden terv kipróbált, és az első útvonal ingyenes.
          </p>
        </div>
      </section>

      {/* Routes grid */}
      <section className="py-14 px-4 md:px-10 bg-[#f7f6f3]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {trips.map((trip) => (
              <Link
                key={trip.slug}
                href={`/utazasok/${trip.slug}`}
                className="group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300"
              >
                <div className="relative h-[220px] overflow-hidden">
                  <Image
                    src={trip.heroImage}
                    alt={trip.title}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <div className="absolute top-3 left-3">
                    <span className="inline-block bg-black/65 backdrop-blur-sm text-white text-[10px] tracking-[0.12em] uppercase px-2.5 py-1 rounded-full">
                      {trip.days} nap{trip.isFree ? ' · Ingyenes terv' : ''}
                    </span>
                  </div>
                </div>

                <div className="p-5">
                  <div className="flex items-center gap-2.5 mb-2">
                    <span className="text-[11px] font-bold tracking-[0.2em] text-[#ccc]">
                      {String(trip.num).padStart(2, '0')}
                    </span>
                    <span className="text-[10px] tracking-[0.1em] uppercase text-[#999]">
                      {trip.country} · {trip.km.toLocaleString('hu-HU')} km
                    </span>
                  </div>
                  <h3 className="text-lg font-extrabold text-[#111] leading-snug group-hover:text-[#444] transition-colors">
                    {trip.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why section */}
      <section className="py-14 px-4 md:px-10 bg-white border-t border-[#e6e4df]">
        <div className="max-w-[1200px] mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-16">
            {[
              { num: '01', title: 'Az első terv ingyenes', desc: 'A Norvég fjordok teljes tervét ingyen letöltheted — nézd meg, mit tudnak a terveink.' },
              { num: '02', title: 'Napi bontású tervek', desc: 'Minden nap: útszakasz, kemping, két látnivaló és egy hely, ahol érdemes megállni ebédelni.' },
              { num: '03', title: 'Offline is működik', desc: 'A megvásárolt terveket PDF-ben is megkapod — térerő nélkül is veled van.' },
            ].map(({ num, title, desc }) => (
              <div key={num}>
                <span className="block text-[52px] font-black text-[#f0ede7] leading-none mb-4 select-none">{num}</span>
                <h3 className="text-base font-extrabold text-[#111] mb-2">{title}</h3>
                <p className="text-[#777] text-sm leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className="py-12 px-4 md:px-10" style={{ background: '#111' }}>
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6">
          <h2 className="text-2xl md:text-3xl font-extrabold text-white">
            A terv kész.{' '}
            <em className="not-italic font-light text-white/70">Az autót mi adjuk.</em>
          </h2>
          <Link
            href="/katalogus"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#111] text-sm font-semibold hover:bg-[#f0f0f0] transition-colors"
          >
            Lakóautó választása <span aria-hidden>→</span>
          </Link>
        </div>
      </section>
    </>
  )
}
