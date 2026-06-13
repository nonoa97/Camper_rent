import Image from 'next/image'
import Link from 'next/link'
import Button from '../ui/Button'

export default function Hero() {
  return (
    <section className="relative text-white overflow-hidden" style={{ height: '85vh' }}>
      <Image
        src="/hero.png"
        alt="Camper van a hegyekben"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div className="absolute inset-0" style={{ background: 'linear-gradient(to right, rgba(0,0,0,0.32) 45%, rgba(0,0,0,0.0) 100%)' }} />
      <div className="relative z-10 w-full px-6 md:px-16 pt-28 md:pt-40">
        <h1
          className="font-extrabold leading-[1.05] mb-4 md:mb-7 max-w-[52%] md:max-w-3xl"
          style={{ fontSize: 'clamp(2.4rem, 7vw, 8rem)' }}
        >
          Fedezd fel Európát másképp
        </h1>
        <p className="text-white/75 text-base md:text-2xl max-w-[48%] md:max-w-xl leading-relaxed md:mb-10">
          Szabadság. Természet. Kaland. Az utazásod itt kezdődik.
        </p>
        <div className="hidden md:flex md:max-w-xl md:justify-end">
          <Link href="/fedezd-fel">
            <Button variant="dark" className="font-semibold px-10 py-5 text-base tracking-wide hover:shadow-lg transition-shadow">
              Kezdd el a kalandot →
            </Button>
          </Link>
        </div>
      </div>

      <div className="absolute bottom-8 left-6 z-10 md:hidden">
        <Link href="/fedezd-fel">
          <Button variant="dark" className="font-semibold px-7 py-3.5 text-sm tracking-wide hover:shadow-lg transition-shadow">
            Kezdd el a kalandot →
          </Button>
        </Link>
      </div>
    </section>
  )
}
