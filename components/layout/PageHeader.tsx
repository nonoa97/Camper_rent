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
  return (
    <div className="relative h-36 overflow-hidden">
      <Image
        src="/menu_pic.png"
        alt=""
        fill
        className="object-cover object-center"
        priority
      />
      <div className="absolute inset-0 bg-black/15" />
      <div className="relative z-10 h-full grid grid-cols-3 items-center px-10">
        <Link href="/" className="text-white text-xl font-extrabold tracking-[0.15em] uppercase flex flex-col leading-tight">
          <span>VanLife</span>
          <span className="text-xs font-semibold tracking-[0.3em] text-white/60">EUROPE</span>
        </Link>
        <nav className="flex gap-10 justify-center">
          {NAV.map(([label, href]) => (
            <Link key={href} href={href} className="text-white text-base font-semibold tracking-wide">
              {label}
            </Link>
          ))}
        </nav>
        <div />
      </div>
    </div>
  )
}
