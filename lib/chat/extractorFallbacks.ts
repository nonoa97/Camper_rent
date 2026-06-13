import { ConversationState, ChecklistField, ConversationStateUpdate } from './state'
import { resolveCapabilityAlias } from './capabilityAliases'

export type ExtractorFallbackStateUpdate = ConversationStateUpdate

function addCapabilityPreference(
  update: ExtractorFallbackStateUpdate,
  preference: NonNullable<ConversationState['capabilityPreferences']>[number],
) {
  const existing = update.capabilityPreferences ?? []
  const key = `${preference.key}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.strength}|${item.sourceText}` === key)) return
  update.capabilityPreferences = [...existing, preference]
}

function markCampingTypeHandled(update: ExtractorFallbackStateUpdate) {
  update.skippedChecklist = [
    ...new Set([...(update.skippedChecklist ?? []).filter(field => field !== 'campingType'), 'campingType']),
  ] as ChecklistField[]
}

function removeCapabilityPreference(update: ExtractorFallbackStateUpdate, capabilityKey: string) {
  update.removedCapabilityPreferenceKeys = [
    ...new Set([...(update.removedCapabilityPreferenceKeys ?? []), capabilityKey]),
  ]
  update.capabilityPreferences = (update.capabilityPreferences ?? []).filter(
    preference => preference.key !== capabilityKey,
  )
  if (update.capabilityPreferences.length === 0) delete update.capabilityPreferences
}

function isSoftCapabilityWording(normalized: string): boolean {
  return /\b(talan|lehet|lehetne|jo lenne|ha megoldhato|maybe|possibly|would be nice)\b/.test(normalized)
}

export function normalizeForMatch(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function applyWildCampingCapabilityFallback(
  message: string,
  update: ExtractorFallbackStateUpdate,
): ExtractorFallbackStateUpdate {
  const normalized = normalizeForMatch(message)
  const hasWildSignal = /\b(vadkemp|nem\s+kemping|nem\s+hivatalos\s+kemping|kempingen\s+kivuli|kempingen\s+kivul|kempinghelyen\s+kivuli|termeszetben)\b/.test(normalized)
  const negatesWild = /\b(nem|megsem|no|not|kein)\b.{0,40}\b(vadkemp|wild\s+camping|wildcamping)\b/.test(normalized)
  if (!hasWildSignal || negatesWild) return update

  addCapabilityPreference(update, {
    key: 'wild_camping',
    strength: isSoftCapabilityWording(normalized) ? 'soft' : 'hard',
    sourceText: message.trim(),
    detectedLocale: 'hu',
  })
  if (update.campingType === 'wild') {
    update.campingType = undefined
  }
  markCampingTypeHandled(update)
  return update
}

const SKIP_PATTERN = /\b(nem tudom|mindegy|bármi|bármelyik|rátok bízzuk|nem fontos|meglátjuk|nem döntöttük|nincs elképzelés|nem kritikus|i don.t know|doesn.t matter|either is fine|no preference|we.?ll see|not sure|don.t mind|up to you|whatever|egal|keine ahnung)\b/i
const NO_EXTRA_REQUIREMENTS_PATTERN = /\b(nincs|nincs mas|nincs tobb|semmi|nincsen|no|nothing|none|keine)\b/i
const NO_OTHER_REQUIREMENTS_PATTERN = /^(nincs|semmi|nincsen|no|nothing|none|keine)[.!?]*$|\b(nincs\s+(mas|más|tobb|több)|semmi\s+(mas|más|egyeb|egyéb)|mas\s+nem|más\s+nem|ennyi|no\s+other|nothing\s+else|that's\s+all|thats\s+all)\b/i
const REFINEMENT_PATTERNS: Array<{
  pattern: RegExp
  intent: NonNullable<ConversationState['refinementIntent']>['intent']
  targetReference?: ConversationState['referenceTarget']
  interactionType?: NonNullable<ConversationState['recommendationInteraction']>['type']
}> = [
  { pattern: /\b(olcsobb|olcsóbb|tul draga|túl drága|cheaper)\b/i, intent: 'cheaper' },
  { pattern: /\b(dragabb|drágább|premium|prémium|more expensive)\b/i, intent: 'more_expensive' },
  { pattern: /\b(nagyobb\w*|tagasabb\w*|tágasabb\w*|bigger)\b/i, intent: 'bigger' },
  { pattern: /\b(kisebb\w*|kompaktabb\w*|smaller)\b/i, intent: 'smaller' },
  { pattern: /\b(mutass mast|mutass mást|masikat|másikat|nem tetszik|different)\b/i, intent: 'different' },
  { pattern: /\b(hasonlo|hasonló|similar)\b/i, intent: 'similar' },
  { pattern: /\b(maradjunk ennel|maradjunk ennél|ez lesz|ezt valasztanam|ezt választanám|keep this)\b/i, intent: 'keep_current', targetReference: 'lastRecommendation', interactionType: 'selected' },
  { pattern: /\b(elozo jobban tetszett|előző jobban tetszett|previous was better)\b/i, intent: 'prefer_previous', targetReference: 'lastRecommendation' },
]

function applyRefinementIntentFallback(
  message: string,
  update: ExtractorFallbackStateUpdate,
): ExtractorFallbackStateUpdate {
  if (update.refinementIntent) return update
  const normalized = normalizeForMatch(message)
  const match = REFINEMENT_PATTERNS.find(item => item.pattern.test(normalized) || item.pattern.test(message))
  if (!match) return update
  update.refinementIntent = {
    intent: match.intent,
    targetReference: match.targetReference,
    sourceText: message.trim(),
  }
  if (match.targetReference && !update.referenceTarget) {
    update.referenceTarget = match.targetReference
  }
  if (match.interactionType && !update.recommendationInteraction) {
    update.recommendationInteraction = {
      type: match.interactionType,
      targetReference: match.targetReference,
      sourceText: message.trim(),
    }
  }
  return update
}

function hasCapabilityRemovalIntent(message: string): boolean {
  const normalized = normalizeForMatch(message)
  return /\b(nem|ne|nincs|nelkul|kihagyjuk|megsem|no|not|without)\b/.test(normalized)
}

function applyCapabilityRemovalFallback(
  message: string,
  update: ExtractorFallbackStateUpdate,
): ExtractorFallbackStateUpdate {
  if (!hasCapabilityRemovalIntent(message)) return update
  const resolution = resolveCapabilityAlias(message, 'hu')
  if (resolution.status !== 'matched') return update

  update.removedCapabilityPreferenceKeys = [
    ...new Set([...(update.removedCapabilityPreferenceKeys ?? []), resolution.capabilityKey]),
  ]
  update.capabilityPreferences = (update.capabilityPreferences ?? []).filter(
    preference => preference.key !== resolution.capabilityKey,
  )
  if (update.capabilityPreferences.length === 0) delete update.capabilityPreferences
  update.extraRequirements = (update.extraRequirements ?? []).filter(
    requirement => resolveCapabilityAlias(requirement, 'hu').status !== 'matched',
  )
  if (update.extraRequirements.length === 0) delete update.extraRequirements
  if (!update.refinementIntent) {
    update.refinementIntent = {
      intent: 'remove_constraint',
      sourceText: message.trim(),
    }
  }
  return update
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

  return undefined
}

function isBareNegativeAnswer(message: string): boolean {
  return /^(nem|no|nein|nicht)\s*[.!?]*$/i.test(message.trim())
}

// Deterministic safety net for short checklist answers and corrections the extractor may omit.
export function applyContextFallback(
  message: string,
  lastAskedField: ChecklistField | undefined,
  update: ExtractorFallbackStateUpdate,
): ExtractorFallbackStateUpdate {
  const campingType = extractCampingTypeCorrection(message)
  if (campingType) {
    update.campingType = campingType
    update.skippedChecklist = (update.skippedChecklist ?? []).filter(field => field !== 'campingType')
    if (campingType === 'camping_site') {
      removeCapabilityPreference(update, 'wild_camping')
    }
  }
  applyWildCampingCapabilityFallback(message, update)

  applyRefinementIntentFallback(message, update)
  applyCapabilityRemovalFallback(message, update)

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

    case 'campingType': {
      if (isBareNegativeAnswer(message)) {
        update.campingType = 'camping_site'
        update.skippedChecklist = (update.skippedChecklist ?? []).filter(field => field !== 'campingType')
      }
      break
    }

    case 'extraRequirements': {
      const isConstraintCorrection = !!(
        update.campingType ||
        update.removedCapabilityPreferenceKeys?.length
      )
      const explicitlyNoOtherRequirements = NO_OTHER_REQUIREMENTS_PATTERN.test(normalizeForMatch(message))
      if (!update.extraRequirementsAsked && (!isConstraintCorrection || explicitlyNoOtherRequirements)) {
        update.extraRequirementsAsked = true
      }
      if (NO_EXTRA_REQUIREMENTS_PATTERN.test(normalizeForMatch(message)) && explicitlyNoOtherRequirements) {
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
