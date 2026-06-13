'use client'

import { useState } from 'react'
import Image from 'next/image'
import { EXTRA_CATEGORIES, EXTRA_IMAGES, type ExtraItem } from '@/lib/extras'

const GROUPS = [
  { id: 'bike', label: 'Bicikli', cats: ['kerekpar', 'e-kerekpar'] },
  { id: 'scooter', label: 'Roller', cats: ['roller', 'e-roller'] },
  { id: 'grill', label: 'Grill', cats: ['grill-faszenes', 'grill-gaz'] },
] as const

type GroupId = (typeof GROUPS)[number]['id']

const PAGE = 8

function ft(n: number) {
  return n.toLocaleString('hu-HU')
}

function ItemCard({ item }: { item: ExtraItem }) {
  const image = EXTRA_IMAGES[item.name] ?? '/extras/fallback-bike-1.jpg'
  return (
    <div className="bg-white border border-[#e6e4df] rounded-lg overflow-hidden flex flex-col h-full hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">
      <div className="relative aspect-[4/3] bg-[#f7f6f3]">
        <Image
          src={image}
          alt={item.name}
          fill
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          className="object-cover"
        />
      </div>
      <div className="p-2.5 flex flex-col flex-1">
        <p className="text-[9px] tracking-[0.1em] uppercase text-[#aaa] mb-0.5 line-clamp-1">{item.tag}</p>
        <h3 className="font-semibold text-[#111] text-[13px] mb-2 leading-tight line-clamp-2">{item.name}</h3>
        <div className="mt-auto">
          <span className="text-sm font-extrabold text-[#1a3a2a]">
            {ft(item.pricePerDay)} Ft<span className="text-[#aaa] font-normal">/nap</span>
          </span>
        </div>
      </div>
    </div>
  )
}

export default function ExtrasCatalog() {
  const [group, setGroup] = useState<GroupId>('bike')
  const [variant, setVariant] = useState('Mind')
  const [visible, setVisible] = useState(PAGE)

  const activeGroup = GROUPS.find(g => g.id === group) ?? GROUPS[0]
  const groupCats = EXTRA_CATEGORIES.filter(c =>
    (activeGroup.cats as readonly string[]).includes(c.slug),
  )
  const variants = ['Mind', ...Array.from(new Set(groupCats.map(c => c.variant)))]

  const items = groupCats
    .filter(c => variant === 'Mind' || c.variant === variant)
    .flatMap(c => c.items)

  const shown = items.slice(0, visible)

  function pickGroup(id: GroupId) {
    setGroup(id)
    setVariant('Mind')
    setVisible(PAGE)
  }
  function pickVariant(v: string) {
    setVariant(v)
    setVisible(PAGE)
  }

  return (
    <section className="max-w-[1200px] mx-auto px-4 md:px-10 py-10">
      {/* Fő fülek: Bicikli / Roller */}
      <div className="flex gap-2 mb-4">
        {GROUPS.map(g => (
          <button
            key={g.id}
            onClick={() => pickGroup(g.id)}
            className={`px-6 py-2.5 rounded-full text-sm font-semibold transition-colors ${
              group === g.id
                ? 'bg-[#1a3a2a] text-white'
                : 'border border-[#e6e4df] text-[#444] hover:border-[#1a3a2a] hover:text-[#1a3a2a]'
            }`}
          >
            {g.label}
          </button>
        ))}
      </div>

      {/* Al-szűrő: Hagyományos / Elektromos */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e6e4df] pb-5 mb-7">
        <div className="flex gap-1.5">
          {variants.map(v => (
            <button
              key={v}
              onClick={() => pickVariant(v)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] transition-colors ${
                variant === v
                  ? 'bg-[#1a3a2a]/10 text-[#1a3a2a] font-semibold'
                  : 'text-[#888] hover:text-[#111]'
              }`}
            >
              {v}
            </button>
          ))}
        </div>
        <span className="text-[#999] text-sm">{items.length} termék</span>
      </div>

      {/* Termékrács */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
        {shown.map(item => (
          <ItemCard key={item.name} item={item} />
        ))}
      </div>

      {/* Lapozás — bővüléskor sem lesz egy hosszú lista */}
      {visible < items.length && (
        <div className="text-center mt-8">
          <button
            onClick={() => setVisible(v => v + PAGE)}
            className="px-6 py-3 rounded-full border border-[#e6e4df] text-sm font-semibold text-[#444] hover:border-[#1a3a2a] hover:text-[#1a3a2a] transition-colors"
          >
            Több megjelenítése
            <span className="text-[#aaa] font-normal"> · még {items.length - visible}</span>
          </button>
        </div>
      )}
    </section>
  )
}
