'use client'

import { useState, useEffect } from 'react'

const REVIEWS = [
  {
    initials: 'BP',
    name: 'Balogh Péter',
    trip: 'Provence-i lavender út',
    flag: '🇫🇷',
    text: '„Minden felülmúlta a várakozásainkat. A camper tele volt hasznos kütyükkel, nagyon jól éreztük magunkat."',
  },
  {
    initials: 'HE',
    name: 'Horváth Eszter',
    trip: 'Norvég fjordok',
    flag: '🇳🇴',
    text: '„Életem legjobb nyaralása! A fjordok látványa az autóból — leírhatatlan. Köszönjük a VanLife Europe-nak!"',
  },
  {
    initials: 'MZ',
    name: 'Molnár Zsuzsa',
    trip: 'Spanyol atlanti part',
    flag: '🇪🇸',
    text: '„Kényelmes, megbízható autó és profi csapat. Már tervezzük a következő utat — ezúttal Portugáliába!"',
  },
  {
    initials: 'KT',
    name: 'Kovács Tamás',
    trip: 'Toszkánai körút',
    flag: '🇮🇹',
    text: '„Első lakóautós utunk volt és rögtön beleszerettünk. A foglalás egyszerű, az autó tökéletes állapotban volt."',
  },
  {
    initials: 'SN',
    name: 'Szabó Nóra',
    trip: 'Horvát tengerpart',
    flag: '🇭🇷',
    text: '„Három hétig jártuk a horvát partokat. Szabadság, természet, csend — pontosan amit kerestünk."',
  },
]

const COLORS = ['#e8f0e8', '#e0e8f0', '#f0e8e8', '#f0ede0', '#e0f0ee']
const TEXT_COLORS = ['#2d5a2d', '#2d3d5a', '#5a2d2d', '#5a4a2d', '#2d5a54']

export default function Testimonials() {
  const [index, setIndex] = useState(0)
  const n = REVIEWS.length

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex(i => (i + 1) % n)
    }, 3000)
    return () => clearInterval(timer)
  }, [n])

  const visible = [0, 1, 2].map(offset => ({
    review: REVIEWS[(index + offset) % n],
    colorIndex: (index + offset) % COLORS.length,
  }))

  return (
    <section className="pt-12 pb-10 px-10" style={{ background: 'linear-gradient(to bottom, #ffffff, #f7f5f2)' }}>
      <div className="max-w-[1200px] mx-auto">
        <div className="text-center mb-10">
          <span className="block text-xs tracking-[0.2em] uppercase text-[#999] mb-3">Vendégeink mondták</span>
          <h2 className="text-3xl font-extrabold text-[#111]">Mit gondolnak rólunk?</h2>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {visible.map(({ review, colorIndex }, i) => (
            <div
              key={i}
              className="bg-white border border-[#ece9e4] rounded-2xl p-5 transition-all duration-500 h-48 flex flex-col shadow-sm"
            >
              <div className="flex items-center gap-3 mb-3">
                <div
                  className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                  style={{ background: COLORS[colorIndex], color: TEXT_COLORS[colorIndex] }}
                >
                  {review.initials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#111] text-sm leading-tight">{review.name}</p>
                  <p className="text-[#999] text-xs flex items-center gap-1 mt-0.5">
                    <span>{review.flag}</span>
                    <span>{review.trip}</span>
                  </p>
                </div>
              </div>
              <div className="text-amber-400 text-xs mb-2 tracking-wider">★★★★★</div>
              <p className="text-[#555] text-xs leading-relaxed flex-1">{review.text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
