import { ConversationState } from './state'

type ChecklistField = 'month' | 'durationDays' | 'passengers' | 'campingType' | 'extraRequirements'

export interface ReplySafetyInput {
  reply: string
  mode: string
  effectiveMode: string
  state: ConversationState
  nextQuestion?: string | null
  nextQuestionField?: ChecklistField | null
  isSpecificCamperQuery?: boolean
}

export interface ReplySafetyResult {
  reply: string
  suppressRecommendations: boolean
}

function ensureQuestionOnce(reply: string, question: string): string {
  const trimmedReply = reply.trim()
  if (!trimmedReply) return question

  const firstIndex = trimmedReply.indexOf(question)
  if (firstIndex === -1) return `${trimmedReply} ${question}`

  let deduped = trimmedReply.slice(0, firstIndex + question.length)
  let rest = trimmedReply.slice(firstIndex + question.length)
  while (rest.includes(question)) {
    const duplicateIndex = rest.indexOf(question)
    rest = rest.slice(0, duplicateIndex) + rest.slice(duplicateIndex + question.length)
  }
  deduped += rest
  return deduped.replace(/\s+/g, ' ').trim()
}

function keepOnlyOneChecklistQuestion(reply: string, question: string): string {
  const trimmedReply = reply.trim()
  const questionMarkCount = (trimmedReply.match(/\?/g) ?? []).length
  if (trimmedReply && !trimmedReply.includes(question) && questionMarkCount === 1) {
    return trimmedReply
  }

  const ensured = ensureQuestionOnce(reply, question)
  const questionIndex = ensured.indexOf(question)
  if (questionIndex <= 0) return ensured

  const prefix = ensured.slice(0, questionIndex).trim()
  if (prefix.includes('?')) return question

  return ensured
}

const CHECKLIST_QUESTIONS: Record<ChecklistField, string[]> = {
  month: [
    'Mikor mennél?',
    'Mikor szeretnétek menni?',
    'Mikorra tervezed az utat?',
    'Mikorra tervezitek az utat?',
    'Kezdjük az időponttal: mikorra tervezed az utat?',
    'Kezdjük az időponttal: mikorra tervezitek az utat?',
  ],
  durationDays: [
    'Hány napra tervezed?',
    'Hány napra terveztek?',
    'Nagyjából hány napra vinnéd el?',
    'Nagyjából hány napra vinnétek el?',
    'Oké, és nagyjából hány napra vinnéd el?',
    'Oké, és nagyjából hány napra vinnétek el?',
  ],
  passengers: [
    'Hány fővel utaznál?',
    'Hányan utaznátok?',
    'Hányan utaznátok összesen?',
    'Rendben, hányan utaznátok összesen?',
  ],
  campingType: [
    'Inkább vadkempingeznél, vagy kempinghelyen állnál meg?',
    'Inkább vadkempingeznétek, vagy kempinghelyen állnátok meg?',
    'Inkább kempinghelyeken állnál meg, vagy fontos lenne a vadkemping-kompatibilitás?',
    'Inkább kempinghelyeken állnátok meg, vagy fontos lenne a vadkemping-kompatibilitás?',
    'Inkább kempinghelyeken állnál meg, vagy olyan autót keressek, ami vadkempinghez is jó?',
    'Inkább kempinghelyeken állnátok meg, vagy olyan autót keressek, ami vadkempinghez is jó?',
  ],
  extraRequirements: [
    'Van még valami szempont vagy igény, amit figyelembe vegyek?',
    'Van még valami fontos szempont, amire figyeljek az ajánlásnál?',
    'Van még bármi, ami fontos lenne az autóban vagy az utazáshoz?',
  ],
}

function removeQuestion(reply: string, question: string): string {
  let cleaned = reply
  while (cleaned.includes(question)) {
    cleaned = cleaned.replace(question, '')
  }
  return cleaned.replace(/\s+([?.!,])/g, '$1').replace(/\s+/g, ' ').trim()
}

function isChecklistFieldResolved(state: ConversationState, field: ChecklistField): boolean {
  const skipped = new Set(state.skippedChecklist ?? [])
  if (skipped.has(field)) return true

  switch (field) {
    case 'month':
      return !!(state.month || state.startDate || state.earliestAvailable)
    case 'durationDays':
      return !!(state.durationDays || (state.startDate && state.endDate))
    case 'passengers':
      return !!state.passengers
    case 'campingType':
      return !!state.campingType
    case 'extraRequirements':
      return !!state.extraRequirementsAsked
    default:
      return false
  }
}

function removeResolvedChecklistQuestions(
  reply: string,
  state: ConversationState,
  currentQuestionField?: ChecklistField | null,
): string {
  const cleaned = (Object.entries(CHECKLIST_QUESTIONS) as Array<[ChecklistField, string[]]>)
    .reduce((currentReply, [field, questions]) => {
      if (field === currentQuestionField || !isChecklistFieldResolved(state, field)) {
        return currentReply
      }
      return questions.reduce(
        (replyWithoutQuestion, question) => removeQuestion(replyWithoutQuestion, question),
        currentReply,
      )
    }, reply)
  return currentQuestionField ? cleaned.trim() : (cleaned.trim() ? cleaned : reply)
}

function removeAllChecklistQuestions(reply: string): string {
  const cleaned = Object.values(CHECKLIST_QUESTIONS)
    .flat()
    .reduce((currentReply, question) => removeQuestion(currentReply, question), reply)
  return cleaned.trim() ? cleaned : reply
}

function removeMisleadingNoInfoForChecklist(reply: string): string {
  const cleaned = reply
    .replace(/\bErről jelenleg nincs pontos információm\.?\s*/gi, '')
    .replace(/\bEzt nem látom a rendszerben\.?\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  return cleaned || reply
}

export function applyReplySafety(input: ReplySafetyInput): ReplySafetyResult {
  const { effectiveMode, nextQuestion, nextQuestionField, state } = input

  let reply = effectiveMode === 'faq'
    ? removeAllChecklistQuestions(input.reply)
    : removeResolvedChecklistQuestions(input.reply, state, nextQuestionField)

  if (effectiveMode === 'ask_next_question') {
    reply = removeMisleadingNoInfoForChecklist(reply)
  }

  if (effectiveMode === 'ask_next_question' && nextQuestion) {
    reply = keepOnlyOneChecklistQuestion(reply, nextQuestion)
  }

  return {
    reply,
    suppressRecommendations: !!input.isSpecificCamperQuery || effectiveMode === 'availability',
  }
}
