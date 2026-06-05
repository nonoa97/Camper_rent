import Link from 'next/link'

export default function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-10 py-5 bg-[#1a3a2a]">
      <Link href="/" className="text-white text-xl font-bold tracking-widest uppercase">
        Camper
      </Link>
      <nav className="hidden md:flex gap-8">
        <Link href="/katalogus" className="text-white/80 hover:text-white text-sm tracking-wider transition-colors">
          Katalógus
        </Link>
        <Link href="/utazasok" className="text-white/80 hover:text-white text-sm tracking-wider transition-colors">
          Utazások
        </Link>
      </nav>
    </header>
  )
}
