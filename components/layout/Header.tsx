import Link from 'next/link'

export default function Header() {
  return (
    <header className="absolute top-0 left-0 right-0 z-50 grid grid-cols-3 items-center px-10 py-6"
      style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)' }}
    >
      <Link href="/" className="text-white text-xl font-extrabold tracking-[0.15em] uppercase flex flex-col leading-tight">
        <span>VanLife</span>
        <span className="text-sm font-semibold tracking-[0.3em] text-white/70">EUROPE</span>
      </Link>
      <nav className="hidden md:flex gap-10 justify-center">
        {[['Útvonalak', '/utazasok'], ['Lakóautók', '/katalogus'], ['Rólunk', '/rolunk'], ['GYIK', '/gyik'], ['Kapcsolat', '/kapcsolat']].map(([label, href]) => (
          <Link key={href} href={href} className="text-white/90 hover:text-white text-base font-semibold tracking-wide transition-colors">
            {label}
          </Link>
        ))}
      </nav>
      <div />
    </header>
  )
}
