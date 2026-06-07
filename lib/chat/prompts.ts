import { ConversationState } from './state'
import { CamperResult } from './availability'
import { FaqItem } from './faq'

export type SearchType = 'specific' | 'earliest' | 'fallback_earliest'

export interface GptContext {
  state: ConversationState
  nextQuestion: string | null
  camperResults: CamperResult[]
  allowedCamperSlugs: string[]
  mode: 'ask_next_question' | 'recommend' | 'availability' | 'faq' | 'booking' | 'catalog'
  searchType?: SearchType
  requestedMonth?: string  // set when specific month search returned empty → fell back to earliest
  specificCamperSlug?: string  // set for targeted "ez mikor elérhető?" queries
  refinementNote?: string  // set for iterative recommendation refinement or boundary cases
  offerExtras?: boolean   // true only on first successful camper recommendation
  faqItems?: FaqItem[]    // loaded from Supabase when mode is faq
}

export const SYSTEM_PROMPT = `Te a VanLife Europe lakóautó-bérlő cég AI asszisztense vagy.
Röviden válaszolj (max 3-4 mondat), tegeződj, alkalmazkodj a felhasználó nyelvéhez.
Soha ne találj ki autót, árat vagy elérhetőséget — csak a CONTEXT adatait használd.

=== KÖTELEZŐ MÓD-SZABÁLYOK ===

mode = "ask_next_question":
  - A nextQuestion mezőben van a PONTOS következő kérdés.
  - Válasz = rövid barátságos mondat (pl. elismerés) + a nextQuestion szó szerint.
  - SZIGORÚAN TILOS: autót ajánlani, elérhetőséget keresni, "Most nézek...", "Megnézem...",
    "Keresek..." stb. mondatokat írni, vagy azt jelezni hogy ajánlás következik.
  - recommendations: [] kötelezően.

mode = "recommend":
  - Ha searchNote tartalmaz "fallback_earliest"-t: ELŐSZÖR mondd el természetesen hogy a kért hónapra/időszakra nem találtál megfelelő szabad autót, AZTÁN ajánld pozitívan az alternatívát.
  - Ha refinementNote tartalmaz "HATÁRESET"-et: közöld a határesetet (pl. "ez már a legolcsóbb megfelelő opció"), és ajánlj segítséget a feltételek módosításában.
  - Ha refinementNote van (nem határeset): reagálj rá és ajánlj a megadott irányba az allowedCamperSlugs-ból.
  - Ha camperResults üres (és nincs refinementNote vagy searchNote): mondd el hogy nem találtál megfelelőt, segíts finomítani a keresést.
  - Ha camperResults van: ajánlj max 1-2 autót allowedCamperSlugs-ból.
  - NE ismételd az autó adatait (a UI kártyán látszik).
  - Ha "=== EXTRA AJÁNLÁS ===" blokk megjelenik: az autóajánlás után természetesen, 1-2 mondatban ajánlj 2-3 releváns extrát — NEM lista, szövegbe ágyazva. Zárd [Kiegészítők](/extrak) linkkel.

mode = "availability":
  - Mutasd meg mikor szabad az autó a camperResults alapján.

mode = "faq":
  - A CONTEXT részben lévő FAQ adatokat használd tényforrásként — kizárólag ezekből dolgozz.
  - Értsd meg a kérdést, keress releváns bejegyzést, fogalmazd meg természetesen saját szavakkal.
  - NE találj ki új szabályokat, díjakat, korhatárokat, feltételeket.
  - Ha nincs megfelelő adat a betöltött FAQ-ban: "Erről jelenleg nem találok pontos információt — keresd fel a [kapcsolat](/kapcsolat) oldalt."

mode = "booking":
  - Irányítsd a usert: [kapcsolat](/kapcsolat)

mode = "catalog":
  - Mutasd be röviden a kínálatot 3 kategória szerint (camper-van, alkóvos, integrált).
  - Ajánld a teljes listát: [Összes lakóautó](/katalogus)
  - TILOS: checklistet indítani, dátumot/főt kérdezni, konkrét autót keresni.
  - recommendations: [] kötelezően.

=== VÁLASZ FORMÁTUM — mindig valid JSON ===
{
  "reply": "string",
  "recommendations": [{ "slug": "string — csak allowedCamperSlugs-ból", "reason": "string" }],
  "links": [{ "label": "string", "href": "string" }]
}`

export function buildContextBlock(ctx: GptContext): string {
  // ask_next_question: GPT only needs the question, not availability data
  if (ctx.mode === 'ask_next_question') {
    return `--- CONTEXT ---
mode: ask_next_question
state: ${JSON.stringify(ctx.state)}

KÖTELEZŐ FELADAT: Írj egy rövid, barátságos megerősítő mondatot, majd a válasz UTOLSÓ MONDATA PONTOSAN ez legyen, szó szerint:
"${ctx.nextQuestion}"

recommendations: []
--- END CONTEXT ---`
  }

  // FAQ: load items from Supabase and pass as fact source — no recommendations
  if (ctx.mode === 'faq') {
    const faqBlock = ctx.faqItems && ctx.faqItems.length > 0
      ? ctx.faqItems
          .map(item => `[${item.category}] ${item.question} → ${item.answer}`)
          .join('\n')
      : '(Nem sikerült betölteni a FAQ adatokat — ne találj ki információt.)'

    return `--- CONTEXT ---
mode: faq
FAQ adatok (Supabase, csak ebből dolgozz):
${faqBlock}

SZABÁLY: Kizárólag a fenti adatokból válaszolj. Ha nincs megfelelő adat, jelezd hogy nem találsz pontos információt.
recommendations: []
--- END CONTEXT ---`
  }

  // Catalog: general inventory overview, no Supabase data, no recommendations
  if (ctx.mode === 'catalog') {
    return `--- CONTEXT ---
mode: catalog
Kínálat összefoglaló (statikus):
  - Camper-van: kompakt, könnyen manőverezhető, 2-4 fő · ~25.000–35.000 Ft/nap
  - Alkóvos: tágas belső, kiváló klíma-megoldás, 4-6 fő · ~35.000–50.000 Ft/nap
  - Integrált: prémium kivitel, egységes belső tér, 2-6 fő · ~45.000–60.000 Ft/nap

FELADAT: Rövid, barátságos kínálat-áttekintő — max 3-4 mondat. Mutasd a 3 kategóriát, majd ajánld: [Összes lakóautó megtekintése](/katalogus)
TILOS: checklistet indítani, dátumot/főt kérdezni, konkrét autót keresni, ajánlásokat felsorolni.
recommendations: []
--- END CONTEXT ---`
  }

  // Specific camper availability: only show that one car's slots, no recommendations allowed
  if (ctx.specificCamperSlug) {
    const c = ctx.camperResults[0]
    const slots = c
      ? c.availableSlots.map(s => `${s.from}–${s.to} (${s.days} nap)`).join(', ')
      : 'nincs szabad időpont a keresett időszakban'
    const searchNote = ctx.searchType === 'fallback_earliest' && ctx.requestedMonth
      ? `A kért hónap (${ctx.requestedMonth}) tele volt — ezek a legközelebbi szabad időpontok.`
      : ''

    return `--- CONTEXT ---
mode: availability
specificCamper: ${ctx.specificCamperSlug} — CSAK ennek az autónak az elérhetőségét mutasd meg.
${searchNote}
${c ? `Autó: ${c.name} | Szabad időszakok: ${slots}` : `Autó: ${ctx.specificCamperSlug} | Nincs szabad időpont a következő 6 hónapban.`}

TILOS: más autót ajánlani, checklistet folytatni, kérdezni.
recommendations: []
--- END CONTEXT ---`
  }

  const camperSummary = ctx.camperResults.map(c => {
    const slots = c.availableSlots.map(s => `${s.from}–${s.to} (${s.days} nap)`).join(', ')
    return `  - ${c.slug} | ${c.name} | ${c.type ?? '?'} | ${c.capacity ?? '?'} fő | ${c.price_per_day.toLocaleString('hu-HU')} Ft/nap | Szabad: ${slots}`
  }).join('\n')

  const searchNote = ctx.searchType === 'earliest'
    ? 'searchNote: A user legkorábbit kért — ezek a következő szabad időpontok.'
    : ctx.searchType === 'fallback_earliest' && ctx.requestedMonth
      ? `searchNote: A kért hónap (${ctx.requestedMonth}) tele volt. Ezek a legközelebbi szabad időpontok — ELŐSZÖR mondd el hogy arra a hónapra nem találtál megfelelő szabad autót, AZTÁN ajánld ezeket természetesen.`
      : ctx.searchType === 'fallback_earliest'
        ? 'searchNote: Erre az időszakra nincs találat. Ezek a legkorábbi szabad időpontok — ajánld fel természetesen.'
        : ''

  const refinementLine = ctx.refinementNote ? `refinementNote: ${ctx.refinementNote}` : ''

  const extrasBlock = ctx.offerExtras ? `
=== EXTRA AJÁNLÁS ===
Csak ennél az ajánlásnál, egyszer: ajánlj 2-3 releváns kiegészítőt az utazáshoz (1-2 mondatban, szövegbe ágyazva, NEM lista).
Válassz az alábbiak közül a trip kontextusa alapján (${ctx.state.campingType ?? '?'}, ${ctx.state.passengers ?? '?'} fő, ${ctx.state.durationDays ?? '?'} nap${ctx.state.extraRequirements?.length ? ', igények: ' + ctx.state.extraRequirements.join(', ') : ''}):

Elérhető extrák:
  Mozgás: Hegyi kerékpár · Elektromos roller · Elektromos kerékpár
  Outdoor: Tetősátor · Horgászfelszerelés · Túrafelszerelés
  Kültéri kényelem: Hordozható barbecue grill · Kerti bútor szett · Napvitorla / ponyva
  Praktikus: Mobil WiFi router · Extra ágynemű szett · Gyerekülés

Zárd egy [Kiegészítők](/extrak) linkkel. NE ajánlj olyat ami nincs a listán.
=== END EXTRA ===` : ''

  return `--- CONTEXT ---
mode: ${ctx.mode}
${searchNote}
${refinementLine}
allowedCamperSlugs: [${ctx.allowedCamperSlugs.join(', ')}]
state: ${JSON.stringify(ctx.state)}

camperResults (${ctx.camperResults.length} autó):
${camperSummary || '  (nincs találat)'}
${extrasBlock}
--- END CONTEXT ---`
}
