import { ConversationState, ChecklistField, ConversationStateUpdate, ReferenceTarget } from './state'
import {
  validateAmbiguousPreferences,
  validateAttributePreferences,
  validateCapabilityPreferences,
  validateFeaturePreferences,
  validatePricingPreference,
  validateUnmappedPreferences,
} from './preferences'
import {
  parseRecommendationInteractionSignal,
  parseRecommendationReferenceHint,
} from './extractorReferenceParsing'
import { applyLegacyRawPreferenceCanonicalBridge } from './legacyPreferenceBridge'
import { hasExplicitFlexibleTimingSignal, isSeasonalTimingOnlyMessage, resolveSeasonalTiming } from './seasonalTiming'

export type ExtractorStateUpdate = ConversationStateUpdate

export interface ParseExtractorStateUpdateInput {
  raw: string
  message: string
  currentState: ConversationState
  normalizeForMatch: (message: string) => string
}

function addCapabilityPreference(
  update: ExtractorStateUpdate,
  preference: NonNullable<ConversationState['capabilityPreferences']>[number],
) {
  const existing = update.capabilityPreferences ?? []
  const key = `${preference.key}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.strength}|${item.sourceText}` === key)) return
  update.capabilityPreferences = [...existing, preference]
}

function addFeaturePreference(
  update: ExtractorStateUpdate,
  preference: NonNullable<ConversationState['featurePreferences']>[number],
) {
  const existing = update.featurePreferences ?? []
  const key = `${preference.key}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.strength}|${item.sourceText}` === key)) return
  update.featurePreferences = [...existing, preference]
}

function addAttributePreference(
  update: ExtractorStateUpdate,
  preference: NonNullable<ConversationState['attributePreferences']>[number],
) {
  const existing = update.attributePreferences ?? []
  const key = `${preference.key}|${preference.operator ?? ''}|${String(preference.value)}|${preference.strength}|${preference.sourceText}`
  if (existing.some(item => `${item.key}|${item.operator ?? ''}|${String(item.value)}|${item.strength}|${item.sourceText}` === key)) return
  update.attributePreferences = [...existing, preference]
}

function markCampingTypeHandled(update: ExtractorStateUpdate) {
  update.skippedChecklist = [
    ...new Set([...(update.skippedChecklist ?? []).filter(field => field !== 'campingType'), 'campingType']),
  ] as ChecklistField[]
}

function removeCapabilityPreference(update: ExtractorStateUpdate, capabilityKey: string) {
  update.removedCapabilityPreferenceKeys = [
    ...new Set([...(update.removedCapabilityPreferenceKeys ?? []), capabilityKey]),
  ]
  if (update.capabilityPreferences?.length) {
    update.capabilityPreferences = update.capabilityPreferences.filter(preference => preference.key !== capabilityKey)
    if (update.capabilityPreferences.length === 0) delete update.capabilityPreferences
  }
}

function hasExplicitMonthMention(message: string): boolean {
  const normalized = normalizeForSeasonMatch(message)
  return /\b(januar|január|februar|február|marcius|március|april|április|majus|május|junius|június|julius|július|augusztus|szeptember|oktober|október|november|december|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(normalized)
}

function normalizeForSeasonMatch(message: string): string {
  return message
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function applySeasonalTimingCorrection(message: string, update: ExtractorStateUpdate): ExtractorStateUpdate {
  const seasonalTiming = resolveSeasonalTiming(message)
  if (!seasonalTiming?.months.length) {
    if (!hasExplicitFlexibleTimingSignal(message) && update.flexibleCriteria) {
      delete update.flexibleCriteria.months
      delete update.flexibleCriteria.preferredStartWindows
      if (
        !update.flexibleCriteria.durationDays?.min &&
        !update.flexibleCriteria.durationDays?.max &&
        !update.flexibleCriteria.durationDays?.preferred &&
        !update.flexibleCriteria.durationDays?.alternatives?.length &&
        !update.flexibleCriteria.passengers?.min &&
        !update.flexibleCriteria.passengers?.max &&
        !update.flexibleCriteria.passengers?.alternatives?.length &&
        !update.flexibleCriteria.campingTypes?.length
      ) {
        delete update.flexibleCriteria
      }
    }
    return update
  }
  if (
    seasonalTiming.monthNumber &&
    seasonalTiming.segment !== 'around' &&
    (update.flexibleCriteria?.months?.length ?? 0) > 1
  ) {
    return update
  }

  update.flexibleCriteria = {
    ...(update.flexibleCriteria ?? {}),
    months: seasonalTiming.months,
    preferredStartWindows: seasonalTiming.preferredStartWindows,
  }

  if (!hasExplicitMonthMention(message) || seasonalTiming.segment === 'around') {
    delete update.month
  }

  if (isSeasonalTimingOnlyMessage(message)) {
    delete update.durationDays
    delete update.passengers
    delete update.campingType
    delete update.extraRequirementsAsked
    update.skippedChecklist = (update.skippedChecklist ?? []).filter(
      field => field !== 'durationDays' && field !== 'passengers' && field !== 'campingType' && field !== 'extraRequirements',
    ) as ChecklistField[]
    if (update.skippedChecklist.length === 0) delete update.skippedChecklist
  }

  return update
}

function inferRecommendationStarterIntent(message: string): boolean {
  const normalized = normalizeForSeasonMatch(message)
  return /\b(szeretnek|szeretnenk|mennenk|utaznank)\b.{0,60}\b(elutazni|utazni|menni)\b/.test(normalized) ||
    /\b(elutazni|utazni|menni)\b.{0,60}\b(szeretnek|szeretnenk)\b/.test(normalized)
}

export function parseExtractorStateUpdate({
  raw,
  message,
  currentState,
  normalizeForMatch,
}: ParseExtractorStateUpdateInput): ExtractorStateUpdate {
  const parsed = JSON.parse(raw)

  const update: ExtractorStateUpdate = {}
  if (parsed.intent) update.intent = parsed.intent
  if (!update.intent && inferRecommendationStarterIntent(message)) {
    update.intent = 'recommendation'
  }
  if (parsed.month) update.month = parsed.month
  if (parsed.startDate) update.startDate = parsed.startDate
  if (parsed.endDate) update.endDate = parsed.endDate
  if (parsed.durationDays) update.durationDays = parsed.durationDays
  if (parsed.passengers) update.passengers = parsed.passengers
  if (parsed.campingType === 'camping_site') {
    update.campingType = parsed.campingType
    removeCapabilityPreference(update, 'wild_camping')
  } else if (parsed.campingType === 'wild') {
    addCapabilityPreference(update, {
      key: 'wild_camping',
      strength: 'hard',
      sourceText: message.trim(),
      detectedLocale: 'hu',
    })
    markCampingTypeHandled(update)
  }
  if (parsed.flexibleCriteria && typeof parsed.flexibleCriteria === 'object') {
    const flexible: ConversationState['flexibleCriteria'] = {}
    if (Array.isArray(parsed.flexibleCriteria.months)) {
      flexible.months = parsed.flexibleCriteria.months
        .filter((month: unknown): month is string => typeof month === 'string' && /^\d{4}-\d{2}$/.test(month))
        .slice(0, 6)
    }
    if (Array.isArray(parsed.flexibleCriteria.preferredStartWindows)) {
      const validPrecisions = new Set([
        'month',
        'month_part',
        'around_month',
        'around_date',
        'season',
        'season_part',
        'around_season',
      ])
      flexible.preferredStartWindows = parsed.flexibleCriteria.preferredStartWindows
        .filter((window: any) =>
          typeof window?.startDate === 'string' &&
          typeof window?.endDate === 'string' &&
          /^\d{4}-\d{2}-\d{2}$/.test(window.startDate) &&
          /^\d{4}-\d{2}-\d{2}$/.test(window.endDate) &&
          window.startDate <= window.endDate &&
          validPrecisions.has(window.precision),
        )
        .map((window: any) => ({
          startDate: window.startDate,
          endDate: window.endDate,
          precision: window.precision,
          label: typeof window.label === 'string' && window.label.trim() ? window.label.trim() : undefined,
          sourceText: typeof window.sourceText === 'string' && window.sourceText.trim() ? window.sourceText.trim() : undefined,
          part: ['early', 'middle', 'late'].includes(window.part) ? window.part : undefined,
          toleranceDays: typeof window.toleranceDays === 'number' ? window.toleranceDays : undefined,
        }))
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
      const campingTypes = parsed.flexibleCriteria.campingTypes
        .filter((value: unknown): value is NonNullable<ConversationState['campingType']> => value === 'wild' || value === 'camping_site')
        .slice(0, 2)
      if (campingTypes.includes('wild')) {
        addCapabilityPreference(update, {
          key: 'wild_camping',
          strength: campingTypes.includes('camping_site') ? 'soft' : 'hard',
          sourceText: message.trim(),
          detectedLocale: 'hu',
        })
        markCampingTypeHandled(update)
      }
      flexible.campingTypes = campingTypes.filter((value: NonNullable<ConversationState['campingType']>) => value !== 'wild')
      if (campingTypes.includes('camping_site')) {
        removeCapabilityPreference(update, 'wild_camping')
      }
    }
    if (
      flexible.months?.length ||
      flexible.preferredStartWindows?.length ||
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
  if (parsed.earliestAvailable) update.earliestAvailable = true
  const validLegacyRefinements = ['cheaper', 'more_expensive', 'smaller', 'bigger', 'different']
  const legacyRefinementPreference = validLegacyRefinements.includes(parsed.refinementPreference)
    ? parsed.refinementPreference as NonNullable<ConversationState['refinementPreference']>
    : undefined
  const validRefinementIntents = [
    'cheaper',
    'more_expensive',
    'bigger',
    'smaller',
    'different',
    'similar',
    'keep_current',
    'prefer_previous',
    'remove_constraint',
    'add_constraint',
  ]
  if (
    parsed.refinementIntent &&
    typeof parsed.refinementIntent === 'object' &&
    validRefinementIntents.includes(parsed.refinementIntent.intent) &&
    typeof parsed.refinementIntent.sourceText === 'string' &&
    parsed.refinementIntent.sourceText.trim().length > 0
  ) {
    update.refinementIntent = {
      intent: parsed.refinementIntent.intent,
      targetReference: ['lastRecommendation', 'firstShownOption', 'lastShownOption'].includes(parsed.refinementIntent.targetReference)
        ? parsed.refinementIntent.targetReference
        : undefined,
      sourceText: parsed.refinementIntent.sourceText.trim(),
      strength: parsed.refinementIntent.strength === 'hard' ? 'hard' : parsed.refinementIntent.strength === 'soft' ? 'soft' : undefined,
    }
  } else if (legacyRefinementPreference) {
    update.refinementIntent = {
      intent: legacyRefinementPreference,
      sourceText: message.trim(),
    }
  }
  if (Array.isArray(parsed.extraRequirements) && parsed.extraRequirements.length > 0) {
    const legacyHardRequirements = applyLegacyRawPreferenceCanonicalBridge({
      preferences: parsed.extraRequirements,
      strength: 'hard',
      update,
      normalizeForMatch,
    })
    if (legacyHardRequirements.length > 0) update.extraRequirements = legacyHardRequirements
  }
  if (Array.isArray(parsed.softPreferences) && parsed.softPreferences.length > 0) {
    const legacySoftPreferences = applyLegacyRawPreferenceCanonicalBridge({
      preferences: parsed.softPreferences,
      strength: 'soft',
      update,
      normalizeForMatch,
    })
    if (legacySoftPreferences.length > 0) update.softPreferences = legacySoftPreferences
  }

  const featureValidation = validateFeaturePreferences(parsed.featurePreferences)
  if (featureValidation.featurePreferences?.length) {
    for (const featurePreference of featureValidation.featurePreferences) {
      addFeaturePreference(update, featurePreference)
    }
  }
  const attributeValidation = validateAttributePreferences(parsed.attributePreferences)
  if (attributeValidation.attributePreferences?.length) {
    for (const attributePreference of attributeValidation.attributePreferences) {
      addAttributePreference(update, attributePreference)
    }
  }
  const capabilityValidation = validateCapabilityPreferences(parsed.capabilityPreferences)
  if (capabilityValidation.capabilityPreferences?.length) {
    for (const preference of capabilityValidation.capabilityPreferences) {
      addCapabilityPreference(update, preference)
    }
  }
  const pricingValidation = validatePricingPreference(parsed.pricingPreference)
  if (pricingValidation.pricingPreference) {
    update.pricingPreference = pricingValidation.pricingPreference
  }

  const unmappedPreferences = [
    ...(featureValidation.unmappedPreferences ?? []),
    ...(attributeValidation.unmappedPreferences ?? []),
    ...(capabilityValidation.unmappedPreferences ?? []),
    ...(pricingValidation.unmappedPreferences ?? []),
    ...validateUnmappedPreferences(parsed.unmappedPreferences),
  ]
  if (unmappedPreferences.length) {
    update.unmappedPreferences = [
      ...new Map(unmappedPreferences.map(preference => [`${preference.reason}|${preference.sourceText}`, preference])).values(),
    ]
  }

  const ambiguousPreferences = [
    ...(update.ambiguousPreferences ?? []),
    ...(featureValidation.ambiguousPreferences ?? []),
    ...(capabilityValidation.ambiguousPreferences ?? []),
    ...validateAmbiguousPreferences(parsed.ambiguousPreferences),
  ]
  if (ambiguousPreferences.length) {
    update.ambiguousPreferences = [
      ...new Map(ambiguousPreferences.map(preference => [`${preference.reason}|${preference.sourceText}|${preference.candidates.join(',')}`, preference])).values(),
    ]
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

  const recommendationReference = parseRecommendationReferenceHint(parsed.recommendationReference)
  if (recommendationReference) {
    update.recommendationReference = recommendationReference
  }

  const interaction = parseRecommendationInteractionSignal(parsed.recommendationInteraction)
  if (interaction) {
    update.recommendationInteraction = interaction
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

  return applySeasonalTimingCorrection(message, update)
}
