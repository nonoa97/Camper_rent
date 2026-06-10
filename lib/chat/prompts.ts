import { AvailabilityCriteria, ConversationState, FlowState, SessionMemory } from './state'
import { CamperResult } from './availability'
import { FaqItem } from './faq'
import { CatalogEntry } from './catalog'
import { ExtraItem } from './extras'

export type SearchType = 'specific' | 'earliest' | 'fallback_earliest' | 'branch'

export interface GptContext {
  state: ConversationState
  flowState?: FlowState
  sessionMemory?: SessionMemory
  nextQuestion: string | null
  camperResults: CamperResult[]
  allowedCamperSlugs: string[]
  mode: 'ask_next_question' | 'recommend' | 'availability' | 'faq' | 'booking' | 'catalog'
  searchType?: SearchType
  requestedMonth?: string  // set when specific month search returned empty → fell back to earliest
  specificCamperSlug?: string  // set for targeted "ez mikor elérhető?" queries
  refinementNote?: string  // set for iterative recommendation refinement or boundary cases
  offerExtras?: boolean   // true only on first successful camper recommendation
  extrasItems?: ExtraItem[]   // loaded from Supabase when offerExtras=true
  catalogSummary?: CatalogEntry[]  // loaded from Supabase when mode=catalog
  faqItems?: FaqItem[]    // loaded from Supabase when mode is faq
  skipNote?: string           // set when user just skipped a checklist field — GPT should acknowledge
  positiveAcknowledgement?: boolean  // user expressed satisfaction with last shown camper
  shouldSummarize?: boolean   // true when a summary before recommendation is warranted
  branchSummaries?: {
    label: string
    criteria: AvailabilityCriteria
    resultCount: number
  }[]
}

export const SYSTEM_PROMPT = `Te a VanLife Europe digitális lakóautó-tanácsadója vagy.
Egy tapasztalt, természetes hangú tanácsadóként kommunikálsz. A backend dönt a flow-ról, keresésről, memóriáról és validációról; te a kapott CONTEXT alapján válaszolsz.

This is an ongoing chat session, not isolated Q&A.
ConversationState, FlowState and SessionMemory are the authoritative memory layers.
Conversation history is conversational context only.

=== CONTEXT = IGAZSÁGFORRÁS ===
A CONTEXT az IGAZSÁGFORRÁS: state, FlowState, SessionMemory, camperResults, allowedCamperSlugs, availableSlots, FAQ data, search flags, refinementNote, nextQuestion.
Csak a CONTEXT-ben lévő adatokat használd. Ha a backend már eldöntötte a nextQuestiont, allowedSlugsot vagy availableSlotsot, ne gondold újra.

=== NE TALÁLJ KI ===
Tilos kitalálni: árat, felszereltséget, műszaki adatot, méretet, évjáratot, garázs magasságot, váltó típust, biztosítási feltételeket, biztosítás, kauciót, kaució, kedvezményeket, szabályokat, extrákat, elérhetőséget, foglalási feltételeket, jogosítvány szabályokat, jogosítvány szabályok, korhatárt, korhatár.
Ha az adat nincs a CONTEXT-ben, mondd természetesen:
"Erről jelenleg nincs pontos információm."
vagy:
"Ezt nem látom a rendszerben."
Szükség esetén irányíts a [kapcsolat](/kapcsolat) oldalra.

=== STÍLUS ===
Max 3-4 mondat.
Tegező.
A user nyelvén válaszolj.
Ne köszönj újra folyamatban lévő beszélgetésben.
Ne beszélj robotikusan.
Ha a user módosít valamit, fogadd el röviden és menj tovább a backend által kijelölt irányba.

=== MODE CONTRACT ===

mode = "ask_next_question":
- A nextQuestion mező a pontos következő kérdés.
- Röviden reagálj, majd tedd fel SZÓRÓL SZÓRA a nextQuestion szövegét.
- Csak a nextQuestion kérdést tedd fel.
- TILOS autót ajánlani.
- TILOS elérhetőséget keresni vagy ígérni.
- recommendations: [] kötelező.

mode = "recommend":
- Csak allowedCamperSlugs-ból ajánlhatsz.
- Maximum 1-2 autót ajánlj.
- Ha camperResults üres, mondd el őszintén, és segíts feltételt módosítani.
- Ha fallback vagy kért-hónap-nem-elérhető flag van a CONTEXT-ben, különítsd el a kért időszakot az alternatívától.
- Ha branchSummaries van, a backend több rugalmas feltételágat keresett; kommunikáld röviden, mely ágakra néztünk rá.
- Ha refinementNote van, arra reagálj.
- Ha positiveAcknowledgement=true és nincs erősebb szándék, röviden tereld a foglalási/kontakt lépés felé.
- Ne ismételd hosszan a UI kártyán látható adatokat.

Ajánlás indoklása:
A reason mező kötelező.
Csak CONTEXT-ben szereplő objektív adatokra hivatkozhatsz: kapacitás, típus, ár, vadkemping alkalmasság, elérhetőség, időtartam, hard requirement egyezés, soft preference egyezés, iteratív összehasonlítás.
Tilos reason-ben kitalálni: felszereltség, műszaki adat, méret, évjárat, váltó, biztosítás, kaució, kedvezmény, jogosítvány, korhatár.

Ha shouldSummarize=true:
Az ajánlás előtt adj rövid összefoglalót: "Amit a userről tudunk:".
Legyen rövid, természetes, és csak a CONTEXT alapján írd.

Ha Available extras blokk szerepel:
Az autóajánlás után 1-2 mondatban ajánlj 2-3 releváns extrát a megadott listából.
Ne találj ki új extrát.
Zárd [Kiegészítők](/extrak) linkkel.

mode = "availability":
- Csak a CONTEXT-ben szereplő elérhetőségi adatokat használd.
- Ne találj ki dátumot vagy szabad időszakot.
- Ha nincs találat, mondd el őszintén.
- Fallback alternatívát különítsd el a kért időszaktól.
- Konkrét autó availability kérdésnél arra az autóra fókuszálj.
- recommendations: [] kötelező.

mode = "faq":
- Csak a CONTEXT FAQ adataiból dolgozz.
- Ne találj ki szabályt, díjat, korhatárt, biztosítást, kauciót vagy kedvezményt.
- Ha nincs megfelelő adat, mondd el őszintén, és irányítsd a [kapcsolat](/kapcsolat) oldalra.
- Csak a feltett FAQ kérdésre válaszolj.
- Ne tegyél fel checklist-kérdést.
- recommendations: [] kötelező.

mode = "booking":
- A user explicit foglalási szándékot jelzett.
- Röviden segíts, és irányítsd a [kapcsolat](/kapcsolat) oldalra.
- Ne indíts új checklistet.

mode = "catalog":
- Mutasd be röviden a fő kategóriákat, ha a CONTEXT tartalmazza őket.
- Ajánld az [Összes lakóautó](/katalogus) oldalt.
- Ne indíts checklistet azonnal.
- recommendations: [] kötelező.

=== OUTPUT FORMAT ===
Mindig valid JSON objektumot adj vissza:
{
  "reply": "string",
  "recommendations": [{ "slug": "string", "reason": "string" }],
  "links": [{ "label": "string", "href": "string" }]
}

reply legyen rövid, természetes és CONTEXT alapú.
recommendations csak allowedCamperSlugs-ból lehet, maximum 2.
Olyan mode-ban, ahol nincs ajánlás, recommendations legyen [].
links csak releváns következő lépést tartalmazzon.`

export function buildContextBlock(ctx: GptContext): string {
  if (ctx.mode === 'ask_next_question') {
    const skipNote = ctx.skipNote
      ? `\n[skipNote:\n"The user skipped or could not answer the previous field: ${ctx.state.lastAskedField}."]\n`
      : ''
    return `--- CONTEXT ---
mode: ask_next_question

state:
${JSON.stringify(ctx.state)}

flowState:
${JSON.stringify(ctx.flowState ?? {})}

sessionMemory:
${JSON.stringify(ctx.sessionMemory ?? {})}

nextQuestionField: ${ctx.state.lastAskedField ?? 'unknown'}

nextQuestion:
"${ctx.nextQuestion}"
${skipNote}
requirements:
- Ask ONLY the nextQuestion — do NOT add your own questions.
- The reply must end with nextQuestion verbatim.
- Keep any preceding acknowledgment to 1 sentence maximum.
- recommendations must be [].
--- END CONTEXT ---`
  }

  if (ctx.mode === 'faq') {
    const faqBlock = ctx.faqItems && ctx.faqItems.length > 0
      ? ctx.faqItems.map(item => `[${item.category}] ${item.question} → ${item.answer}`).join('\n')
      : '[if empty:\n"No matching FAQ data was loaded. Do not invent information."]'

    const activeFlowNote = ctx.state.lastShownCamperSlug
      ? `[activeFlow: recommendation — lastShownCamper: ${ctx.state.lastShownCamperSlug}]\n`
      : ''

    return `--- CONTEXT ---
mode: faq

${activeFlowNote}faqSource: Supabase faq_items

FAQ data:
${faqBlock}

requirements:
- Use only FAQ data above.
- Answer the FAQ only; do not ask checklist follow-up questions.
- recommendations must be [].
--- END CONTEXT ---`
  }

  if (ctx.mode === 'catalog') {
    const catLines: string[] = []
    if (ctx.catalogSummary && ctx.catalogSummary.length > 0) {
      for (const entry of ctx.catalogSummary) {
        catLines.push(`- ${entry.type}: ${entry.count} available, ${entry.minPrice.toLocaleString('hu-HU')}–${entry.maxPrice.toLocaleString('hu-HU')} Ft/nap`)
      }
    } else {
      catLines.push('- Camper van: compact, easy to drive, usually 2-4 people.')
      catLines.push('- Alkóvos: spacious interior, good for families or groups, usually 4-6 people.')
      catLines.push('- Integrált: premium layout, unified living space, usually 2-6 people.')
    }

    return `--- CONTEXT ---
mode: catalog

Categories:
${catLines.join('\n')}

catalogLink:
label: "Összes lakóautó megtekintése"
href: "/katalogus"

dataLimitations:
- Exact availability is not checked here — refer to /katalogus for live status.
- Do not invent specific equipment or individual availability details.

requirements:
- recommendations must be [].
--- END CONTEXT ---`
  }

  if (ctx.specificCamperSlug) {
    const c = ctx.camperResults[0]
    const slots = c
      ? c.availableSlots.map(s => `- ${s.from} – ${s.to} (${s.days} days)`).join('\n')
      : ''
    const fallbackLine = ctx.searchType === 'fallback_earliest' ? '\n[fallbackSearch: true]\n' : ''
    const requestedMonthLine = ctx.requestedMonth ? `\n[requestedMonth: ${ctx.requestedMonth}]\n` : ''
    const availabilityBlock = slots || '[if empty:\n"No available periods found within the search window."]'

    return `--- CONTEXT ---

mode: availability

queryType: specific_camper

targetCamper:

slug: ${ctx.specificCamperSlug}

name: ${c ? c.name : ctx.specificCamperSlug}
${fallbackLine}${requestedMonthLine}
availability:

${availabilityBlock}

requirements:

- Focus on this camper only.

- recommendations must be [].

--- END CONTEXT ---`
  }

  // General mode: recommend, availability, booking
  const parts: string[] = []

  parts.push(`--- CONTEXT ---`)
  parts.push(``)
  parts.push(`mode: ${ctx.mode}`)
  parts.push(``)

  parts.push(`=================================================================`)
  parts.push(`SESSION LAYERS`)
  parts.push(`=================================================================`)
  parts.push(``)
  parts.push(`ConversationState:`)
  parts.push(JSON.stringify(ctx.state))
  parts.push(``)
  parts.push(`FlowState:`)
  parts.push(JSON.stringify(ctx.flowState ?? {}))
  parts.push(``)
  parts.push(`SessionMemory:`)
  parts.push(JSON.stringify(ctx.sessionMemory ?? {}))
  parts.push(``)
  parts.push(`Conversation history is natural-language context only. Backend decisions come from these structured layers and computed data below.`)
  parts.push(``)

  // DATA SOURCES
  parts.push(`=================================================================`)
  parts.push(`DATA SOURCES`)
  parts.push(`=================================================================`)
  parts.push(``)
  parts.push(`availableData: ConversationState, FlowState, SessionMemory, camperResults, allowedCamperSlugs, searchFlags`)
  parts.push(``)
  parts.push(`This context DOES NOT contain FAQ information.`)
  parts.push(``)
  parts.push(`If rules, insurance, deposit, discounts or licence requirements are needed,`)
  parts.push(`they are not available here.`)
  parts.push(``)

  // USER SUMMARY
  parts.push(`=================================================================`)
  parts.push(`USER SUMMARY`)
  parts.push(`=================================================================`)
  parts.push(``)
  parts.push(`knownUserData:`)
  parts.push(``)
  if (ctx.state.month) parts.push(`[month: ${ctx.state.month}]`)
  if (ctx.state.startDate) parts.push(`[startDate: ${ctx.state.startDate}]`)
  if (ctx.state.endDate) parts.push(`[endDate: ${ctx.state.endDate}]`)
  if (ctx.state.earliestAvailable) parts.push(`[earliestAvailable: true]`)
  if (ctx.state.durationDays) parts.push(`[durationDays: ${ctx.state.durationDays}]`)
  if (ctx.state.passengers) parts.push(`[passengers: ${ctx.state.passengers}]`)
  if (ctx.state.campingType) parts.push(`[campingType: ${ctx.state.campingType}]`)
  if (ctx.state.extraRequirements?.length) {
    parts.push(`[hardRequirements: ${ctx.state.extraRequirements.join(', ')}]`)
  }
  if (ctx.state.softPreferences?.length) {
    parts.push(`[softPreferences: ${ctx.state.softPreferences.join(', ')}]`)
  }
  parts.push(``)

  // CONVERSATION FLAGS
  parts.push(`=================================================================`)
  parts.push(`CONVERSATION FLAGS`)
  parts.push(`=================================================================`)
  parts.push(``)
  if (ctx.state.lastShownCamperSlug) {
    const shown = ctx.camperResults.find(r => r.slug === ctx.state.lastShownCamperSlug)
    const shownName = shown ? shown.name : ctx.state.lastShownCamperSlug
    parts.push(`[lastShownCamper:`)
    parts.push(`slug: ${ctx.state.lastShownCamperSlug}`)
    parts.push(`name: ${shownName}`)
    parts.push(`]`)
    parts.push(``)
  }
  if (ctx.positiveAcknowledgement) parts.push(`[positiveAcknowledgement: true]`)
  if (ctx.shouldSummarize) parts.push(`[shouldSummarize: true]`)
  parts.push(``)

  // CONVERSATION MEMORY
  parts.push(`=================================================================`)
  parts.push(`CONVERSATION MEMORY`)
  parts.push(`=================================================================`)
  parts.push(``)
  if (ctx.state.conversationMemory) {
    parts.push(JSON.stringify(ctx.state.conversationMemory))
  } else {
    parts.push(`[empty]`)
  }
  parts.push(``)
  parts.push(`Use this memory for wording and continuity. Deterministic reference resolution is handled by the backend.`)
  parts.push(``)

  // SEARCH FLAGS
  parts.push(`=================================================================`)
  parts.push(`SEARCH FLAGS`)
  parts.push(`=================================================================`)
  parts.push(``)
  if (ctx.searchType === 'fallback_earliest') {
    if (ctx.requestedMonth) {
      parts.push(`[requestedMonthUnavailable: ${ctx.requestedMonth}]`)
    }
    parts.push(`[fallbackEarliest]`)
  }
  if (ctx.searchType === 'earliest') parts.push(`[earliestSearch]`)
  if (ctx.searchType === 'branch') parts.push(`[branchSearch]`)
  if (ctx.camperResults.length === 0) parts.push(`[noMatchingResults]`)
  parts.push(``)

  if (ctx.branchSummaries?.length) {
    parts.push(`=================================================================`)
    parts.push(`BRANCH SUMMARIES`)
    parts.push(`=================================================================`)
    parts.push(``)
    parts.push(`branchSummaries:`)
    ctx.branchSummaries.forEach(branch => {
      parts.push(`- label: ${branch.label}`)
      parts.push(`  criteria: ${JSON.stringify(branch.criteria)}`)
      parts.push(`  resultCount: ${branch.resultCount}`)
    })
    parts.push(``)
  }

  // REFINEMENT
  if (ctx.refinementNote) {
    parts.push(`=================================================================`)
    parts.push(`REFINEMENT`)
    parts.push(`=================================================================`)
    parts.push(``)
    if (ctx.state.refinementPreference) {
      parts.push(`[currentRefinement: ${ctx.state.refinementPreference}]`)
    }
    if (ctx.refinementNote.includes('HATÁRESET')) {
      parts.push(`[boundaryReached]`)
    }
    parts.push(``)
    parts.push(`refinementNote: ${ctx.refinementNote}`)
    parts.push(``)
  }

  // ALLOWED RECOMMENDATIONS
  parts.push(`=================================================================`)
  parts.push(`ALLOWED RECOMMENDATIONS`)
  parts.push(`=================================================================`)
  parts.push(``)
  parts.push(`allowedCamperSlugs:`)
  parts.push(``)
  parts.push(`[`)
  ctx.allowedCamperSlugs.forEach(slug => parts.push(`${slug},`))
  parts.push(`]`)
  parts.push(``)

  // AVAILABLE CAMPERS
  parts.push(`=================================================================`)
  parts.push(`AVAILABLE CAMPERS`)
  parts.push(`=================================================================`)
  parts.push(``)
  parts.push(`camperResults:`)
  parts.push(``)
  if (ctx.camperResults.length > 0) {
    ctx.camperResults.forEach(c => {
      const wildTag = c.wildCampingSuitable === true ? 'yes' : c.wildCampingSuitable === false ? 'no' : 'unknown'
      parts.push(`- slug: ${c.slug}`)
      parts.push(`  name: ${c.name}`)
      parts.push(`  type: ${c.type ?? '?'}`)
      parts.push(`  beds: ${c.beds ?? '?'}`)
      parts.push(`  pricePerDay: ${c.price_per_day}`)
      parts.push(`  wildCamping: ${wildTag}`)
      parts.push(`  availableSlots:`)
      if (c.availableSlots.length > 0) {
        c.availableSlots.forEach(slot => {
          parts.push(`    - from: ${slot.from}`)
          parts.push(`      to: ${slot.to}`)
          parts.push(`      days: ${slot.days}`)
        })
      } else {
        parts.push(`    []`)
      }
      parts.push(``)
    })
  } else {
    parts.push(`[if empty: No matching camper results.]`)
  }
  parts.push(``)

  // EXTRAS
  if (ctx.offerExtras) {
    parts.push(`=================================================================`)
    parts.push(`EXTRAS`)
    parts.push(`=================================================================`)
    parts.push(``)
    parts.push(`[offerExtras: true]`)
    parts.push(``)
    parts.push(`Trip context:`)
    if (ctx.state.campingType) parts.push(`campingType: ${ctx.state.campingType}`)
    if (ctx.state.passengers) parts.push(`passengers: ${ctx.state.passengers}`)
    if (ctx.state.durationDays) parts.push(`durationDays: ${ctx.state.durationDays}`)
    if (ctx.state.extraRequirements?.length) parts.push(`hardRequirements: ${ctx.state.extraRequirements.join(', ')}`)
    parts.push(``)
    parts.push(`Available extras:`)
    parts.push(``)
    if (ctx.extrasItems && ctx.extrasItems.length > 0) {
      const byCategory: Record<string, ExtraItem[]> = {}
      for (const item of ctx.extrasItems) {
        if (!byCategory[item.category]) byCategory[item.category] = []
        byCategory[item.category].push(item)
      }
      for (const [category, items] of Object.entries(byCategory)) {
        parts.push(`${category}:`)
        for (const item of items) {
          parts.push(`- ${item.name} (${item.price_per_day.toLocaleString('hu-HU')} Ft/nap)`)
        }
        parts.push(``)
      }
    } else {
      parts.push(`Movement:`)
      parts.push(`- Mountain bike`)
      parts.push(`- Electric scooter`)
      parts.push(`- Electric bike`)
      parts.push(``)
      parts.push(`Outdoor:`)
      parts.push(`- Roof tent`)
      parts.push(`- Fishing equipment`)
      parts.push(`- Hiking equipment`)
      parts.push(``)
      parts.push(`Comfort:`)
      parts.push(`- Portable barbecue`)
      parts.push(`- Garden furniture`)
      parts.push(`- Sun shade`)
      parts.push(``)
      parts.push(`Practical:`)
      parts.push(`- Mobile WiFi`)
      parts.push(`- Extra bedding`)
      parts.push(`- Child seat`)
      parts.push(``)
    }
  }

  // CONTEXT GUARANTEES
  parts.push(`=================================================================`)
  parts.push(`CONTEXT GUARANTEES`)
  parts.push(`=================================================================`)
  parts.push(``)
  parts.push(`Only recommend campers from allowedCamperSlugs.`)
  parts.push(``)
  parts.push(`Only use data present in this context.`)
  parts.push(``)
  parts.push(`Do not invent camper details, availability, equipment, pricing, rules,`)
  parts.push(`or extras outside the provided list.`)
  parts.push(``)
  parts.push(`--- END CONTEXT ---`)

  return parts.join('\n')
}
