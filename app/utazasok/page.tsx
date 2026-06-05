import TripCarousel from '@/components/sections/TripCarousel'
import PageHeader from '@/components/layout/PageHeader'

export default function UtazasokPage() {
  return (
    <>
      <PageHeader />
      <section
        className="relative flex items-center justify-center text-white text-center"
        style={{ height: '85vh', background: 'linear-gradient(180deg, #1a3a2a 0%, #0d1f16 100%)' }}
      >
        <div className="relative z-10 px-4 md:px-6">
          <span className="block text-white/60 text-xs tracking-[0.2em] uppercase mb-4">Inspiráció</span>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Útvonalak & kalandok</h1>
          <p className="text-white/70 text-lg max-w-lg mx-auto">
            Fedezd fel a legjobb európai útvonalakat lakóautóval.
          </p>
        </div>
      </section>

      <TripCarousel />
    </>
  )
}
