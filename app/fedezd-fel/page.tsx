import Link from 'next/link'
import Image from 'next/image'

const STATS = [
  { value: '8', label: 'Útvonal' },
  { value: '10', label: 'Lakóautó' },
  { value: '5 000+', label: 'Elégedett utas' },
  { value: '28', label: 'Ország' },
]

export default function FedezdFelPage() {
  return (
    <>

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 pt-14 pb-16">

        <div className="text-center mb-10">
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-4">Kezdd el a kalandot</span>
          <h1 className="text-4xl md:text-5xl font-extrabold text-[#111] mb-3">
            Hogyan szeretnél utazni?
          </h1>
          <p className="text-[#888] text-base max-w-md mx-auto">
            Válassz egy előre összeállított útvonalat, vagy tervezd meg a sajátodat.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-8 md:gap-12 mb-12">
          {STATS.map(s => (
            <div key={s.label} className="text-center">
              <div className="text-2xl font-extrabold text-[#111]">{s.value}</div>
              <div className="text-xs text-[#888] tracking-wide mt-0.5">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Link href="/utazasok" className="group relative rounded-2xl overflow-hidden block h-[300px] md:h-[440px]">
            <Image
              src="/trips_selector.png"
              alt="Szervezett útvonalak"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-7">
              <h2 className="text-white text-2xl font-extrabold mb-1">Szervezett útvonalak</h2>
              <p className="text-white/70 text-sm">Fedezz fel gondosan válogatott kalandokat Európa-szerte.</p>
            </div>
          </Link>

          <Link href="/katalogus" className="group relative rounded-2xl overflow-hidden block h-[300px] md:h-[440px]">
            <Image
              src="/van_selector.png"
              alt="Lakóautó kollekció"
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-7">
              <h2 className="text-white text-2xl font-extrabold mb-1">Lakóautó kollekció</h2>
              <p className="text-white/70 text-sm">Válaszd ki a tökéletes lakóautót és tervezd meg a saját utadat.</p>
            </div>
          </Link>
        </div>

      </section>
    </>
  )
}
