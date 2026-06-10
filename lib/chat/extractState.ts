import OpenAI from 'openai'
import { ConversationState, ChecklistField, ReferenceTarget, extractStateFromMessage } from './state'

let _openai: OpenAI | null = null
const getOpenAI = () => {
  if (!_openai) _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return _openai
}

type StateUpdate = Partial<ConversationState>

function buildExtractionPrompt(currentState: ConversationState): string {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const yr = today.getFullYear()
  const mo = today.getMonth() + 1
  const pad = (n: number) => String(n).padStart(2, '0')

  const currentMonth = `${yr}-${pad(mo)}`
  const nextMonthDate = new Date(yr, mo, 1)
  const nextMonth = `${nextMonthDate.getFullYear()}-${pad(nextMonthDate.getMonth() + 1)}`
  const summerYear = mo > 8 ? yr + 1 : yr
  const springYear = mo > 5 ? yr + 1 : yr
  const autumnYear = mo > 11 ? yr + 1 : yr

  // Only pass relevant context fields — not the full noisy state
  const ctx = {
    lastAskedField: currentState.lastAskedField ?? null,
    lastShownCamperSlug: currentState.lastShownCamperSlug ?? null,
    pendingAvailabilityAction: currentState.pendingAvailabilityAction ?? null,
    pendingAvailabilityConfirmation: currentState.pendingAvailabilityConfirmation ?? null,
    conversationMemory: currentState.conversationMemory ?? null,
    lastAvailabilitySlots: currentState.lastAvailabilitySlots ?? [],
    sessionReferenceHints: {
      pendingAvailabilityConfirmation: currentState.pendingAvailabilityConfirmation ?? null,
      lastShownCamperSlug: currentState.lastShownCamperSlug ?? null,
    },
    known: {
      month: currentState.month ?? null,
      durationDays: currentState.durationDays ?? null,
      passengers: currentState.passengers ?? null,
      campingType: currentState.campingType ?? null,
      earliestAvailable: currentState.earliestAvailable ?? null,
    },
  }

  return `Today: ${todayStr}

You are the structured state extractor for the VanLife Europe camper rental chatbot.

You are not the assistant.
You do not continue the conversation.
You do not decide the flow.
You do not run availability, recommendation, booking, or business logic.

Your only task:

"What structured updates does the user's LATEST message add, change, remove, or clarify?"

=================================================================
CURRENT STATE
=================================================================

${JSON.stringify(ctx)}

Use CURRENT STATE only to interpret the latest message:
- short answers,
- corrections,
- references,
- recommendation reactions,
- current checklist field context.

Return only what changed in the latest message.
Do not repeat existing values.
Do not preserve old values.
Do not invent missing values.
Any unchanged field must be null.

=================================================================
OUTPUT SCHEMA
=================================================================

Return ONLY valid JSON. No markdown, no explanation.

{
  "intent": "recommendation" | "availability" | "faq" | "booking" | "catalog" | null,
  "month": "YYYY-MM" | null,
  "startDate": "YYYY-MM-DD" | null,
  "endDate": "YYYY-MM-DD" | null,
  "durationDays": number | null,
  "passengers": number | null,
  "campingType": "wild" | "camping_site" | null,
  "flexibleCriteria": {
    "months": ["YYYY-MM"] | null,
    "durationDays": {
      "min": number | null,
      "max": number | null,
      "preferred": number | null,
      "alternatives": [number] | null
    } | null,
    "passengers": {
      "min": number | null,
      "max": number | null,
      "alternatives": [number] | null
    } | null,
    "campingTypes": ["wild" | "camping_site"] | null
  } | null,
  "extraRequirements": ["string"] | null,
  "softPreferences": ["string"] | null,
  "earliestAvailable": true | null,
  "refinementPreference": "cheaper" | "more_expensive" | "smaller" | "bigger" | "different" | null,
  "clearCampingType": true | null,
  "skipCurrentField": true | null,
  "positiveAcknowledgement": true | null,
  "availabilityQuestion": "longest_duration" | "remembered_slot_duration" | null,
  "referenceTarget": "previousAvailability" | "lastAvailability" | "lastRecommendation" | "firstShownOption" | "lastShownOption" | null,
  "memoryNotes": [
    {
      "type": "fact" | "preference" | "concern" | "decision" | "rejection" | "reference",
      "text": "short natural-language memory",
      "subject": "optional short subject"
    }
  ] | null
}

=================================================================
CORE RULES
=================================================================

Extract all clearly stated updates from the latest message.
One message may update several fields.
The newest user information is authoritative.
If the user changes their mind, extract the new value only.
Do not let positive acknowledgement or FAQ intent hide a clearer field update.

If lastAskedField exists and the user clearly says they do not know, do not care,
or leave the choice to us, return skipCurrentField = true. Still extract any
other clear information in the same message.

Use lastAskedField for short answers:
- lastAskedField = month → extract month/startDate/endDate if present.
- lastAskedField = durationDays → extract durationDays.
- lastAskedField = passengers → extract passengers.
- lastAskedField = campingType → infer wild or camping_site from meaning.
- lastAskedField = extraRequirements → extract hard/soft preferences, or skip.

=================================================================
PREFERENCES
=================================================================

Use extraRequirements for mandatory constraints:
signals like must, required, only, cannot, mindenképpen, kizárólag, csak,
kötelező, semmiképpen.

Use softPreferences for wishes or ranking preferences:
signals like preferably, ideally, would be nice, inkább, jó lenne, lehetőleg,
ha lehet.

If strength is unclear, prefer softPreferences to avoid over-filtering.
Keep preference strings short.
Do not duplicate structured fields as memoryNotes.

=================================================================
REACTIONS AND REFINEMENT
=================================================================

If lastShownCamperSlug or pendingAvailabilityConfirmation exists, short accepting
messages can mean positiveAcknowledgement = true. Interpret minor typos, missing
accents, transposed letters, and casual short replies by their intended meaning
in this pending-confirmation context.

Positive acknowledgement does not suppress stronger updates.

Refinement applies when the user reacts to a shown recommendation:
- cheaper / túl drága → cheaper
- more premium / drágább / prémiumabb → more_expensive
- smaller / kompaktabb → smaller
- bigger / tágasabb / nagyobb → bigger
- different / nem tetszik / mutass mást → different

If a recommendation was already shown and the user says they do not like it
without giving a more specific reason, treat it as different:
refinementPreference = different.

If the user changes a trip condition after a recommendation, extract the changed
field instead of starting a new checklist. Keep the rest of the current state.

=================================================================
FLEXIBLE / UNCERTAIN TRIP CRITERIA
=================================================================

When the latest message gives a flexible alternative or approximate trip
condition, keep the concrete structured value if there is a natural default and
also return flexibleCriteria.

Use flexibleCriteria for:
- alternative months or date windows that can be searched separately;
- approximate or ranged duration;
- alternative passenger counts;
- uncertain or soft camping style.

Do not decide whether to ask a clarification question.
Do not create recommendation branches.
The backend will decide whether the alternatives are searchable.

Guidance:
- "July or August" → flexibleCriteria.months with both months.
- "about a week" → durationDays 7 and flexibleCriteria.durationDays preferred 7.
- "5-7 days" → flexibleCriteria.durationDays min 5 max 7; preferred if implied.
- "two or four people" → flexibleCriteria.passengers alternatives [2,4].
- "maybe wild camping" → flexibleCriteria.campingTypes can include wild and camping_site; if it sounds like a preference, add wild as softPreference rather than hard campingType.

=================================================================
REFERENCES
=================================================================

The extractor only identifies reference type. It never resolves referenced data
from history. The backend resolves references from SessionMemory.

Set referenceTarget when the latest message refers to:
- previousAvailability: an earlier/previous availability result or date.
- lastAvailability: the most recently offered availability.
- lastRecommendation: the most recently recommended camper.
- firstShownOption: the first shown option/card.
- lastShownOption: the latest shown option/card.

If the user asks how many days a remembered availability option allows, return
availabilityQuestion = "remembered_slot_duration" and the appropriate
referenceTarget if clear.

=================================================================
MEMORY NOTES
=================================================================

GENERAL MEMORY NOTES are for durable, useful information that does not fit any
structured field.
This is the general memory layer. It is not limited to availability.

Use memoryNotes only when the latest message adds a lasting preference, concern,
rejection, decision, or reference that may matter later.

Do not create AI logs.
Do not summarize the turn.
Do not duplicate ConversationState fields.
Do not duplicate existing conversationMemory unless the latest message changes
the meaning.

If there is no durable extra information, return memoryNotes = null.

=================================================================
TIME
=================================================================

Use today's date: ${todayStr}

Relative dates:
- this month / ebben a hónapban / erre a hónapra → ${currentMonth}
- next month / jövő hónapban → ${nextMonth}
- this summer / nyáron → ${summerYear}-07
- spring / tavasszal → ${springYear}-04
- autumn / fall / ősszel → ${autumnYear}-09

Month names → YYYY-MM, using current year if still upcoming, otherwise next year:
jan=01 feb=02 mar=03 apr=04 may/máj=05 jun=06 jul=07 aug=08 sep=09 oct/okt=10 nov=11 dec=12

Exact date ranges → startDate + endDate in YYYY-MM-DD.

Duration:
- a week / egy hét → 7
- two weeks / két hét → 14
- long weekend / hosszú hétvége → 3
- X-Y days → flexibleCriteria.durationDays min/max; use a preferred value only if implied.
- bare numbers can be durationDays when lastAskedField = durationDays.

Earliest timing:
If the user asks for the earliest possible timing, return earliestAvailable = true.
If that same message includes a concrete duration, also return durationDays.

Maximum/longest duration:
If the user asks for the longest rentable/free duration in the current period,
return availabilityQuestion = "longest_duration".

=================================================================
CAMPING TYPE
=================================================================

Map camping style to:
- wild: wild camping, off-grid, nature stops, overnight stops outside official campsites.
- camping_site: official campground/campsite/camping place.

Infer from meaning, not exact keywords.

If lastAskedField is campingType and the user gives a practical statement like
"we might stop by a lake / roadside / forest overnight", treat it as a concrete
campingType answer: wild. Such a practical statement is a concrete campingType answer: wild.

If the CURRENT STATE already has campingType = "wild" and the latest message
questions, rejects, or backs away from that condition, Infer the correction from the conversation meaning
and return campingType = "camping_site". You may also
return clearCampingType = true, but keep any new concrete campingType value.

If the user removes the camping style preference entirely, return
clearCampingType = true without preserving the old value.

Questions about legality or rules of wild camping are FAQ intent unless the
message is also clearly answering the campingType field.

=================================================================
INTENT
=================================================================

Extract intent only when the latest message clearly changes or clarifies it.

recommendation:
personalized camper choice/rental help. Rental-start messages where the user
wants to rent a camper but gives no concrete period are recommendation checklist
starters. Examples include "Szeretnék lakóautót bérelni.", "Lakóautót szeretnék
bérelni.", "I want to rent a camper.".
"Szeretnék lakóautót bérelni." → recommendation

availability:
questions about whether/when a camper or rental is available, including whether
the user can rent a camper for a stated period.

faq:
rules, licence, deposit, insurance, age, breakdown, legality, policy questions.

booking:
explicit booking/reservation intent.

catalog:
general browsing or asking what campers/categories exist.

Unclear intent → null. Do not guess.

=================================================================
EXTRACTION PRIORITY
=================================================================

When signals overlap, prefer:
1. explicit correction/change of value
2. explicit field value
3. refinement
4. availability/reference question
5. booking intent
6. FAQ intent
7. positive acknowledgement

Return ONLY valid JSON. Nothing else.`
}

const SKIP_PATTERN = /\b(nem tudom|mindegy|bármi|bármelyik|rátok bízzuk|nem fontos|meglátjuk|nem döntöttük|nincs elképzelés|nem kritikus|i don.t know|doesn.t matter|either is fine|no preference|we.?ll see|not sure|don.t mind|up to you|whatever|egal|keine ahnung)\b/i
const NO_EXTRA_REQUIREMENTS_PATTERN = /\b(nincs|nincs mas|nincs tobb|semmi|nincsen|no|nothing|none|keine)\b/i

function normalizeForMatch(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function extractCampingTypeCorrection(message: string): ConversationState['campingType'] | undefined {
  const normalized = normalizeForMatch(message)

  const campingSitePatterns = [
    /\bnem\b.{0,40}\bvadkemp/,
    /\bmegsem\b.{0,40}\bvadkemp/,
    /\binkabb\b.{0,40}\bnem\b.{0,20}\bvadkemp/,
    /\b(?:akkor|legyen|inkabb)\b.{0,40}\bkemping(?:hely|ben)?/,
    /\bkempinghely/,
    /\bkempingben/,
    /\bno\s+wild\s+camping\b/,
    /\bnot\s+wild\s+camping\b/,
    /\b(?:don'?t|do not)\s+want\s+wild\s+camping\b/,
    /\bcampsite\s+instead\b/,
    /\bkein\s+wildcamping\b/,
    /\blieber\s+campingplatz\b/,
  ]

  if (campingSitePatterns.some(pattern => pattern.test(normalized))) {
    return 'camping_site'
  }

  const hasWildSignal = /\b(vadkemp|nem\s+kemping|nem\s+hivatalos\s+kemping|kempingen\s+kivuli|kempingen\s+kivul|kempinghelyen\s+kivuli|off-?grid|termeszetben)\b/.test(normalized)
  const negatesWild = /\b(nem|megsem|no|not|kein)\b.{0,40}\b(vadkemp|wild\s+camping|wildcamping)\b/.test(normalized)
  if (hasWildSignal && !negatesWild) {
    return 'wild'
  }

  return undefined
}

// Deterministic safety net for short checklist answers and corrections the extractor may omit.
function applyContextFallback(
  message: string,
  lastAskedField: ChecklistField | undefined,
  update: StateUpdate,
): StateUpdate {
  const campingType = extractCampingTypeCorrection(message)
  if (campingType) {
    update.campingType = campingType
    update.skippedChecklist = (update.skippedChecklist ?? []).filter(field => field !== 'campingType')
  }

  if (!lastAskedField) return update

  const isSideTopic = update.intent === 'faq' || update.intent === 'booking' || update.intent === 'catalog'
  if (isSideTopic) return update

  // Skip detection safety net — catches uncertainty phrases the GPT might have missed
  if (!update.campingType && !update.skippedChecklist && SKIP_PATTERN.test(message)) {
    update.skippedChecklist = [lastAskedField]
    if (lastAskedField === 'extraRequirements') update.extraRequirementsAsked = true
    return update
  }

  const trimmed = message.trim()

  switch (lastAskedField) {
    case 'durationDays': {
      if (update.durationDays) break
      const numMatch = trimmed.match(/^(\d+)\s*(?:nap(?:ra)?|days?)?\s*[.!?]?$/i)
      if (numMatch) { update.durationDays = parseInt(numMatch[1]); break }
      const DAY_WORDS: Record<string, number> = {
        egy: 1, kettő: 2, két: 2, három: 3, négy: 4, öt: 5,
        hat: 6, hét: 7, nyolc: 8, kilenc: 9, tíz: 10,
        one: 1, two: 2, three: 3, four: 4, five: 5,
        six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      }
      const lower = trimmed.toLowerCase()
      for (const [word, num] of Object.entries(DAY_WORDS)) {
        if (lower === word || lower === `${word} nap` || lower === `${word} days`) {
          update.durationDays = num; break
        }
      }
      if (!update.durationDays && /\b(egy|one)\s*(hét|week)\b/i.test(lower)) update.durationDays = 7
      if (!update.durationDays && /\b(két|two)\s*(hét|week)\b/i.test(lower)) update.durationDays = 14
      break
    }

    case 'passengers': {
      if (update.passengers) break
      const numMatch = trimmed.match(/^(\d+)\s*(?:fő(?:vel|re)?|ember|személy|people|persons?)?\s*[.!?]?$/i)
      if (numMatch) { update.passengers = parseInt(numMatch[1]); break }
      const PERSON: Record<string, number> = {
        egyedül: 1, magam: 1, alone: 1,
        ketten: 2, két: 2, two: 2,
        hárman: 3, három: 3, three: 3,
        négyen: 4, négy: 4, four: 4,
        öten: 5, öt: 5, five: 5,
        hatan: 6, hat: 6, six: 6,
      }
      const lower = trimmed.toLowerCase()
      if (PERSON[lower]) { update.passengers = PERSON[lower]; break }
      if (/\b(párommal|feleségemmel|férjemmel|barátnőmmel|barátommal|partneremmel|my partner|my wife|my husband)\b/i.test(trimmed)) {
        update.passengers = 2
      }
      break
    }

    case 'campingType':
      break

    case 'extraRequirements': {
      if (!update.extraRequirementsAsked) update.extraRequirementsAsked = true
      if (NO_EXTRA_REQUIREMENTS_PATTERN.test(normalizeForMatch(message))) {
        update.skippedChecklist = [
          ...new Set([...(update.skippedChecklist ?? []), 'extraRequirements']),
        ] as ChecklistField[]
      }
      break
    }

    case 'month':
      break
  }

  return update
}

async function extractWithGPT(
  message: string,
  history: { role: string; content: string }[],
  currentState: ConversationState,
): Promise<StateUpdate> {
  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: buildExtractionPrompt(currentState) },
      // Last 3 turns (6 messages) — enough context without inflating tokens
      ...(history.slice(-6) as { role: 'user' | 'assistant'; content: string }[]),
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 220,
    temperature: 0,
  })

  const raw = completion.choices[0]?.message?.content ?? '{}'
  const parsed = JSON.parse(raw)

  const update: StateUpdate = {}
  if (parsed.intent)               update.intent               = parsed.intent
  if (parsed.month)                update.month                = parsed.month
  if (parsed.startDate)            update.startDate            = parsed.startDate
  if (parsed.endDate)              update.endDate              = parsed.endDate
  if (parsed.durationDays)         update.durationDays         = parsed.durationDays
  if (parsed.passengers)           update.passengers           = parsed.passengers
  if (parsed.campingType)          update.campingType          = parsed.campingType
  if (parsed.flexibleCriteria && typeof parsed.flexibleCriteria === 'object') {
    const flexible: ConversationState['flexibleCriteria'] = {}
    if (Array.isArray(parsed.flexibleCriteria.months)) {
      flexible.months = parsed.flexibleCriteria.months
        .filter((month: unknown): month is string => typeof month === 'string' && /^\d{4}-\d{2}$/.test(month))
        .slice(0, 6)
    }
    const duration = parsed.flexibleCriteria.durationDays
    if (duration && typeof duration === 'object') {
      flexible.durationDays = {
        min: typeof duration.min === 'number' ? duration.min : undefined,
        max: typeof duration.max === 'number' ? duration.max : undefined,
        preferred: typeof duration.preferred === 'number' ? duration.preferred : undefined,
        alternatives: Array.isArray(duration.alternatives)
          ? duration.alternatives.filter((value: unknown): value is number => typeof value === 'number').slice(0, 6)
          : undefined,
      }
    }
    const passengers = parsed.flexibleCriteria.passengers
    if (passengers && typeof passengers === 'object') {
      flexible.passengers = {
        min: typeof passengers.min === 'number' ? passengers.min : undefined,
        max: typeof passengers.max === 'number' ? passengers.max : undefined,
        alternatives: Array.isArray(passengers.alternatives)
          ? passengers.alternatives.filter((value: unknown): value is number => typeof value === 'number').slice(0, 6)
          : undefined,
      }
    }
    if (Array.isArray(parsed.flexibleCriteria.campingTypes)) {
      flexible.campingTypes = parsed.flexibleCriteria.campingTypes
        .filter((value: unknown): value is NonNullable<ConversationState['campingType']> => value === 'wild' || value === 'camping_site')
        .slice(0, 2)
    }
    if (
      flexible.months?.length ||
      flexible.durationDays?.min ||
      flexible.durationDays?.max ||
      flexible.durationDays?.preferred ||
      flexible.durationDays?.alternatives?.length ||
      flexible.passengers?.min ||
      flexible.passengers?.max ||
      flexible.passengers?.alternatives?.length ||
      flexible.campingTypes?.length
    ) {
      update.flexibleCriteria = flexible
    }
  }
  if (parsed.clearCampingType && !parsed.campingType) {
    update.campingType = undefined
  }
  if (parsed.earliestAvailable)    update.earliestAvailable    = true
  if (parsed.refinementPreference) update.refinementPreference = parsed.refinementPreference
  if (Array.isArray(parsed.extraRequirements) && parsed.extraRequirements.length > 0) {
    update.extraRequirements = parsed.extraRequirements
  }
  if (Array.isArray(parsed.softPreferences) && parsed.softPreferences.length > 0) {
    update.softPreferences = parsed.softPreferences
  }
  if (parsed.positiveAcknowledgement) update.positiveAcknowledgement = true
  if (parsed.skipCurrentField && currentState.lastAskedField) {
    update.skippedChecklist = [currentState.lastAskedField]
    if (currentState.lastAskedField === 'extraRequirements') {
      update.extraRequirementsAsked = true
    }
  }

  if (
    parsed.availabilityQuestion === 'longest_duration' ||
    parsed.availabilityQuestion === 'remembered_slot_duration'
  ) {
    update.availabilityQuestion = parsed.availabilityQuestion
  }

  const referenceTargets: ReferenceTarget[] = [
    'previousAvailability',
    'lastAvailability',
    'lastRecommendation',
    'firstShownOption',
    'lastShownOption',
  ]
  if (referenceTargets.includes(parsed.referenceTarget)) {
    update.referenceTarget = parsed.referenceTarget
  }

  if (Array.isArray(parsed.memoryNotes) && parsed.memoryNotes.length > 0) {
    const notes = parsed.memoryNotes
      .filter((note: any) =>
        ['fact', 'preference', 'concern', 'decision', 'rejection', 'reference'].includes(note?.type) &&
        typeof note?.text === 'string' &&
        note.text.trim().length > 0,
      )
      .map((note: any) => ({
        type: note.type,
        text: note.text.trim(),
        subject: typeof note.subject === 'string' && note.subject.trim().length > 0
          ? note.subject.trim()
          : undefined,
      }))
    if (notes.length > 0) {
      update.conversationMemory = { notes }
    }
  }

  return update
}

/**
 * Extracts structured state updates from a user message using GPT-4o-mini with full context.
 * Passes conversation history + current state so GPT can interpret short/indirect answers.
 * Falls back to regex if the API call fails.
 */
export async function extractStateUpdate(
  message: string,
  history: { role: string; content: string }[],
  currentState: ConversationState,
): Promise<StateUpdate> {
  try {
    return applyContextFallback(
      message,
      currentState.lastAskedField,
      await extractWithGPT(message, history, currentState),
    )
  } catch {
    return applyContextFallback(
      message,
      currentState.lastAskedField,
      extractStateFromMessage(message, history, currentState),
    )
  }
}
