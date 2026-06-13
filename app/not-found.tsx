import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-[85vh] bg-[#f7f6f3] flex items-center px-4 md:px-10 py-20">
      <div className="max-w-[960px] mx-auto w-full grid grid-cols-1 md:grid-cols-[1fr_320px] gap-12 items-center">

        {/* Left */}
        <div>
          <p className="text-[11px] tracking-[0.25em] uppercase text-[#bbb] mb-8">
            GPS · Hibakód 404
          </p>

          <div className="relative mb-6">
            <span className="block text-[clamp(96px,18vw,180px)] font-black text-[#111] leading-none tracking-tighter select-none">
              404
            </span>
            <span className="absolute bottom-3 right-0 text-[11px] tracking-[0.15em] uppercase text-[#ccc] hidden md:block">
              Útvonal nem található
            </span>
          </div>

          <h1 className="text-2xl md:text-3xl font-black text-[#111] mb-3 leading-snug">
            Újratervezés folyamatban…
          </h1>
          <p className="text-[#777] text-base leading-relaxed mb-10 max-w-[42ch]">
            A GPS feladta. Ez az útvonal nem szerepel a térképen — de a többi igen.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors"
            >
              Főoldal
            </Link>
            <Link
              href="/utazasok"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[#e6e4df] text-[#555] text-sm hover:border-[#999] transition-colors"
            >
              Útvonalak →
            </Link>
            <Link
              href="/katalogus"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[#e6e4df] text-[#555] text-sm hover:border-[#999] transition-colors"
            >
              Lakóautók →
            </Link>
          </div>
        </div>

        {/* Right — fake "broken" trip card */}
        <div className="bg-white border border-[#e6e4df] rounded-2xl overflow-hidden shadow-sm">
          {/* Image placeholder */}
          <div className="w-full h-44 bg-[#f0ede7] flex items-center justify-center relative overflow-hidden">
            <div className="absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage: 'repeating-linear-gradient(45deg, #111 0, #111 1px, transparent 0, transparent 50%)',
                backgroundSize: '12px 12px',
              }}
            />
            <div className="text-center z-10">
              <p className="text-[40px] font-black text-[#ddd] leading-none">?</p>
              <p className="text-[10px] tracking-[0.2em] uppercase text-[#ccc] mt-1">Nincs kép</p>
            </div>
          </div>

          {/* Card body */}
          <div className="p-5">
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#ccc] mb-2">
              Útvonal 404 · Ismeretlen
            </p>
            <p className="font-extrabold text-[#111] text-base mb-4 leading-snug">
              Ismeretlen célállomás
            </p>

            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { val: '—', label: 'nap' },
                { val: '0 km', label: 'táv' },
                { val: '—', label: 'kemping' },
              ].map(({ val, label }) => (
                <div key={label} className="bg-[#f7f6f3] rounded-xl py-3 px-2 text-center">
                  <p className="text-sm font-black text-[#ccc]">{val}</p>
                  <p className="text-[9px] tracking-[0.1em] uppercase text-[#ccc] mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-[#e6e4df] pt-4 flex items-center justify-between">
              <span className="text-[#ccc] text-sm font-semibold">Nem elérhető</span>
              <span className="text-[11px] tracking-[0.1em] uppercase text-[#ddd]">404 Ft</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
