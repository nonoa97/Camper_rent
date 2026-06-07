export type ConversationIntent = 'recommendation' | 'availability' | 'faq' | 'booking' | 'catalog'
export type CampingType = 'wild' | 'camping_site'
export type RefinementPreference = 'cheaper' | 'more_expensive' | 'smaller' | 'bigger' | 'different'

export type ChecklistField = 'month' | 'durationDays' | 'passengers' | 'campingType' | 'extraRequirements'

export interface ConversationState {
  intent?: ConversationIntent
  month?: string               // YYYY-MM
  startDate?: string           // YYYY-MM-DD
  endDate?: string             // YYYY-MM-DD
  durationDays?: number
  passengers?: number
  campingType?: CampingType
  extraRequirements?: string[]
  extraRequirementsAsked?: boolean
  selectedCamperSlug?: string
  alreadyRecommendedSlugs?: string[]
  earliestAvailable?: boolean  // user wants earliest possible slot, no specific month
  lastAskedField?: ChecklistField  // which checklist field the bot just asked about
  lastShownCamperSlug?: string    // first slug from last recommendation response — used for follow-up availability questions
  refinementPreference?: RefinementPreference  // ephemeral — what direction user wants to refine
  lastShownPrice?: number         // price of last recommended camper — used for "closest cheaper/more expensive"
  extrasOffered?: boolean         // true after first successful recommendation — prevents repeat upsell
}

// november and december are the same in Hungarian and English — only listed once
const MONTH_MAP: Record<string, string> = {
  január: '01', február: '02', március: '03', április: '04',
  május: '05', június: '06', július: '07', augusztus: '08',
  szeptember: '09', október: '10', november: '11', december: '12',
  january: '01', february: '02', march: '03', april: '04',
  may: '05', june: '06', july: '07', august: '08',
  september: '09', october: '10',
}

const PERSON_WORDS: Record<string, number> = {
  egyedül: 1, magam: 1,
  ketten: 2, két: 2,
  hárman: 3, három: 3,
  négyen: 4, négy: 4,
  öten: 5, öt: 5,
  hatan: 6, hat: 6,
}

function detectIntent(message: string, current?: ConversationIntent): ConversationIntent {
  // booking = only explicit reservation of a specific car
  if (/\b(le\s*szeretném\s*foglalni|hogyan\s*foglal|ezt\s*az\s*autót\s*szeretném)\b/i.test(message)) return 'booking'
  if (/\b(jogosítvány|kaució|biztosítás|minimum kor|meghibásodás|átvétel|gyik)\b/i.test(message)) return 'faq'
  if (/\b(katalógus|összes autó|milyen autók|mik.*autók|mit.*bérel|kínálat|választék|kategóri|welche wohnmobil|what camper|what vehicle)\b/i.test(message)) return 'catalog'
  if (/\b(mikor szabad|elérhet|szabad-e|mikor elérhető)\b/i.test(message)) return 'availability'
  if (/\b(szeretnék|keresek|választanék|mennék|mennénk|lakóautó|camper|autó|bérelni|segíts)\b/i.test(message)) return 'recommendation'
  return current ?? 'recommendation'
}

export function extractStateFromMessage(
  message: string,
  history: { role: string; content: string }[],
  current: ConversationState,
): Partial<ConversationState> {
  const all = [...history.map(m => m.content), message].join(' ')
  const update: Partial<ConversationState> = {}

  // Intent
  update.intent = detectIntent(message, current.intent)

  // Passengers — from current message only (more reliable)
  const numPersonMatch = message.match(/\b([1-9]\d?)\s*(fő|főre|ember|személy|személyre|fővel)\b/i)
  if (numPersonMatch) {
    update.passengers = parseInt(numPersonMatch[1])
  } else {
    for (const [word, count] of Object.entries(PERSON_WORDS)) {
      if (new RegExp(`\\b${word}\\b`, 'i').test(message)) {
        update.passengers = count
        break
      }
    }
    // "párommal / barátommal / a feleségemmel" → 2
    if (!update.passengers && /\b(párommal|feleségemmel|férjemmel|barátnőmmel|barátommal|partneremmel)\b/i.test(message)) {
      update.passengers = 2
    }
  }

  // Camping type — from full history (user might have said it earlier)
  if (/\b(vadkemp|szabad terület|nem kemp|természetben|megállunk útközben|offgrid|off-grid)\b/i.test(all)) {
    update.campingType = 'wild'
  } else if (/\b(kempinghe|kempinghelyen|kempingben|kemping\b)/i.test(all)) {
    update.campingType = 'camping_site'
  }

  // Duration — "7 nap", "10 napra", "7-10 nap" (take minimum), "egy hét", "két hét"
  const rangeMatch = message.match(/\b(\d+)[–\-](\d+)\s*nap/i)
  if (rangeMatch) {
    update.durationDays = parseInt(rangeMatch[1]) // minimum of range
  } else {
    const singleMatch = message.match(/\b(\d+)\s*nap/i)
    if (singleMatch) update.durationDays = parseInt(singleMatch[1])
    else if (/\begy\s*hét\b/i.test(message)) update.durationDays = 7
    else if (/\bkét\s*hét\b/i.test(message)) update.durationDays = 14
    else if (/\b(egy-két|1-2)\s*hét\b/i.test(message)) update.durationDays = 7
  }

  // Month — from current message, mapped to YYYY-MM
  const today = new Date()
  const curYear = today.getFullYear()
  const curMonth = today.getMonth() + 1 // 1-12

  const lowerMsg = message.toLowerCase()

  if (/\b(leghamarabb|minél\s*előbb|mindegy\s*mikor|amikor\s*(lehet|van)|asap|earliest|legkorább)\b/i.test(lowerMsg)) {
    update.earliestAvailable = true
  } else if (/jövő\s*hónap/i.test(lowerMsg)) {
    const next = curMonth === 12 ? 1 : curMonth + 1
    const y = curMonth === 12 ? curYear + 1 : curYear
    update.month = `${y}-${String(next).padStart(2, '0')}`
  } else if (/\bnyáron\b/i.test(lowerMsg)) {
    update.month = `${curYear}-07`
  } else if (/\btavasszal\b/i.test(lowerMsg)) {
    update.month = `${curYear}-04`
  } else if (/\bősszel\b/i.test(lowerMsg)) {
    update.month = `${curYear}-09`
  } else {
    for (const [name, num] of Object.entries(MONTH_MAP)) {
      if (lowerMsg.includes(name)) {
        const mNum = parseInt(num)
        // If month already passed this year (and user is clearly planning ahead), use next year
        const year = mNum > curMonth ? curYear : curYear + 1
        update.month = `${year}-${num}`
        break
      }
    }
  }

  // Explicit date range: "2026-07-10 – 2026-07-20" or similar
  const exactRange = message.match(/(\d{4}[-./]\d{2}[-./]\d{2})\s*[-–tól\s]+(\d{4}[-./]\d{2}[-./]\d{2})/i)
  if (exactRange) {
    update.startDate = exactRange[1].replace(/[./]/g, '-')
    update.endDate = exactRange[2].replace(/[./]/g, '-')
  }

  // Extra requirements as free text if late in the flow
  // (capture anything after "Van még" response)
  const extraRequirementsInHistory = all.match(/van még.*szempont/i)
  if (extraRequirementsInHistory && !current.extraRequirementsAsked) {
    update.extraRequirementsAsked = true
  }

  return update
}

export function mergeState(current: ConversationState, update: Partial<ConversationState>): ConversationState {
  return {
    ...current,
    ...update,
    // refinementPreference is ephemeral — reset each turn unless explicitly extracted
    refinementPreference: 'refinementPreference' in update ? update.refinementPreference : undefined,
    alreadyRecommendedSlugs: [
      ...new Set([
        ...(current.alreadyRecommendedSlugs ?? []),
        ...(update.alreadyRecommendedSlugs ?? []),
      ]),
    ],
    extraRequirements: [
      ...(current.extraRequirements ?? []),
      ...(update.extraRequirements ?? []),
    ],
  }
}
