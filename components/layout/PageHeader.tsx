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
    <>
      <div className="relative w-full overflow-hidden" style={{ height: '90px' }}>
        <Image
          src="/menu_pic.png"
          alt=""
          fill
          className="object-cover object-center"
          priority
        />
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 z-10 flex items-center justify-between px-4 md:grid md:grid-cols-3 md:px-10">
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
              onClick={() => setOpen(true)}
              className="md:hidden text-white p-1"
              aria-label="Menü megnyitása"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="md:hidden fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-8">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-6 right-4 text-white p-1"
            aria-label="Menü bezárása"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="text-white text-3xl font-extrabold tracking-wide hover:text-white/60 transition-colors duration-200"
            >
              {label}
            </Link>
          ))}
        </div>
      )}
    </>
  )
}
