const FEATURES = [
  {
    icon: '⛺',
    title: 'Teljesen felszerelt',
    desc: 'Minden amire szükséged van a kényelmes utazáshoz.',
  },
  {
    icon: '🌍',
    title: 'Egész Európában',
    desc: 'Egyirányú bérlés és több átvételi pont Európa-szerte.',
  },
  {
    icon: '✦',
    title: 'Egyszerű foglalás',
    desc: 'Könnyű foglalási folyamat és 24/7 támogatás.',
  },
]

export default function Features() {
  return (
    <section className="py-10 px-4 md:px-10 bg-white border-t border-[#f0f0f0]">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 md:grid-cols-3 gap-8">
        {FEATURES.map((f) => (
          <div key={f.title} className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-[#f0f0ee] flex items-center justify-center text-base flex-shrink-0 mt-0.5">
              {f.icon}
            </div>
            <div>
              <h3 className="font-semibold text-[#111] text-sm mb-1">{f.title}</h3>
              <p className="text-[#777] text-xs leading-relaxed">{f.desc}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
