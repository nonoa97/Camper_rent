import Link from 'next/link'
import type { Metadata } from 'next'
import CtaBanner from '@/components/sections/CtaBanner'
import ExtrasCatalog from '@/components/sections/ExtrasCatalog'
import { EXTRAS_INTRO, EXTRA_NOTES } from '@/lib/extras'

export const metadata: Metadata = {
  title: 'Extrák — Kerékpár & roller bérlés — VanLife Europe',
  description:
    'Bérelhető kerékpárok, e-bike-ok és rollerek a lakóautód mellé. Városnézéstől a terepig, gyerektől prémiumig — sisakkal, zárral, töltővel.',
}

export default function ExtrakPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 pt-12 md:pt-16 pb-2">
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#111] leading-tight mb-5 max-w-3xl">
          Kerékpár & roller, az autód mellé
        </h1>
        <p className="text-[#555] text-base md:text-lg leading-relaxed max-w-2xl">
          {EXTRAS_INTRO}
        </p>
      </section>

      {/* Kategória-fülekkel darabolt katalógus */}
      <ExtrasCatalog />

      {/* Csomagok — teaser, külön oldalra */}
      <section className="py-14 px-4 md:px-10 bg-[#1a3a2a]">
        <div className="max-w-[1200px] mx-auto flex flex-col md:flex-row items-center justify-between gap-6 text-center md:text-left">
          <div>
            <p className="text-[11px] tracking-[0.22em] uppercase text-white/50 mb-2">Kedvezményes összeállítások</p>
            <h2 className="text-2xl md:text-3xl font-black text-white leading-tight">Készre csomagolva — bringa, roller, grill</h2>
            <p className="text-white/60 text-sm mt-2 max-w-xl">
              Ne alkatrészlistát rakj össze: válaszd a kész összeállítást, kedvezményes napi díjon.
            </p>
          </div>
          <Link
            href="/extrak/csomagok"
            className="flex-shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-full bg-white text-[#1a3a2a] text-sm font-semibold hover:bg-[#f0f0f0] transition-colors"
          >
            Csomagok megtekintése <span aria-hidden>→</span>
          </Link>
        </div>
      </section>

      {/* Tudnivalók */}
      <section className="py-14 px-4 md:px-10 border-t border-[#e6e4df]">
        <div className="max-w-[1200px] mx-auto">
          <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-8 text-center">Jó tudni</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {EXTRA_NOTES.map(note => (
              <div key={note.title} className="bg-white border border-[#e6e4df] rounded-2xl p-5">
                <h3 className="font-bold text-[#111] text-sm mb-2">{note.title}</h3>
                <p className="text-[#666] text-sm leading-relaxed">{note.text}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10">
            <Link
              href="/kapcsolat"
              className="inline-flex items-center gap-2 bg-[#1a3a2a] text-white text-sm font-semibold px-7 py-3.5 rounded-full tracking-wide hover:bg-[#2d4a2d] transition-colors"
            >
              Kérd hozzá az autódhoz <span aria-hidden>→</span>
            </Link>
            <p className="text-[#aaa] text-xs mt-3">
              Az extrákat foglaláskor vagy e-mailben kérheted — legkésőbb 3 nappal átvétel előtt.
            </p>
          </div>
        </div>
      </section>

      <CtaBanner
        eyebrow="Következő lépés"
        title="Készen állsz az útra?"
        description="Válassz lakóautót, állítsd össze a felszerelésed, és indulj el — mi a többit intézzük."
        buttonText="Lakóautók megtekintése"
        buttonHref="/katalogus"
        buttonText2="Kapcsolatfelvétel"
        buttonHref2="/kapcsolat"
      />
    </>
  )
}
