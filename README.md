# VanLife Europe

Prémium lakóautó bérlési platform — Next.js, Supabase, Stripe és AI alapokon.

Bemutató projekt, amely egy valós ügyfélnek szállítható, teljes körű weboldalt modellez: szűrhető katalógus, kurált útvonalak megvásárolható digitális tervekkel, AI ajánló chatbot, Stripe fizetés és admin felület.

---

## Funkciók

- **Lakóautó katalógus** — szűrhető (férőhely, típus, komfort), Supabase-ből töltve
- **Részletes autóoldalak** — képgaléria, specifikációk, felszereltség, elérhetőségi naptár
- **Kurált útvonalak** — előre összeállított trip csomagok megvásárolható tervekkel
- **Stripe checkout** — Apple Pay / Google Pay / bankkártya támogatással
- **Freemium logika** — 1 ingyenes útvonal, többi fizetős
- **AI chatbot** — kamper és útvonal ajánló asszisztens a valós kínálat alapján
- **Supabase Auth** — email + Google bejelentkezés, vásárlásokhoz kötött user fiókok
- **Admin panel** — autók, utak és elérhetőség kezelése ügyfél által, kód nélkül

---

## Techstack

| Réteg | Technológia |
|---|---|
| Framework | Next.js 16 (App Router, TypeScript) |
| Styling | Tailwind CSS v4 |
| Adatbázis | Supabase (PostgreSQL + Storage) |
| Auth | Supabase Auth (email + OAuth2/JWT) |
| Fizetés | Stripe Checkout |
| AI | Claude / GPT-4 API |
| Hosting | Vercel |

---

## Oldalak

| Útvonal | Leírás |
|---|---|
| `/` | Főoldal — hero, kamper carousel, útvonalak, testimonials |
| `/katalogus` | Szűrhető lakóautó lista |
| `/katalogus/[slug]` | Részletes autóoldal naptárral |
| `/fedezd-fel` | Választó oldal — útvonalak vagy katalógus |
| `/utazasok` | Kurált útvonalak listája |
| `/utazasok/[slug]` | Részletes trip oldal Stripe checkout-tal |
| `/extrak` | Kiegészítő felszerelések |
| `/rolunk` | Bemutatkozás |
| `/gyik` | Animált GYIK accordion |
| `/kapcsolat` | Kapcsolatfelvételi form + térkép |
| `/admin` | Tartalom kezelő felület (védett) |

---

## Fejlesztői setup

### Előfeltételek
- Node.js 18+
- Supabase fiók
- Stripe fiók (test mode)

### Telepítés

```bash
git clone https://github.com/nonoa97/Camper_rent.git
cd Camper_rent
npm install
```

### Környezeti változók

Hozz létre egy `.env.local` fájlt:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
STRIPE_SECRET_KEY=your_stripe_secret_key
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=your_stripe_publishable_key
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Adatbázis seedelése

```bash
node scripts/seed-campers.mjs
```

### Futtatás

```bash
npm run dev
```

Az alkalmazás elérhető: [http://localhost:3000](http://localhost:3000)

---

## Státusz

Aktív fejlesztés alatt. Elkészült oldalak és alap Supabase integráció megvan — Stripe, Auth, AI chatbot és admin panel fejlesztés alatt.
