// Statikus extra-katalógus (kerékpár & roller bérlés lakóautó mellé).
// Forrás: camper_rent_kerekpar_roller_extrak_katalogus. A napi díjak javasolt
// bruttó bérleti árak, nem bolti árak. Képek később cserélhetők gyártói fotókra.

export interface ExtraItem {
  name: string
  tag: string          // pozicionálás + célközönség
  use: string          // mire való
  why: string          // miért jó extra
  spec: string         // fő műszaki adat
  pricePerDay: number
  deposit: number
}

export type ExtraGroup = 'bike' | 'scooter' | 'grill'

export interface ExtraCategory {
  slug: string
  title: string
  audience: string
  priceFrom: number
  priceTo: number
  group: ExtraGroup
  variant: string        // al-szűrő címke (pl. Hagyományos / Elektromos / Faszenes / Gáz)
  electric: boolean
  items: ExtraItem[]
}

export interface ExtraPackage {
  name: string
  contents: string
  pricePerDay: number
  group: 'mobility' | 'grill'
}

export const EXTRAS_INTRO =
  'Nem apró kiegészítőket adunk bérbe, hanem utazási élményt: városnézést, aktív túrát, családi programot és prémium mobilitást. Minden eszközhöz jár sisak, zár és — elektromos eszköznél — töltő. A napi díjak javasolt bruttó árak.'

export const EXTRA_CATEGORIES: ExtraCategory[] = [
  {
    slug: 'kerekpar',
    title: 'Hagyományos kerékpárok',
    audience: 'Családok, városnézők, könnyű túrázók',
    priceFrom: 2900,
    priceTo: 5900,
    group: 'bike',
    variant: 'Hagyományos',
    electric: false,
    items: [
      {
        name: 'Decathlon Riverside 500',
        tag: 'Belépő / közép trekking · felnőtt',
        use: 'Városi tekerés, kerékpárút, könnyű kavicsos utak',
        why: 'Jó ár-érték arányú, könnyen kezelhető hibrid bringa rövidebb és közepes napi távokra.',
        spec: 'Alumínium váz, trekking jelleg, kb. 14 kg.',
        pricePerDay: 3500, deposit: 30000,
      },
      {
        name: 'Trek FX 2 Gen 4',
        tag: 'Középkategóriás fitness / trekking · felnőtt',
        use: 'Város, bringaút, tókerülés, napi kirándulás',
        why: 'Letisztult, jól ismert márka; gyors és kényelmes, mégsem túl sportos.',
        spec: 'Hidraulikus tárcsafék, 1×9 hajtás, 700×35 mm külsők, kb. 12 kg.',
        pricePerDay: 4900, deposit: 50000,
      },
      {
        name: 'Cannondale Quick 4',
        tag: 'Városi / fitness · felnőtt',
        use: 'Gyors városi mozgás, bevásárlás, könnyű kirándulás',
        why: 'Jó „városnézős” kerékpár, amely prémium extraként is jól mutat.',
        spec: 'Könnyű alumínium váz, városi / fitness geometria.',
        pricePerDay: 4900, deposit: 50000,
      },
      {
        name: 'Specialized Sirrus X 3.0',
        tag: 'Prémium all-road hibrid · felnőtt',
        use: 'Város + földút + könnyű gravel jellegű szakaszok',
        why: 'Azoknak, akik nem MTB-t akarnak, de nem csak aszfalton mennének.',
        spec: 'Komfortos, sokoldalú all-road hibrid aszfaltra és köztes terepre.',
        pricePerDay: 5900, deposit: 60000,
      },
      {
        name: 'CUBE Touring ONE',
        tag: 'Felszerelt trekking · felnőtt',
        use: 'Hosszabb túra, napi bevásárlás, városnézés',
        why: 'Csomagtartóval, sárvédővel, világítással kifejezetten lakóautós utazáshoz illik.',
        spec: '1×8 Shimano Essa, hidraulikus tárcsafék, teleszkópos villa, 47 mm gumik.',
        pricePerDay: 5900, deposit: 60000,
      },
      {
        name: 'Trek Marlin 5 Gen 3',
        tag: 'Belépő / közép MTB · felnőtt',
        use: 'Erdei utak, könnyű terep, kemping környéki felfedezés',
        why: 'Stabil, strapabíró érzetű bringa azoknak, akik nem csak aszfalton mennének.',
        spec: 'Teleszkópos villa, 9 sebességes Shimano CUES, csomagtartó rögzítési pontok.',
        pricePerDay: 5900, deposit: 60000,
      },
      {
        name: 'woom ORIGINAL 5',
        tag: 'Prémium gyerek bringa · kb. 7–11 év',
        use: 'Családi túrák, kerékpárút, könnyű városnézés',
        why: 'Könnyű gyerekbringa, amely családi csomagban nagyon jól kommunikálható.',
        spec: '24 colos, kb. 8,7–9 kg, 125–145 cm magassághoz, 8 fokozat.',
        pricePerDay: 3500, deposit: 30000,
      },
      {
        name: 'Rockrider EXPL 500 24"',
        tag: 'Gyerek MTB · kb. 9–12 év',
        use: 'Családi terepezés, erdei utak, kemping környéke',
        why: 'Kedvezőbb árú gyerek MTB, amely jól egészíti ki a családi csomagot.',
        spec: '24 colos gyerek MTB, teleszkópos villa, 7 sebesség, kb. 135–150 cm.',
        pricePerDay: 2900, deposit: 25000,
      },
    ],
  },
  {
    slug: 'e-kerekpar',
    title: 'Elektromos kerékpárok',
    audience: 'Aktív utazók, prémium bérlők, dombos túrák',
    priceFrom: 8900,
    priceTo: 15900,
    group: 'bike',
    variant: 'Elektromos',
    electric: true,
    items: [
      {
        name: 'Fiido D11 Folding',
        tag: 'Összecsukható e-bike · felnőtt',
        use: 'Városi közlekedés, kemping–város transzfer, kis helyigény',
        why: 'Jó első elektromos extra: kompakt, könnyen tárolható, vonzó a városnézőknek.',
        spec: '417,6 Wh kivehető akku, akár 86 km, hidraulikus fék, nyomatékszenzor.',
        pricePerDay: 8900, deposit: 100000,
      },
      {
        name: 'Cannondale Adventure Neo Allroad EQ',
        tag: 'Komfort / városi e-bike · felnőtt',
        use: 'Város, vízpart, könnyű túra, bevásárlás',
        why: 'Nagyon lakóautós jellegű: kényelmes, csomagtartós, lámpás, sárvédős.',
        spec: '250 W agymotor, akár ~75 km gyári hatótáv, rack, sárvédő, lámpa.',
        pricePerDay: 11900, deposit: 150000,
      },
      {
        name: 'Trek Allant+ 7',
        tag: 'Prémium trekking / commuter e-bike · felnőtt',
        use: 'Hosszabb napi túrák, dombos városok, kerékpárutak',
        why: 'Erős prémium tétel, amely csomagban is jól hangzik.',
        spec: 'Bosch rendszer, nagy kapacitású akku; a hatótáv tereptől függ.',
        pricePerDay: 14900, deposit: 200000,
      },
      {
        name: 'Specialized Turbo Vado SL 4.0',
        tag: 'Könnyű prémium városi e-bike · felnőtt',
        use: 'Város, hosszabb bringaút, emelkedős útvonal',
        why: 'Könnyebb, elegánsabb, kevésbé „nehéz e-bike” érzetű.',
        spec: '320 Wh integrált akku, akár 130 km eco; range extenderrel több.',
        pricePerDay: 14900, deposit: 200000,
      },
      {
        name: 'CUBE Reaction Hybrid Performance 500',
        tag: 'E-MTB · felnőtt',
        use: 'Dombos terep, erdei utak, sportosabb kirándulás',
        why: 'Aktív utazóknak, Dolomitok / Garda / Balaton-felvidék jellegű utakhoz.',
        spec: 'Bosch Performance motor, 500 Wh PowerTube, 100 mm teleszkóp, hidraulikus fék.',
        pricePerDay: 15900, deposit: 220000,
      },
      {
        name: 'Rockrider E-EXPL 500S',
        tag: 'Full-suspension e-MTB · felnőtt',
        use: 'Kényelmesebb terepezés, erdei szakaszok, hosszabb túra',
        why: 'Jó ár-érték arányú terepes opció a megfizethetőbb e-MTB csomaghoz.',
        spec: '500 Wh akku, full-suspension kialakítás.',
        pricePerDay: 13900, deposit: 180000,
      },
      {
        name: 'Haibike AllTrack Kids / Youth',
        tag: 'Gyerek / ifjúsági e-MTB · kb. 24"',
        use: 'Családi hegyi túra, dombos kempingek, sportos gyerekek',
        why: 'Ritkább extra, de családos prémium csomagban nagy különbséget jelent.',
        spec: 'Yamaha / Bosch rendszerű gyerek e-hardtail, 400–500 Wh akkuval.',
        pricePerDay: 10900, deposit: 150000,
      },
      {
        name: 'ENGWE EP-2 Pro',
        tag: 'Összecsukható fat e-bike · felnőtt',
        use: 'Laza terep, rosszabb utak, látványos adventure extra',
        why: 'Látványos, jól kommunikálható eszköz; adventure / fat-bike csomagban erős.',
        spec: 'EU 250 W, 25 km/h, 20×4.0 fat gumi, 48 V 13 Ah, kb. 40 km.',
        pricePerDay: 11900, deposit: 160000,
      },
    ],
  },
  {
    slug: 'roller',
    title: 'Hagyományos rollerek',
    audience: 'Gyerekes családok, városi rövid utak',
    priceFrom: 1500,
    priceTo: 2900,
    group: 'scooter',
    variant: 'Hagyományos',
    electric: false,
    items: [
      {
        name: 'Oxelo Mid 7',
        tag: 'Gyerek / teen roller · kb. 9–14 év',
        use: 'Kempingen belül, rövid városi utak, családi séta mellé',
        why: 'Alacsony bekerülési kockázat, jó kiegészítő a családi csomaghoz.',
        spec: '175 mm PU kerekek, ABEC 5 csapágy, kb. 1,25–1,75 m magassághoz.',
        pricePerDay: 1500, deposit: 10000,
      },
      {
        name: 'Micro Sprite',
        tag: 'Prémium gyerek / teen roller · 6+ év',
        use: 'Városnézés, rövid utak, gyerekeknek és kisebb felnőtteknek',
        why: 'Könnyű, összecsukható, minőségi roller; gyerekes bérlőknek jól eladható.',
        spec: '120/100 mm kerekek, kb. 2,7–2,9 kg, állítható kormány, ~100 kg.',
        pricePerDay: 1900, deposit: 15000,
      },
      {
        name: 'Micro Cruiser LED',
        tag: 'Cruising gyerek roller · kb. 6–12 év',
        use: 'Kényelmesebb gurulás, parkok, tóparti sétányok',
        why: 'A 200 mm-es nagy kerék miatt stabilabb és látványosabb gyerek extra.',
        spec: '200 mm LED kerekek, összecsukható, max. ~100 kg.',
        pricePerDay: 2500, deposit: 20000,
      },
      {
        name: 'Razor A5 Lux',
        tag: 'Felnőtt / teen roller · 8+ év',
        use: 'Rövid városi gurulás, kemping, állomás–kemping táv',
        why: 'Ismert, egyszerű, strapabíró és kedvezőbb árú felnőtt roller.',
        spec: '200 mm urethane kerekek, összecsukható váz, állítható kormány, max. 100 kg.',
        pricePerDay: 1900, deposit: 15000,
      },
      {
        name: 'Hudora BigWheel 205',
        tag: 'Ár-érték felnőtt / teen roller',
        use: 'Városi közlekedés, kempingek közti rövid távok',
        why: 'Egyszerű, nagy kerekű, sok bérlőnek megfelelő univerzális modell.',
        spec: '205 mm kerék, összecsukható és állítható kormány, hátsó fék, max. 100 kg.',
        pricePerDay: 1900, deposit: 15000,
      },
      {
        name: 'Globber NL 205 Deluxe',
        tag: 'Középkategóriás felnőtt / teen roller',
        use: 'Városi útvonalak, hosszabb sétányok, kényelmesebb gurulás',
        why: 'Felnőtt és nagyobb gyerek méretre is jó, stabilabb, prémiumabb érzetű.',
        spec: '205 mm kerekek, 8 éves kortól felnőttig, 100 kg, állítható kormány.',
        pricePerDay: 2500, deposit: 20000,
      },
      {
        name: 'Oxelo Town 7 XL',
        tag: 'Kényelmes felnőtt városi roller',
        use: 'Rövid-közepes városi utak, nagyobb kempingek, vízparti sétányok',
        why: 'A kormányfék és a csillapítás jobb komfortot ad, mint egy alap roller.',
        spec: '200 mm kerék, első-hátsó csillapítás, kormányfék, kb. 1,45–1,95 m.',
        pricePerDay: 2500, deposit: 20000,
      },
      {
        name: 'Micro Classic Black',
        tag: 'Prémium felnőtt city roller',
        use: 'Városnézés, bevásárlás, prémium city extra',
        why: 'Kifejezetten felnőtt városi roller, jó megjelenéssel és magasabb napi díjjal.',
        spec: '200 mm PU kerekek, 4,95 kg, 72–103 cm állítható kormány, összecsukható.',
        pricePerDay: 2900, deposit: 25000,
      },
    ],
  },
  {
    slug: 'e-roller',
    title: 'Elektromos rollerek',
    audience: 'Városi transzfer, long-range és prémium mobilitás',
    priceFrom: 2900,
    priceTo: 11900,
    group: 'scooter',
    variant: 'Elektromos',
    electric: true,
    items: [
      {
        name: 'Razor Power Core E90',
        tag: 'Gyerek e-roller · 8+ év',
        use: 'Kemping, zárt terület, rövid családi programok',
        why: 'Olcsóbb, kontrolláltabb gyerek elektromos roller, belépő extra.',
        spec: 'Kb. 16 km/h végsebesség, 60–65 perc folyamatos használat.',
        pricePerDay: 2900, deposit: 30000,
      },
      {
        name: 'Segway Ninebot C2 Pro E',
        tag: 'Prémium gyerek e-roller · kb. 6–14 év',
        use: 'Kemping, zárt parkoló, családi programok',
        why: 'Prémiumabb gyerek e-roller, állítható kormánnyal és nagyobb élményfaktorral.',
        spec: 'Akár 16 km/h, akár 17 km hatótáv, 3 kormánymagasság, 7 colos tömör gumi.',
        pricePerDay: 3900, deposit: 40000,
      },
      {
        name: 'Segway Ninebot E2 Pro E',
        tag: 'Belépő / közép városi e-roller · felnőtt',
        use: 'Rövidebb városi utak, kemping–város transzfer',
        why: 'Olcsóbb felnőtt e-roller, amely a városi alapcsomagba jól illik.',
        spec: '25 km/h max., akár 35 km hatótáv, 750 W max., 10 colos gumi.',
        pricePerDay: 4900, deposit: 80000,
      },
      {
        name: 'Xiaomi Electric Scooter 4 Pro (2nd Gen)',
        tag: 'Közép / prémium városi e-roller · felnőtt',
        use: 'Városnézés, hosszabb part menti utak, napi használat',
        why: 'Ismert márka, jó hatótáv, könnyen érthető ajánlat a bérlőknek.',
        spec: '25 km/h max., kb. 60 km gyári hatótáv, 400 W névleges, 19 kg.',
        pricePerDay: 6900, deposit: 100000,
      },
      {
        name: 'NIU KQi3 Max',
        tag: 'Long-range városi e-roller · felnőtt',
        use: 'Több órás városi program, dombosabb települések',
        why: 'Komolyabb hatótáv és teherbírás — jó „long range” opció.',
        spec: '25 km/h EU, akár 65 km, 608 Wh akku, 450 W névleges / 900 W max.',
        pricePerDay: 7900, deposit: 120000,
      },
      {
        name: 'Segway Ninebot MAX G2 E',
        tag: 'Prémium long-range e-roller · felnőtt',
        use: 'Hosszabb városi utak, dombosabb városnézés, napi közlekedés',
        why: 'Erős, megbízható prémium tétel, magasabb napi díjjal árazható.',
        spec: 'Akár 70 km, 25 km/h, dupla felfüggesztés, TCS, irányjelzők.',
        pricePerDay: 8900, deposit: 140000,
      },
      {
        name: 'Apollo City 2024',
        tag: 'Erős prémium commuter e-roller · felnőtt',
        use: 'Nagyobb városok, komolyabb napi használat',
        why: 'Magas élményfaktor; csak körültekintő szabályozással érdemes adni.',
        spec: 'Dual motor akár 69 km hatótávval; EU használathoz jogi kontroll kell.',
        pricePerDay: 10900, deposit: 180000,
      },
      {
        name: 'Segway Ninebot ZT3 Pro E',
        tag: 'Off-road prémium e-roller · felnőtt',
        use: 'Kemping, kavicsos út, rosszabb burkolat, adventure jelleg',
        why: 'A „wow” roller: látványos és prémium, adventure csomagba ideális.',
        spec: 'Akár 70 km, 25 km/h EU, 11 colos off-road tubeless gumik, 1600 W max.',
        pricePerDay: 11900, deposit: 200000,
      },
    ],
  },
  {
    slug: 'grill-faszenes',
    title: 'Faszenes grillek',
    audience: 'Klasszikus BBQ-élmény, kemping, rövid túrák',
    priceFrom: 4900,
    priceTo: 7900,
    group: 'grill',
    variant: 'Faszenes',
    electric: false,
    items: [
      {
        name: 'Weber Go-Anywhere Charcoal',
        tag: 'Faszenes · kompakt',
        use: '2–4 fő, gyors megállós grillezés, kemping',
        why: 'Kicsi, strapabíró Weber azoknak, akik csak egy korrekt faszenes élményt visznek, nem teljes grillállomást.',
        spec: '36,9 × 53,4 × 31,0 cm · garázs-fit: kiváló',
        pricePerDay: 4900, deposit: 30000,
      },
      {
        name: 'Weber Smokey Joe Premium 37 cm',
        tag: 'Faszenes · gömbgrill',
        use: '2–4 fő, klasszikus BBQ, kempingasztal mellé',
        why: 'A Weber gömbgrill érzés állólábas nagy grill nélkül — városi és kempinges rövid utakra.',
        spec: '43,2 × 36,1 × 42,0 cm · garázs-fit: kiváló',
        pricePerDay: 5900, deposit: 35000,
      },
      {
        name: 'Weber Jumbo Joe 47 cm',
        tag: 'Faszenes · nagyobb hordozható',
        use: '4–6 fő, családi grill, hosszabb kempingezés',
        why: 'Komolyabb sütőfelület több emberre — ha tényleg grilleznél, nem csak pár kolbászt sütnél.',
        spec: '50,0 × 52,0 × 50,0 cm · garázs-fit: jó',
        pricePerDay: 7900, deposit: 50000,
      },
    ],
  },
  {
    slug: 'grill-gaz',
    title: 'Gázgrillek',
    audience: 'Gyors, tiszta grillezés hamukezelés nélkül',
    priceFrom: 6900,
    priceTo: 24900,
    group: 'grill',
    variant: 'Gáz',
    electric: false,
    items: [
      {
        name: 'Weber Go-Anywhere Gas',
        tag: 'Gáz · kompakt',
        use: '2–4 fő, gyors vacsora, hamu nélkül',
        why: 'A faszenes kényelmesebb alternatívája: gyorsan beüzemelhető, nincs parázskezelés, egyszerű visszacsomagolás.',
        spec: '~36,9 × 53,4 × 31,0 cm · garázs-fit: kiváló',
        pricePerDay: 6900, deposit: 45000,
      },
      {
        name: 'Weber Q 1200',
        tag: 'Gáz · prémium kompakt',
        use: '3–5 fő, komolyabb sütések, hosszabb utak',
        why: 'Minőségi outdoor főzőpont, nem csak „bedobjuk a garázsba” grill — jó több kempingestés esetén.',
        spec: '39,4 × 103,9 × 42,0 cm (oldalasztalokkal) · méretellenőrzés ajánlott',
        pricePerDay: 9900, deposit: 75000,
      },
      {
        name: 'Weber Q 2200',
        tag: 'Gáz · nagyobb asztali',
        use: '4–8 fő, családi és társasági grillezés',
        why: 'Nagyobb főzőfelület nagyobb társaságra. Bérlés előtt érdemes a jármű garázsát ellenőrizni.',
        spec: '39,4 × 130,6 × 49,6 cm (oldalasztalokkal) · csak méretellenőrzéssel',
        pricePerDay: 12900, deposit: 100000,
      },
      {
        name: 'Weber Traveler Compact',
        tag: 'Gáz · prémium mobil',
        use: '~4 fő, kényelmes kempinges grillélmény',
        why: 'Összecsukható, kerekes prémium grill — „kész outdoor konyha” érzés. Masszív szállítóhely kell hozzá.',
        spec: '~88,0 × 86,0 × 54,5 cm (mobil állapot) · garázs-check',
        pricePerDay: 18900, deposit: 150000,
      },
      {
        name: 'Weber Traveler',
        tag: 'Gáz · nagy prémium mobil',
        use: '5–8 fő, hosszabb utak, nagyobb társaság',
        why: 'Nagy élménytermék — inkább prémium csomagként, nagyobb garázsos camperhez vagy egyeztetett szállítással.',
        spec: '94,0 × 111,0 × 58,5 cm (zárva) · nagy garázsba',
        pricePerDay: 24900, deposit: 200000,
      },
    ],
  },
]

export const EXTRA_PACKAGES: ExtraPackage[] = [
  { group: 'mobility', name: 'Városi páros bringa', contents: '2 felnőtt városi/trekking kerékpár, 2 zár, 2 sisak', pricePerDay: 8900 },
  { group: 'mobility', name: 'Családi bringa', contents: '2 felnőtt + 2 gyerek kerékpár, sisakokkal és zárakkal', pricePerDay: 13900 },
  { group: 'mobility', name: 'MTB hétvége', contents: '2 felnőtt MTB vagy all-road bringa, alap szerszám és pumpa', pricePerDay: 10900 },
  { group: 'mobility', name: 'E-bike páros', contents: '2 trekking/városi e-bike, töltők, zárak, sisakok', pricePerDay: 27900 },
  { group: 'mobility', name: 'Terep e-bike', contents: '2 e-MTB, töltők, zárak, sisakok, pumpa', pricePerDay: 29900 },
  { group: 'mobility', name: 'Családi e-mix', contents: '2 felnőtt e-bike + 1 gyerek/ifjúsági e-bike + 1 sima gyerek bringa', pricePerDay: 36900 },
  { group: 'mobility', name: 'Városi roller', contents: '2 felnőtt sima roller, vagy 1 felnőtt + 1 gyerek roller', pricePerDay: 4500 },
  { group: 'mobility', name: 'E-roller páros', contents: '2 városi e-roller, töltők, zárak, sisakok', pricePerDay: 13900 },
  { group: 'mobility', name: 'Adventure e-roller', contents: '1 long-range/adventure e-roller, sisak, zár, töltő', pricePerDay: 11900 },
  { group: 'grill', name: 'Faszenes mini grill', contents: 'Kompakt Weber faszenes grill, faszén, gyújtó, eszközök, szállítódoboz', pricePerDay: 7900 },
  { group: 'grill', name: 'Faszenes családi grill', contents: 'Weber Jumbo Joe, nagyobb adag brikett, eszközök, hamu- és szállítódoboz', pricePerDay: 10900 },
  { group: 'grill', name: 'Gáz mini grill', contents: 'Weber Go-Anywhere Gas, gázpatron/palack, eszközök, szállítóláda', pricePerDay: 9900 },
  { group: 'grill', name: 'Gáz komfort grill', contents: 'Weber Q 1200, gázellátás, eszközök, védőtakaró', pricePerDay: 14900 },
  { group: 'grill', name: 'Premium Traveler grill', contents: 'Weber Traveler Compact, gázellátás, eszközök, rögzítőheveder', pricePerDay: 24900 },
]

// Modellenkénti kép. Ahol elérhető volt, gyártói/bolti termékfotó; a többihez
// kategória-illusztráció (Unsplash). Teszt projekt — később valódi fotóra cserélhető.
export const EXTRA_IMAGES: Record<string, string> = {
  // Hagyományos kerékpárok
  'Decathlon Riverside 500': '/extras/fallback-bike-1.jpg',
  'Trek FX 2 Gen 4': '/extras/trek-fx-2.jpg',
  'Cannondale Quick 4': '/extras/cannondale-quick-4.png',
  'Specialized Sirrus X 3.0': '/extras/fallback-bike-2.jpg',
  'CUBE Touring ONE': '/extras/cube-touring-one.jpg',
  'Trek Marlin 5 Gen 3': '/extras/fallback-bike-1.jpg',
  'woom ORIGINAL 5': '/extras/woom-5.jpg',
  'Rockrider EXPL 500 24"': '/extras/fallback-bike-2.jpg',
  // Elektromos kerékpárok
  'Fiido D11 Folding': '/extras/fiido-d11.jpg',
  'Cannondale Adventure Neo Allroad EQ': '/extras/cannondale-adventure-neo.png',
  'Trek Allant+ 7': '/extras/fallback-ebike-1.jpg',
  'Specialized Turbo Vado SL 4.0': '/extras/fallback-ebike-2.jpg',
  'CUBE Reaction Hybrid Performance 500': '/extras/cube-reaction-hybrid.webp',
  'Rockrider E-EXPL 500S': '/extras/fallback-ebike-1.jpg',
  'Haibike AllTrack Kids / Youth': '/extras/fallback-ebike-2.jpg',
  'ENGWE EP-2 Pro': '/extras/engwe-ep-2-pro.jpg',
  // Hagyományos rollerek
  'Oxelo Mid 7': '/extras/fallback-roller-1.jpg',
  'Micro Sprite': '/extras/fallback-roller-2.jpg',
  'Micro Cruiser LED': '/extras/micro-cruiser-led.png',
  'Razor A5 Lux': '/extras/fallback-roller-1.jpg',
  'Hudora BigWheel 205': '/extras/hudora-bigwheel-205.png',
  'Globber NL 205 Deluxe': '/extras/fallback-roller-2.jpg',
  'Oxelo Town 7 XL': '/extras/fallback-roller-1.jpg',
  'Micro Classic Black': '/extras/micro-classic-black.png',
  // Elektromos rollerek
  'Razor Power Core E90': '/extras/fallback-escooter-1.jpg',
  'Segway Ninebot C2 Pro E': '/extras/segway-c2-pro.png',
  'Segway Ninebot E2 Pro E': '/extras/segway-e2-pro.png',
  'Xiaomi Electric Scooter 4 Pro (2nd Gen)': '/extras/fallback-escooter-2.jpg',
  'NIU KQi3 Max': '/extras/niu-kqi3-max.jpg',
  'Segway Ninebot MAX G2 E': '/extras/segway-max-g2.png',
  'Apollo City 2024': '/extras/apollo-city.png',
  'Segway Ninebot ZT3 Pro E': '/extras/fallback-escooter-1.jpg',
  // Grillek
  'Weber Go-Anywhere Charcoal': '/extras/grill-charcoal-1.jpg',
  'Weber Smokey Joe Premium 37 cm': '/extras/grill-charcoal-2.jpg',
  'Weber Jumbo Joe 47 cm': '/extras/grill-charcoal-1.jpg',
  'Weber Go-Anywhere Gas': '/extras/grill-gas-1.jpg',
  'Weber Q 1200': '/extras/grill-gas-2.jpg',
  'Weber Q 2200': '/extras/grill-gas-1.jpg',
  'Weber Traveler Compact': '/extras/grill-gas-2.jpg',
  'Weber Traveler': '/extras/grill-gas-1.jpg',
}

export const EXTRA_NOTES: { title: string; text: string }[] = [
  { title: 'Kaució külön', text: 'Az e-bike és e-roller kategóriánál a kaució külön tétel, nincs beépítve a napi árba.' },
  { title: 'Kiegészítők járnak', text: 'Kerékpárhoz és rollerhez alapból adunk sisakot, zárat és — elektromosnál — töltőt.' },
  { title: 'Átadás-átvétel', text: 'Minden eszköznek egyedi azonosítója, fotózott állapota és ellenőrzött szerviz-státusza van.' },
  { title: 'Helyi szabályok', text: 'Az e-roller és e-bike közúti használata országonként és településenként eltérhet — a bérléskor egyeztetjük.' },
]
