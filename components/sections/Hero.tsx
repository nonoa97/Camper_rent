import Button from '../ui/Button'

export default function Hero() {
  return (
    <section
      className="relative flex flex-col items-center justify-center text-center text-white"
      style={{ height: '90vh', background: 'linear-gradient(180deg, #1a3a2a 0%, #0d1f16 100%)' }}
    >
      <div className="relative z-10 max-w-3xl px-6">
        <span className="block text-[#a8d8a8] text-xs tracking-[0.2em] uppercase mb-6">
          Kaland vár rád
        </span>
        <h1
          className="font-extrabold leading-tight mb-6"
          style={{ fontSize: 'clamp(2.5rem, 5vw, 5rem)' }}
        >
          Fedezd fel Európát lakóautóval
        </h1>
        <p className="text-white/70 text-lg mb-10 max-w-xl mx-auto">
          Prémium lakóautó bérlés rugalmas feltételekkel. Válaszd ki a hozzád illő járművet és indulj el.
        </p>
        <div className="flex gap-4 justify-center flex-wrap">
          <Button variant="primary">Katalógus megtekintése</Button>
          <Button variant="outline" className="border-white/40 text-white hover:border-white hover:text-white">
            Ajánlatkérés
          </Button>
        </div>
      </div>

      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 animate-bounce text-white/50 text-2xl">
        ↓
      </div>
    </section>
  )
}
