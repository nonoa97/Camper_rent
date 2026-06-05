'use client'

import { useState, useRef } from 'react'
import PageHeader from '@/components/layout/PageHeader'
import CtaBanner from '@/components/sections/CtaBanner'

const FAQS = [
  { icon: '🪪', q: 'Milyen jogosítvány szükséges a lakóautók vezetéséhez?', a: 'A legtöbb járművünk hagyományos B kategóriás jogosítvánnyal vezethető. A pontos követelményeket minden jármű adatlapján feltüntetjük.' },
  { icon: '🎂', q: 'Hány éves kortól bérelhetek lakóautót?', a: 'A bérléshez legalább 21–25 éves kor szükséges, a választott járműtől és biztosítási feltételektől függően.' },
  { icon: '🎒', q: 'Mi tartozik a bérléshez?', a: 'Minden lakóautó alapfelszereltséggel érkezik: konyha, hűtő, főzőeszközök, áramcsatlakozás, vízrendszer és kényelmes alvóhelyek. A pontos felszereltség modellenként eltérhet.' },
  { icon: '💳', q: 'Mekkora kaució szükséges?', a: 'A kaució összege a választott járműtől és biztosítási csomagtól függ. A pontos összeget a foglalás során jelenítjük meg.' },
  { icon: '🛡️', q: 'Van biztosítás a bérlésben?', a: 'Igen, minden bérlés tartalmaz alapbiztosítást. Emellett magasabb szintű védelmi csomagok is elérhetők az önrész csökkentésére.' },
  { icon: '🌍', q: 'Külföldre is utazhatok a járművel?', a: 'Igen. Lakóautóinkat európai körutakra terveztük. Egyes országokra vagy régiókra külön szabályok vonatkozhatnak, amelyeket foglaláskor ismertetünk.' },
  { icon: '📅', q: 'Módosíthatom vagy lemondhatom a foglalásomat?', a: 'Igen, foglalásaid meghatározott feltételek mellett módosíthatók vagy lemondhatók. A részleteket az ÁSZF tartalmazza.' },
  { icon: '🔧', q: 'Mi történik meghibásodás esetén?', a: '24/7 segélyszolgálatot biztosítunk, hogy utazásod a lehető legkevesebb fennakadással folytatódhasson.' },
  { icon: '⛺', q: 'Vadkempingezhetek Európában?', a: 'Ez országonként eltérő. Vannak helyek, ahol engedélyezett, máshol kizárólag kijelölt kempingek és camper parkolók használhatók.' },
  { icon: '🚐', q: 'Nem tudom, melyik lakóautót válasszam.', a: 'Semmi gond. Válassz egy útvonalat, és ajánlunk hozzá megfelelő járművet a létszám, komfortigény és utazási stílus alapján.' },
]

function FaqItem({ icon, q, a }: { icon: string; q: string; a: string }) {
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`border rounded-xl overflow-hidden transition-all duration-200 group
      ${open
        ? 'border-[#d0ccc4] shadow-md bg-white'
        : 'border-[#e8e8e4] bg-white hover:border-[#c8c4bc] hover:shadow-sm'
      }`}
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-4 px-5 py-4 text-left"
      >
        <span className={`w-8 h-8 rounded-xl flex items-center justify-center text-base flex-shrink-0 transition-colors duration-200
          ${open ? 'bg-[#1a3a2a]/8' : 'bg-[#f5f5f0] group-hover:bg-[#eeeee8]'}`}
        >
          {icon}
        </span>
        <span className={`flex-1 text-sm font-semibold transition-colors duration-200 ${open ? 'text-[#1a3a2a]' : 'text-[#111]'}`}>
          {q}
        </span>
        <span className={`w-6 h-6 rounded-full border flex items-center justify-center flex-shrink-0 transition-all duration-300
          ${open ? 'border-[#1a3a2a] bg-[#1a3a2a] rotate-180' : 'border-[#ccc] bg-transparent group-hover:border-[#999]'}`}
        >
          <svg className={`w-3 h-3 transition-colors duration-200 ${open ? 'text-white' : 'text-[#888]'}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </span>
      </button>

      <div
        ref={contentRef}
        className="overflow-hidden transition-all duration-300 ease-in-out"
        style={{ maxHeight: open ? `${contentRef.current?.scrollHeight ?? 200}px` : '0px' }}
      >
        <p className="text-[#555] text-sm leading-relaxed px-5 pb-5 ml-12">{a}</p>
      </div>
    </div>
  )
}

export default function GyikPage() {
  return (
    <>
      <PageHeader />

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 pt-14 pb-4">
        <div className="max-w-[680px]">
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Segítség & információ</span>
          <h1 className="text-4xl font-extrabold text-[#111] mb-3 leading-tight">Gyakori kérdések</h1>
          <p className="text-[#666] text-base leading-relaxed">
            Összegyűjtöttük a leggyakrabban feltett kérdéseket a lakóautó bérléssel kapcsolatban. Ha nem találod a választ, írj nekünk.
          </p>
        </div>
      </section>

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-8 pb-14">
        <div className="flex flex-col gap-2">
          {FAQS.map((f) => (
            <FaqItem key={f.q} icon={f.icon} q={f.q} a={f.a} />
          ))}
        </div>
      </section>

      <CtaBanner
        title="Még több kérdésed van?"
        buttonText="Kapcsolatfelvétel →"
        buttonHref="/kapcsolat"
      />
    </>
  )
}
