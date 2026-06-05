'use client'

import { useState } from 'react'
import Image from 'next/image'

const TRIPS = [
  { id: '1', name: 'Norvég fjordok', detail: '14 nap · Norvégia', image: 'https://images.unsplash.com/photo-1601439678777-b2b3c56fa627?w=800&q=80' },
  { id: '2', name: 'Toszkánai körút', detail: '10 nap · Olaszország', image: 'https://images.unsplash.com/photo-1523906834658-6e24ef2386f9?w=800&q=80' },
  { id: '3', name: 'Alpesi kaland', detail: '7 nap · Ausztria & Svájc', image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80' },
  { id: '4', name: 'Horvát tengerpart', detail: '8 nap · Horvátország', image: 'https://images.unsplash.com/photo-1555990793-da11153b6eca?w=800&q=80' },
  { id: '5', name: 'Skót felföld', detail: '12 nap · Skócia', image: 'https://images.unsplash.com/photo-1506748686214-e9df14d4d9d0?w=800&q=80' },
]

export default function TripCarousel() {
  const [index, setIndex] = useState(0)
  const n = TRIPS.length

  const prev = () => setIndex(i => (i - 1 + n) % n)
  const next = () => setIndex(i => (i + 1) % n)

  const visible = [0, 1, 2].map(offset => TRIPS[(index + offset) % n])

  return (
    <section className="py-14 px-4 md:px-10 bg-white">
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-9">
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-2.5">Válaszd ki a kalandod</span>
          <h2 className="text-3xl font-extrabold text-[#111]">Többféle útvonal. Végtelen emlék.</h2>
        </div>

        <div className="relative flex items-center gap-3">
          <button
            onClick={prev}
            className="flex-shrink-0 w-8 h-8 rounded-full border border-[#ccc] bg-white flex items-center justify-center hover:border-[#111] hover:shadow-sm transition-all text-[#333] text-base"
          >
            ‹
          </button>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
            {visible.map((trip, i) => (
              <div key={trip.id} className={`group cursor-pointer ${i > 0 ? 'hidden md:block' : ''}`}>
                <div className="relative h-56 rounded-2xl overflow-hidden mb-2.5 shadow-sm group-hover:shadow-md transition-shadow duration-300">
                  <Image
                    src={trip.image}
                    alt={trip.name}
                    fill
                    className="object-cover transition-transform duration-500 group-hover:scale-108"
                  />
                </div>
                <p className="text-[#111] font-semibold text-sm">{trip.name}</p>
                <p className="text-[#888] text-xs mt-0.5">{trip.detail}</p>
              </div>
            ))}
          </div>

          <button
            onClick={next}
            className="flex-shrink-0 w-8 h-8 rounded-full border border-[#ccc] bg-white flex items-center justify-center hover:border-[#111] hover:shadow-sm transition-all text-[#333] text-base"
          >
            ›
          </button>
        </div>

        <div className="flex justify-center gap-1.5 mt-6">
          {TRIPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setIndex(i)}
              className={`h-1.5 rounded-full transition-all duration-300 ${i === index ? 'bg-[#111] w-5' : 'bg-[#ccc] w-1.5 hover:bg-[#999]'}`}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
