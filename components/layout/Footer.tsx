import Link from 'next/link'

const NAV = [
  ['Útvonalak', '/utazasok'],
  ['Lakóautók', '/katalogus'],
  ['Rólunk', '/rolunk'],
  ['GYIK', '/gyik'],
  ['Kapcsolat', '/kapcsolat'],
]

const SOCIAL = [
  {
    label: 'Facebook',
    href: '#',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
      </svg>
    ),
  },
  {
    label: 'Instagram',
    href: '#',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    label: 'YouTube',
    href: '#',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.59.46A2.78 2.78 0 0 0 1.46 6.42 29 29 0 0 0 1 12a29 29 0 0 0 .46 5.58 2.78 2.78 0 0 0 1.95 1.96C5.12 20 12 20 12 20s6.88 0 8.59-.46a2.78 2.78 0 0 0 1.95-1.96A29 29 0 0 0 23 12a29 29 0 0 0-.46-5.58z" />
        <polygon fill="#f4f4f2" points="9.75 15.02 15.5 12 9.75 8.98 9.75 15.02" />
      </svg>
    ),
  },
  {
    label: 'TikTok',
    href: '#',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
        <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-2.88 2.5 2.89 2.89 0 0 1-2.89-2.89 2.89 2.89 0 0 1 2.89-2.89c.28 0 .54.04.79.1V9.01a6.33 6.33 0 0 0-.79-.05 6.34 6.34 0 0 0-6.34 6.34 6.34 6.34 0 0 0 6.34 6.34 6.34 6.34 0 0 0 6.33-6.34V8.69a8.18 8.18 0 0 0 4.78 1.52V6.75a4.85 4.85 0 0 1-1.01-.06z" />
      </svg>
    ),
  },
]

export default function Footer() {
  return (
    <footer style={{ background: 'linear-gradient(to bottom, #f4f4f2, #efefed)' }}>

      <div className="border-t border-[#d5d3d0] py-6 text-center px-10">
        <p className="text-base font-semibold text-[#111] tracking-wide italic">
          Fedezd fel Európát a saját tempódban.
        </p>
      </div>

      <div className="max-w-[1080px] mx-auto px-10 pt-7 pb-7 grid grid-cols-3 gap-6 items-start">

        <div>
          <div className="text-lg font-black tracking-[0.16em] uppercase text-[#111] mb-0.5">VanLife</div>
          <div className="text-[10px] tracking-[0.32em] text-[#777] uppercase mb-3">Europe</div>
          <p className="text-[#555] text-xs leading-relaxed max-w-[190px]">
            Prémium lakóautó bérlés. Fedezd fel Európát szabadon, a saját tempódban.
          </p>
        </div>

        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#777] mb-3 font-semibold">Navigáció</p>
          <ul className="space-y-2">
            {NAV.map(([label, href]) => (
              <li key={href}>
                <Link
                  href={href}
                  className="text-[#444] hover:text-[#111] text-xs font-medium transition-colors duration-150 hover:translate-x-0.5 inline-block transform"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <p className="text-[10px] tracking-[0.2em] uppercase text-[#777] mb-3 font-semibold">Kapcsolat</p>
          <ul className="space-y-1.5 text-xs text-[#444] mb-5">
            <li>info@vanlifeeurope.hu</li>
            <li>+36 30 123 4567</li>
            <li>Zalaegerszeg, Balatoni út 5-7</li>
          </ul>
          <div className="flex gap-4">
            {SOCIAL.map((s) => (
              <a
                key={s.label}
                href={s.href}
                aria-label={s.label}
                className="text-[#888] hover:text-[#111] transition-all duration-200 hover:-translate-y-0.5 transform"
              >
                {s.icon}
              </a>
            ))}
          </div>
        </div>

      </div>

      <div className="max-w-[1080px] mx-auto px-10 pb-4 text-center text-[11px] text-[#888] tracking-wide border-t border-[#e0e0de] pt-3">
        © {new Date().getFullYear()} VanLife Europe. Minden jog fenntartva.
      </div>

    </footer>
  )
}
