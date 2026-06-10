'use client'

import { useState, useEffect } from 'react'
import { useSwipe } from '@/hooks/useSwipe'
import Image from 'next/image'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

interface CarouselCamper {
  id: string
  name: string
  slug: string
  price_per_day: number
  image_url: string | null
  beds: number | null
}

export default function CamperCarousel() {
  const [campers, setCampers] = useState<CarouselCamper[]>([])
  const [index, setIndex] = useState(0)

  useEffect(() => {
    async function load() {
      const [{ data }, { data: priceRows }] = await Promise.all([
        supabase.from('campers').select('id, name, slug, image_url, beds').eq('available', true).order('created_at'),
        supabase.from('camper_prices').select('camper_id, price').eq('season_id', 'peak'),
      ])
      const peakPrices: Record<string, number> = {}
      for (const p of (priceRows ?? []) as any[]) peakPrices[p.camper_id] = p.price
      if (data) {
        setCampers(data.map((c: any) => ({
          id: c.id,
          name: c.name,
          slug: c.slug,
          price_per_day: peakPrices[c.id] ?? 0,
          image_url: c.image_url,
          beds: c.beds ?? null,
        })))
      }
    }
    load()
  }, [])

  const n = Math.max(campers.length, 1)
  const prev = () => setIndex(i => (i - 1 + n) % n)
  const next = () => setIndex(i => (i + 1) % n)
  const swipe = useSwipe(next, prev)
  const visible = [0, 1, 2].map(offset => campers[(index + offset) % n])

  if (campers.length === 0) return null

  return (
    <section className="py-8 md:py-14 px-4 md:px-10 bg-[#f5f5f5]">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-9">
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-2.5">Lakóautóink</span>
          <h2 className="text-3xl font-extrabold text-[#111]">Az útra tervezve</h2>
        </div>

        <div className="relative flex items-center gap-3">
          <button onClick={prev} className="hidden md:flex flex-shrink-0 w-8 h-8 rounded-full border border-[#ccc] bg-white items-center justify-center hover:border-[#111] hover:shadow-sm transition-all text-[#333] text-base">‹</button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1" {...swipe}>
            {visible.map((camper, i) => (
              <Link key={camper.id} href={`/katalogus/${camper.slug}`} className={`group cursor-pointer block ${i > 0 ? 'hidden md:block' : ''}`}>
                <div className="relative h-[200px] rounded-2xl overflow-hidden mb-2.5 shadow-sm group-hover:shadow-md transition-shadow duration-300">
                  {camper.image_url ? (
                    <Image src={camper.image_url} alt={camper.name} fill className="object-cover transition-transform duration-400 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-full bg-[#eee]" />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/50 transition-all duration-300 flex flex-col items-center justify-center">
                    <span className="text-white text-[10px] tracking-[0.18em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-300 mb-1">Bérlési díj</span>
                    <span className="text-white text-xl font-extrabold opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                      {camper.price_per_day.toLocaleString('hu-HU')} Ft
                    </span>
                    <span className="text-white/70 text-xs opacity-0 group-hover:opacity-100 transition-opacity duration-300 mt-0.5">/ nap</span>
                  </div>
                </div>
                <p className="text-[#111] font-semibold text-sm">{camper.name}</p>
                {camper.beds != null && <p className="text-[#888] text-xs mt-0.5">{camper.beds} fő</p>}
              </Link>
            ))}
          </div>

          <button onClick={next} className="hidden md:flex flex-shrink-0 w-8 h-8 rounded-full border border-[#ccc] bg-white items-center justify-center hover:border-[#111] hover:shadow-sm transition-all text-[#333] text-base">›</button>
        </div>

        <div className="flex justify-center gap-1.5 mt-6">
          {campers.map((_, i) => (
            <button key={i} onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'bg-[#111] w-5' : 'bg-[#ccc] w-1.5 hover:bg-[#999]'}`} />
          ))}
        </div>
      </div>
    </section>
  )
}
