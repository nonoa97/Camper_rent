'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'

const NAV = [
  ['Útvonalak', '/utazasok'],
  ['Lakóautók', '/katalogus'],
  ['Rólunk', '/rolunk'],
  ['GYIK', '/gyik'],
  ['Kapcsolat', '/kapcsolat'],
]

export default function PageHeader() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative overflow-hidden">
      <div className="relative h-36">
        <Image
          src="/menu_pic.png"
          alt=""
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-black/15" />
        <div className="relative z-10 h-full grid grid-cols-3 items-center px-4 md:px-10">
          <Link href="/" className="text-white text-xl font-extrabold tracking-[0.15em] uppercase flex flex-col leading-tight">
            <span>VanLife</span>
            <span className="text-xs font-semibold tracking-[0.3em] text-white/60">EUROPE</span>
          </Link>

          <nav className="hidden md:flex gap-10 justify-center">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="text-white text-base font-semibold tracking-wide">
                {label}
              </Link>
            ))}
          </nav>

          <div className="flex justify-end">
            <button
              onClick={() => setOpen(o => !o)}
              className="md:hidden text-white p-1"
              aria-label="Menü"
            >
              {open ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="md:hidden bg-[#1a3a2a]/95 backdrop-blur-sm py-3 px-4 flex flex-col gap-1 absolute top-36 left-0 right-0 z-20">
          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="text-white/90 hover:text-white font-semibold py-3 px-3 rounded-lg hover:bg-white/10 transition-colors"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
