import OpenAI from 'openai'
import { ConversationState, ChecklistField, extractStateFromMessage } from './state'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

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
    known: {
      month: currentState.month ?? null,
      durationDays: currentState.durationDays ?? null,
      passengers: currentState.passengers ?? null,
      campingType: currentState.campingType ?? null,
      earliestAvailable: currentState.earliestAvailable ?? null,
    },
  }

  return `Today: ${todayStr}

You are a structured data extractor for a camper rental chatbot.
Extract travel planning fields from the user's LATEST message.
Use the conversation history and current state for context — especially for short, indirect, or ambiguous answers.

CURRENT STATE:
${JSON.stringify(ctx)}

Return ONLY valid JSON — null for any field not updated by this message:
{
  "intent": "recommendation" | "availability" | "faq" | "booking" | "catalog" | null,
  "month": "YYYY-MM" | null,
  "startDate": "YYYY-MM-DD" | null,
  "endDate": "YYYY-MM-DD" | null,
  "durationDays": number | null,
  "passengers": number | null,
  "campingType": "wild" | "camping_site" | null,
  "earliestAvailable": true | null,
  "refinementPreference": "cheaper" | "more_expensive" | "smaller" | "bigger" | "different" | null
}

CONTEXT INTERPRETATION — apply these before anything else:
- If lastAskedField = "durationDays" and user gives a number or vague duration → that number is durationDays
- If lastAskedField = "passengers" and user gives a number or group size → that number is passengers
- If lastAskedField = "campingType" and user expresses a preference → map to "wild" or "camping_site"
- If lastAskedField = "extraRequirements" and user responds in any way → extraRequirementsAsked=true (do not return this field; handled separately)
- If lastAskedField = "month" and user mentions a time → extract month/dates
- If lastShownCamperSlug is set and user asks about availability with a proximal reference ("this", "it", "ez", "ennél", "detta", "này") → intent = "availability"
- If user corrects a previously stated value, return the corrected value

TIMING:
- "this month" / "ebben a hónapban" → "${currentMonth}"
- "next month" / "jövő hónapban" → "${nextMonth}"
- "as soon as possible" / "asap" / "earliest" / "leghamarabb" / "minél előbb" / "mindegy mikor" / "whenever" → earliestAvailable: true, month: null
- "this summer" / "nyáron" → "${summerYear}-07"
- "spring" / "tavasszal" → "${springYear}-04"
- "autumn" / "fall" / "ősszel" → "${autumnYear}-09"
- Month names → YYYY-MM (current year if not yet passed, else next year):
  jan=01 feb=02 mar=03 apr=04 may/máj=05 jun=06 jul=07 aug=08 sep=09 oct/okt=10 nov=11 dec=12
- Exact date ranges → startDate + endDate YYYY-MM-DD
- "X–Y days/nap" → durationDays: X (minimum of range)
- "a week" / "egy hét" → 7, "two weeks" / "két hét" → 14, "long weekend" / "hosszú hétvége" → 3

CAMPING TYPE:
- Wild / off-grid / nature / free-standing / not at a campsite / vadkemping / természetben → "wild"
- Campsite / campground / camping / kempinghelyen → "camping_site"

INTENT:
- General inventory browsing: "what do you have?", "what campers are there?", "welche Wohnmobile?", "milyen autók?", just curious about options → "catalog"
- Personalized help: "help me choose", "recommend one for us", "melyiket ajánlod?", "segíts választani" → "recommendation"
- Asking when a specific camper is available → "availability"
- FAQ: pricing rules / license / deposit / insurance / breakdown → "faq"
- Explicitly booking an already-chosen camper → "booking"
- Unclear → null

KEY DISTINCTION: browsing / listing inventory → "catalog" (no checklist). Asking for personalized advice → "recommendation" (checklist starts).

REFINEMENT PREFERENCE (only when user reacts to a just-shown camper recommendation):
- "túl drága" / "drága" / "legyen olcsóbb" / "olcsóbbat" / "cheaper" / "too expensive" / "ennél olcsóbba" → "cheaper"
- "drágábbat" / "prémiumabb" / "luxusabb" / "more expensive" / "jobb minőségű" → "more_expensive"
- "kisebbet" / "kompaktabb" / "smaller" / "könnyebb" → "smaller"
- "nagyobbat" / "tágasabbat" / "bigger" / "more space" → "bigger"
- "mutass másikat" / "van más?" / "show another" / "nem tetszik" / "ez nem jó" / "nem ez" / "más opció" → "different"
- No refinement reaction (new topic, first question, checklist answer) → null`
}

// Deterministic safety net: if GPT missed the expected field for a bare/short answer,
// parse it directly. Runs after the GPT call as a last resort.
function applyContextFallback(
  message: string,
  lastAskedField: ChecklistField | undefined,
  update: StateUpdate,
): StateUpdate {
  if (!lastAskedField) return update

  const trimmed = message.trim()

  switch (lastAskedField) {
    case 'durationDays': {
      if (update.durationDays) break
      const numMatch = trimmed.match(/^(\d+)$/)
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
      const numMatch = trimmed.match(/^(\d+)$/)
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
      // Intent + language interpretation — left entirely to the LLM
      break

    case 'extraRequirements': {
      if (!update.extraRequirementsAsked) update.extraRequirementsAsked = true
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
  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: buildExtractionPrompt(currentState) },
      // Last 3 turns (6 messages) — enough context without inflating tokens
      ...(history.slice(-6) as { role: 'user' | 'assistant'; content: string }[]),
      { role: 'user', content: message },
    ],
    response_format: { type: 'json_object' },
    max_tokens: 150,
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
  if (parsed.earliestAvailable)    update.earliestAvailable    = true
  if (parsed.refinementPreference) update.refinementPreference = parsed.refinementPreference

  return applyContextFallback(message, currentState.lastAskedField, update)
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
    return await extractWithGPT(message, history, currentState)
  } catch {
    return extractStateFromMessage(message, history, currentState)
  }
}
