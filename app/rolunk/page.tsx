import Image from 'next/image'
import CtaBanner from '@/components/sections/CtaBanner'
import StatsBanner from '@/components/sections/StatsBanner'

const VALUES = [
  {
    title: 'Megbízhatóság',
    desc: 'Minden járművünk rendszeres műszaki ellenőrzésen esik át. Útközben sem hagyunk magadra — ügyfélszolgálatunk mindig elérhető, ha szükséged van ránk.',
    image: 'https://images.unsplash.com/photo-1449965408869-eaa3f722e40d?w=80&q=80',
  },
  {
    title: 'Szabadság',
    desc: 'Nincs kötött program, nincs menetrend. Te döntöd el, merre visz az út — mi csak gondoskodunk arról, hogy az autó tökéletes legyen hozzá.',
    image: 'https://images.unsplash.com/photo-1501555088652-021faa106b9b?w=80&q=80',
  },
  {
    title: 'Személyes odafigyelés',
    desc: 'Nálunk nem vagy egy foglalási szám. Minden ügyfelünkkel személyesen foglalkozunk — az útvonal tervezéstől az autó átadásáig.',
    image: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?w=80&q=80',
  },
]

export default function RolunkPage() {
  return (
    <>

      {/* Intro */}
      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-start">
        <div>
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">A mi történetünk</span>
          <h1 className="text-4xl font-extrabold text-[#111] leading-tight">
            Szenvedélyből született,<br />kalandokra tervezve.
          </h1>
        </div>
        <div className="pt-8">
          <p className="text-[#444] text-base leading-relaxed">
            A VanLife Europe nem csupán egy lakóautós bérlő — mi egy életérzést képviselünk. Azt hisszük, hogy az utazás legjobb módja az, amikor te döntesz: mikor indulsz, hol állsz meg, és meddig maradsz. Flottánk, csapatunk és útvonalaink mind ezt az egyetlen célt szolgálják.
          </p>
        </div>
      </section>

      <div className="border-t border-[#e6e4df] max-w-[1300px] mx-auto" />

      {/* Origin story */}
      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center">
        <div className="relative h-72 rounded-2xl overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&q=80"
            alt="Lakóautó horvát tengerparton"
            fill
            className="object-cover"
          />
        </div>
        <div>
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Hogyan kezdődött</span>
          <h2 className="text-2xl font-extrabold text-[#111] mb-4">Egy hosszú úton született az ötlet</h2>
          <p className="text-[#555] text-sm leading-relaxed mb-3">
            Minden utazónak van egy pillanata, amikor rájön: ez az. Nálunk ez egy horvát tengerparti estén jött el, egy bérelt lakóautó tetején ülve, a csillagos ég alatt. Akkor fogadtuk meg, hogy ezt az érzést másoknak is megadjuk.
          </p>
          <p className="text-[#555] text-sm leading-relaxed">
            Néhány évvel és rengeteg kilométerrel később a VanLife Europe-ból valóság lett. Ami egykor két barát álma volt, mára egy gondosan felépített vállalkozássá nőtte ki magát — amelynek szívében ugyanaz a szenvedély dobog, mint az első napon.
          </p>
        </div>
      </section>

      <div className="border-t border-[#e6e4df] max-w-[1300px] mx-auto" />

      {/* Fleet */}
      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center">
        <div>
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">A flottánk</span>
          <h2 className="text-2xl font-extrabold text-[#111] mb-4">Minden autó egy ígéret</h2>
          <p className="text-[#555] text-sm leading-relaxed mb-3">
            Nem törekszünk a legnagyobb flottára — törekszünk a legjobbra. Minden egyes járművünket személyesen választjuk ki, rendszeres műszaki ellenőrzésen esik át, és gondosan felszereljük mindazzal, amire egy hosszabb úton szükség lehet.
          </p>
          <p className="text-[#555] text-sm leading-relaxed">
            A kompakt camper vantól a tágas alkóvos lakóautóig kínálatunk minden igényt fed — legyen szó páros kiruccanásról, családi nyaralásról vagy baráti csoportos kalandról. Minden autóhoz részletes bemutatót és útravalót biztosítunk.
          </p>
        </div>
        <div className="relative h-72 rounded-2xl overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1527786356703-4b100091cd2c?w=800&q=80"
            alt="Lakóautó flotta"
            fill
            className="object-cover"
          />
        </div>
      </section>

      <div className="border-t border-[#e6e4df] max-w-[1300px] mx-auto" />

      {/* Team */}
      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 md:py-16 grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-14 items-center">
        <div className="relative h-72 rounded-2xl overflow-hidden">
          <Image
            src="https://images.unsplash.com/photo-1522202176988-66273c2fd55f?w=800&q=80"
            alt="Csapatunk"
            fill
            className="object-cover object-top"
          />
        </div>
        <div>
          <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">A csapatunk</span>
          <h2 className="text-2xl font-extrabold text-[#111] mb-4">Utazók, akik értik, mit keresel</h2>
          <p className="text-[#555] text-sm leading-relaxed mb-3">
            Csapatunk tagjai maguk is szenvedélyes utazók. Ismerjük azokat az utakat, amelyeket ajánlunk — nem könyvből, hanem saját tapasztalatból. Ez azt jelenti, hogy valódi tanácsot tudunk adni: melyik útvonal mikor a legjobb, hol érdemes megállni, mire figyelj.
          </p>
          <p className="text-[#555] text-sm leading-relaxed">
            Ügyfélszolgálatunk nemcsak foglaláskor érhető el — útközben is velünk vagy. Ha kérdésed van, elakadsz, vagy csak tanácsot kérsz, egy üzenet és máris segítünk. Mert számunkra az utad nem ér véget az átadásnál.
          </p>
        </div>
      </section>

      <StatsBanner />

      {/* Values */}
      <section className="bg-[#f7f6f3] py-10 md:py-16 px-4 md:px-10">
        <div className="max-w-[1300px] mx-auto">
          <div className="text-center mb-10">
            <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Miért minket válassz</span>
            <h2 className="text-3xl font-extrabold text-[#111]">Amit képviselünk</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {VALUES.map(v => (
              <div key={v.title} className="bg-white border border-[#e6e4df] rounded-2xl p-6 shadow-sm">
                <div className="relative w-11 h-11 rounded-xl overflow-hidden mb-4">
                  <Image src={v.image} alt={v.title} fill className="object-cover" />
                </div>
                <h3 className="font-bold text-[#111] text-base mb-2">{v.title}</h3>
                <p className="text-[#666] text-sm leading-relaxed">{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <CtaBanner />
    </>
  )
}
