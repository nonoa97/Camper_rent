import Link from 'next/link'
import type { Metadata } from 'next'
import CtaBanner from '@/components/sections/CtaBanner'
import { EXTRA_PACKAGES, type ExtraPackage } from '@/lib/extras'

export const metadata: Metadata = {
  title: 'Csomagok — Extrák — VanLife Europe',
  description:
    'Kedvezményes bérelhető csomagok lakóautó mellé: bringa, roller és Weber grill összeállítások egyszerű napi díjon.',
}

function ft(n: number) {
  return n.toLocaleString('hu-HU')
}

const SECTIONS: { id: string; group: ExtraPackage['group']; eyebrow: string; title: string; blurb: string }[] = [
  {
    id: 'mobilitas',
    group: 'mobility',
    eyebrow: 'Bringa & roller',
    title: 'Mobilitás csomagok',
    blurb: 'Páros, családi és terep összeállítások — sisakkal, zárral, töltővel együtt.',
  },
  {
    id: 'grill',
    group: 'grill',
    eyebrow: 'Weber grill',
    title: 'Grill csomagok',
    blurb: 'Faszenes és gázos összeállítások, alap tartozékokkal és induló fogyóanyaggal.',
  },
]

function PackageCard({ pkg }: { pkg: ExtraPackage }) {
  return (
    <div className="bg-white border border-[#e6e4df] rounded-2xl p-5 flex flex-col hover:shadow-md transition-shadow duration-300">
      <h3 className="font-extrabold text-[#111] text-base mb-2">{pkg.name}</h3>
      <p className="text-[#666] text-sm leading-relaxed mb-5 flex-1">{pkg.contents}</p>
      <div className="flex items-end justify-between gap-2 pt-4 border-t border-[#e6e4df]">
        <p className="leading-none">
          <span className="text-xl font-extrabold text-[#1a3a2a]">{ft(pkg.pricePerDay)} Ft</span>
          <span className="text-[#999] text-sm"> / nap</span>
        </p>
        <Link
          href="/kapcsolat"
          className="text-[13px] font-semibold text-[#1a3a2a] hover:underline whitespace-nowrap"
        >
          Ajánlatkérés →
        </Link>
      </div>
    </div>
  )
}

export default function CsomagokPage() {
  return (
    <>
      {/* Hero */}
      <section className="max-w-[1200px] mx-auto px-4 md:px-10 pt-12 md:pt-16 pb-8">
        <Link href="/extrak" className="text-[13px] text-[#999] hover:text-[#333] transition-colors mb-4 inline-block">
          ← Vissza az extrákhoz
        </Link>
        <h1 className="text-4xl md:text-5xl font-black tracking-tight text-[#111] leading-tight mb-5 max-w-3xl">
          Csomagok
        </h1>
        <p className="text-[#555] text-base md:text-lg leading-relaxed max-w-2xl">
          Ne alkatrészlistát rakj össze — válaszd a kész összeállítást. A csomagár kedvezményes napi díj,
          és tartalmazza az alap tartozékokat is. Ugyanazok az eszközök, egyszerűbb ajánlatként.
        </p>
      </section>

      {/* Csoportos szekciók */}
      {SECTIONS.map((section, i) => {
        const packages = EXTRA_PACKAGES.filter(p => p.group === section.group)
        if (packages.length === 0) return null
        return (
          <section
            key={section.id}
            className={`py-12 px-4 md:px-10 border-t border-[#e6e4df] ${i % 2 === 1 ? 'bg-[#f7f6f3]' : 'bg-white'}`}
          >
            <div className="max-w-[1200px] mx-auto">
              <div className="mb-8">
                <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-2">{section.eyebrow}</p>
                <h2 className="text-2xl md:text-3xl font-black text-[#111] leading-tight">{section.title}</h2>
                <p className="text-[#888] text-sm mt-1.5 max-w-xl">{section.blurb}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {packages.map(pkg => (
                  <PackageCard key={pkg.name} pkg={pkg} />
                ))}
              </div>
            </div>
          </section>
        )
      })}

      <CtaBanner
        eyebrow="Egyedi igény?"
        title="Állítsunk össze neked csomagot"
        description="Mondd el hányan utaztok és mire vágytok — összerakjuk a hozzátok illő összeállítást."
        buttonText="Kapcsolatfelvétel"
        buttonHref="/kapcsolat"
        buttonText2="Vissza az extrákhoz"
        buttonHref2="/extrak"
      />
    </>
  )
}
