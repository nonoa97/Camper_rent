import Image from 'next/image'
import Link from 'next/link'
import Button from '../ui/Button'

export default function Hero() {
  return (
    <section className="relative flex items-center text-white overflow-hidden" style={{ height: '85vh' }}>
      <Image
        src="/hero.png"
        alt="Camper van a hegyekben"
        fill
        priority
        className="object-cover object-center"
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.28) 35%, rgba(0,0,0,0.0) 100%)' }} />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to bottom, transparent, rgba(255,255,255,.15))' }} />

      <div className="relative z-10 w-full px-12">
        <h1
          className="font-extrabold leading-[1.05] mb-4 max-w-xl"
          style={{ fontSize: 'clamp(2.4rem, 4.6vw, 4.6rem)' }}
        >
          Fedezd fel Európát másképp
        </h1>
        <p className="text-white/75 text-base mb-8 max-w-sm leading-relaxed">
          Szabadság. Természet. Kaland. Az utazásod itt kezdődik.
        </p>
        <Link href="/fedezd-fel">
          <Button variant="dark" className="font-semibold px-7 py-3.5 text-sm rounded-lg tracking-wide hover:shadow-lg transition-shadow">
            Kezdd el a kalandot →
          </Button>
        </Link>
      </div>
    </section>
  )
}
