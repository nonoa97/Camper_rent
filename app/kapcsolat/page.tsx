'use client'

import { useState } from 'react'
import PageHeader from '@/components/layout/PageHeader'

export default function KapcsolatPage() {
  const [sent, setSent] = useState(false)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSent(true)
  }

  return (
    <>
      <PageHeader />

      {/* Compact header */}
      <section className="max-w-[1300px] mx-auto px-4 md:px-10 pt-9 pb-8 border-b border-[#eeeeec]">
        <div className="max-w-[560px]">
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-2.5">Lépj kapcsolatba velünk</span>
          <h1 className="text-4xl font-extrabold text-[#111] mb-2.5 leading-tight">Kapcsolat</h1>
          <p className="text-[#666] text-base leading-relaxed">
            Kérdésed van a bérléssel, útvonalakkal vagy a járművekkel kapcsolatban? Írj nekünk — általában 24 órán belül válaszolunk.
          </p>
        </div>
      </section>

      {/* Two-column main */}
      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 pb-20">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-start">

          {/* Left: Form */}
          <div>
            {sent ? (
              <div className="flex flex-col items-center justify-center text-center py-20 border border-[#ece9e4] rounded-2xl bg-[#fafaf8]">
                <span className="text-4xl mb-4">✅</span>
                <h3 className="text-lg font-extrabold text-[#111] mb-2">Üzeneted megérkezett!</h3>
                <p className="text-[#666] text-sm">Hamarosan felvesszük veled a kapcsolatot.</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] tracking-[0.15em] uppercase text-[#888] mb-1.5">Név</label>
                    <input required type="text" placeholder="Kovács Anna"
                      className="w-full px-4 py-3 text-sm border border-[#e0e0dc] rounded-xl bg-[#fafaf8] text-[#111] placeholder-[#ccc] focus:outline-none focus:border-[#1a3a2a] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[11px] tracking-[0.15em] uppercase text-[#888] mb-1.5">Email</label>
                    <input required type="email" placeholder="anna@email.hu"
                      className="w-full px-4 py-3 text-sm border border-[#e0e0dc] rounded-xl bg-[#fafaf8] text-[#111] placeholder-[#ccc] focus:outline-none focus:border-[#1a3a2a] transition-colors" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] tracking-[0.15em] uppercase text-[#888] mb-1.5">Telefonszám</label>
                    <input type="tel" placeholder="+36 30 ..."
                      className="w-full px-4 py-3 text-sm border border-[#e0e0dc] rounded-xl bg-[#fafaf8] text-[#111] placeholder-[#ccc] focus:outline-none focus:border-[#1a3a2a] transition-colors" />
                  </div>
                  <div>
                    <label className="block text-[11px] tracking-[0.15em] uppercase text-[#888] mb-1.5">Mikor utaznál?</label>
                    <input type="text" placeholder="pl. 2025 nyár"
                      className="w-full px-4 py-3 text-sm border border-[#e0e0dc] rounded-xl bg-[#fafaf8] text-[#111] placeholder-[#ccc] focus:outline-none focus:border-[#1a3a2a] transition-colors" />
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] tracking-[0.15em] uppercase text-[#888] mb-1.5">Üzenet</label>
                  <textarea required rows={6} placeholder="Meséld el, mire van szükséged..."
                    className="w-full px-4 py-3 text-sm border border-[#e0e0dc] rounded-xl bg-[#fafaf8] text-[#111] placeholder-[#ccc] focus:outline-none focus:border-[#1a3a2a] transition-colors resize-none" />
                </div>
                <button type="submit"
                  className="w-full bg-[#111] text-white text-sm font-semibold py-3.5 rounded-xl tracking-wide hover:bg-[#333] transition-colors duration-200">
                  Ajánlatkérés küldése →
                </button>
              </form>
            )}
          </div>

          {/* Right: Map + contact info */}
          <div className="flex flex-col gap-4">

            <div className="rounded-2xl overflow-hidden border border-[#e8e8e4] h-52">
              <iframe
                src="https://maps.google.com/maps?q=Zalaegerszeg,+Balatoni+%C3%BAt+5-7&output=embed&z=15&hl=hu"
                width="100%"
                height="100%"
                style={{ border: 0 }}
                allowFullScreen
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>

            <div className="flex flex-col gap-3.5 pt-1 px-1">
              <div className="flex items-start gap-3">
                <span className="text-sm mt-0.5 opacity-60">✉️</span>
                <div>
                  <p className="text-[10px] tracking-[0.14em] uppercase text-[#aaa] mb-0.5">Email</p>
                  <p className="text-sm text-[#333]">info@vanlifeeurope.hu</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-sm mt-0.5 opacity-60">📞</span>
                <div>
                  <p className="text-[10px] tracking-[0.14em] uppercase text-[#aaa] mb-0.5">Telefon</p>
                  <p className="text-sm text-[#333]">+36 30 123 4567</p>
                  <p className="text-xs text-[#aaa] mt-0.5">Hétfő–Péntek 09:00–18:00</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-sm mt-0.5 opacity-60">📍</span>
                <div>
                  <p className="text-[10px] tracking-[0.14em] uppercase text-[#aaa] mb-0.5">Átvételi pont</p>
                  <p className="text-sm text-[#333]">Zalaegerszeg, Balatoni út 5-7</p>
                  <p className="text-xs text-[#aaa] mt-0.5">08:00–18:00 · Előzetes egyeztetéssel</p>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>
    </>
  )
}
