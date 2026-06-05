import Link from 'next/link'
import PageHeader from '@/components/layout/PageHeader'
import CtaBanner from '@/components/sections/CtaBanner'

const EXTRAS = [
  {
    category: 'Mozgás & kaland',
    items: [
      {
        icon: '🚲',
        name: 'Hegyi kerékpár',
        desc: 'Tárcsás fékkel, terepre tervezett gumikkal. Ideális eldugott ösvények felfedezéséhez vagy egyszerűen a szomszéd faluba való kiruccanáshoz.',
      },
      {
        icon: '🛴',
        name: 'Elektromos roller',
        desc: 'Könnyű, összecsukható, városba tökéletes. Parkolóhelytől függetlenül érd el a belvárost, a piacot vagy a strandbejárót.',
      },
      {
        icon: '⚡',
        name: 'Elektromos kerékpár',
        desc: 'Hosszabb szakaszokra, dombokon is könnyedén. Ha élvezni akarod a tájat anélkül, hogy belehalnál a kapaszkodókba — ez a te kiegészítőd.',
      },
    ],
  },
  {
    category: 'Outdoor felszerelés',
    items: [
      {
        icon: '⛺',
        name: 'Tetősátor',
        desc: 'Extra alvóhely az autó tetején — csillagos égbolt garantált. Egyszerűen nyitható, stabilan rögzíthető, és azonnal otthonos érzetet ad bárhol.',
      },
      {
        icon: '🎣',
        name: 'Horgászfelszerelés',
        desc: 'Horgászbot, orsó, műcsalik és egy tárolódoboz — minden, ami kell egy nyugodt parti reggelhez. Tavak, folyók, tengerpart: mind megér egy próbát.',
      },
      {
        icon: '🥾',
        name: 'Túrafelszerelés',
        desc: 'Minőségi hátizsák és trekking botok pár, ha az út az aszfalton túlra visz. Könnyű, tartós, nem foglal sok helyet a csomagtérben.',
      },
    ],
  },
  {
    category: 'Kültéri kényelem',
    items: [
      {
        icon: '🔥',
        name: 'Hordozható barbecue grill',
        desc: 'Egy este a tűz mellett, frissen grillezett vacsorával — ez az igazi lakóautós élmény. Kompakt, könnyen tisztítható, bárhol felállítható.',
      },
      {
        icon: '🪑',
        name: 'Kerti bútor szett',
        desc: 'Összecsukható asztal és négy szék — pár perc alatt terasz bárhol. Reggeliző az erdőszélen, vacsora a tóparton, kártya este a hegyoldalon.',
      },
      {
        icon: '☂️',
        name: 'Napvitorla / ponyva',
        desc: 'Árnyékos hely az autó mellett, esőre is megvéd. Ha hosszabb pihenőt tartasz egy szép helyen, nem akarsz tűző napon ülni a kempingszékben.',
      },
    ],
  },
  {
    category: 'Praktikus kiegészítők',
    items: [
      {
        icon: '📡',
        name: 'Mobil WiFi router',
        desc: 'Korlátlan adat, egész Európában. Akkor is online maradsz, ha nincs térerő a mobilodon — ideális munkából utazóknak vagy navigáláshoz.',
      },
      {
        icon: '🛏️',
        name: 'Extra ágynemű szett',
        desc: 'Puha takaró, extra párna, pléd hidegebb éjszakákra. Mert az első éjszaka egy ismeretlen ágyban is lehet tökéletes, ha van mivel betakaródzni.',
      },
      {
        icon: '👶',
        name: 'Gyerekülés',
        desc: '9–36 kg-os méretben, könnyen beépíthető. Biztonságos, tanúsított, és nem kell magaddal cipelnél a reptérről — ott lesz az autóban, mire szükséged van rá.',
      },
    ],
  },
]

export default function ExtrakPage() {
  return (
    <>
      <PageHeader />

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 pt-14 pb-6 text-center">
        <span className="block text-[10px] tracking-[0.22em] uppercase text-[#888] mb-3">Személyre szabva</span>
        <h1 className="text-4xl font-extrabold text-[#111] mb-4">Pakold fel az autót, ahogy neked kell</h1>
        <p className="text-[#666] text-base max-w-lg mx-auto">
          Kerékpártól tetősátorig, WiFi routertől barbecue grillg — minden extra előre kérhető, hogy az autó már készen várjon, mire átveszed.
        </p>
      </section>

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-12">
        <div className="space-y-14">
          {EXTRAS.map(group => (
            <div key={group.category}>
              <p className="text-[10px] tracking-[0.22em] uppercase text-[#888] mb-6 border-b border-[#ece9e4] pb-3">
                {group.category}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-x-10 gap-y-8">
                {group.items.map(item => (
                  <div key={item.name} className="flex gap-4">
                    <span className="text-2xl flex-shrink-0 mt-0.5">{item.icon}</span>
                    <div>
                      <p className="font-semibold text-[#111] mb-1.5">{item.name}</p>
                      <p className="text-sm text-[#666] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="max-w-[1300px] mx-auto px-4 md:px-10 py-10 mb-4">
        <div className="bg-[#f5f3ef] rounded-2xl px-6 md:px-10 py-8 flex flex-col md:flex-row items-start md:items-center justify-between gap-6 md:gap-10">
          <div>
            <p className="text-[10px] tracking-[0.22em] uppercase text-[#888] mb-2">Hogyan működik?</p>
            <h2 className="text-xl font-extrabold text-[#111] mb-2">Jelezd előre, mi előkészítjük</h2>
            <p className="text-sm text-[#666] leading-relaxed max-w-lg">
              Az extrák foglaláskor vagy e-mailben kérhetők — legkésőbb 3 nappal az átvétel előtt. Mindent előkészítünk, becsomagolunk és berakunk az autóba, hogy neked ne kelljen mással foglalkoznod.
            </p>
          </div>
          <Link
            href="/kapcsolat"
            className="flex-shrink-0 bg-[#1a3a2a] text-white text-sm font-semibold px-7 py-3.5 rounded-xl tracking-wide hover:bg-[#2d4a2d] transition-colors whitespace-nowrap"
          >
            Kérd az extrakat →
          </Link>
        </div>
      </section>

      <CtaBanner
        eyebrow="Következő lépés"
        title="Készen állsz az útra?"
        description="Válassz lakóautót, állítsd össze a felszerelésed, és indulj el — mi a többit intézzük."
        buttonText="Lakóautók megtekintése"
        buttonHref="/katalogus"
        buttonText2="Kapcsolatfelvétel"
        buttonHref2="/kapcsolat"
      />
    </>
  )
}
