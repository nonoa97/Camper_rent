import Link from 'next/link'

export default function UtazasokPage() {
  return (
    <div className="pt-20">
      <section
        className="relative flex items-center justify-center text-white text-center"
        style={{ height: '52vh', background: 'linear-gradient(180deg, #1a3a2a 0%, #0d1f16 100%)' }}
      >
        <div className="relative z-10 px-6">
          <span className="block text-[#a8d8a8] text-xs tracking-[0.2em] uppercase mb-4">Inspiráció</span>
          <h1 className="text-4xl md:text-5xl font-extrabold mb-4">Útvonalak & kalandok</h1>
          <p className="text-white/70 text-lg max-w-lg mx-auto">
            Fedezd fel a legjobb európai útvonalakat lakóautóval.
          </p>
        </div>
      </section>

      <section className="max-w-[1200px] mx-auto px-10 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="border border-[#eee] rounded-[10px] p-8 hover:shadow-lg transition-shadow">
            <span className="text-3xl mb-4 block">🗺️</span>
            <h2 className="text-2xl font-bold text-[#111] mb-3">Kurált útvonalak</h2>
            <p className="text-[#666] leading-relaxed mb-6">
              Szakértőink által összeállított legjobb útvonalak Európa-szerte. Minden részlet megtervezve.
            </p>
            <Link href="/katalogus" className="text-[#1a3a2a] font-semibold hover:underline">
              Útvonalak böngészése →
            </Link>
          </div>
          <div className="border border-[#eee] rounded-[10px] p-8 hover:shadow-lg transition-shadow">
            <span className="text-3xl mb-4 block">🚐</span>
            <h2 className="text-2xl font-bold text-[#111] mb-3">Lakóautó kollekció</h2>
            <p className="text-[#666] leading-relaxed mb-6">
              Válassz a prémium flottánkból. Minden igényre van megoldásunk, alaptól a luxusig.
            </p>
            <Link href="/katalogus" className="text-[#1a3a2a] font-semibold hover:underline">
              Katalógus megtekintése →
            </Link>
          </div>
        </div>
        <p className="text-center text-[#666] mt-12">
          Nem tudod melyiket válaszd?{' '}
          <a href="mailto:info@camperrent.hu" className="text-[#1a3a2a] font-semibold hover:underline">
            Írj nekünk!
          </a>
        </p>
      </section>
    </div>
  )
}
