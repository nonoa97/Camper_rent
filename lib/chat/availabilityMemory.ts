import {
  AvailabilityCriteria,
  ConversationState,
  SessionAvailabilityResult,
  SessionMemory,
} from './state'
import { CamperResult } from './availability'
import { positivePriceOrUndefined } from './priceUtils'

export type AvailabilityCriteriaCompatibilityStatus =
  | 'compatible'
  | 'compatible_relaxed'
  | 'needs_recheck'
  | 'stale'

export type AvailabilityCriteriaCompatibilityResult = {
  status: AvailabilityCriteriaCompatibilityStatus
  reasons: string[]
}

export type ResolvedSessionAvailabilityReference = {
  result: SessionAvailabilityResult
  compatibility: AvailabilityCriteriaCompatibilityResult
}

function normalizeCriteriaList(items?: string[]): string[] | undefined {
  const normalized = [...new Set((items ?? []).map(item => item.trim()).filter(Boolean))].sort()
  return normalized.length ? normalized : undefined
}

function criteriaValueMatches(
  savedValue: string | number | boolean | string[] | undefined,
  currentValue: string | number | boolean | string[] | undefined,
): boolean {
  if (savedValue === undefined && currentValue === undefined) return true
  if (savedValue === undefined || currentValue === undefined) return false
  if (Array.isArray(savedValue) || Array.isArray(currentValue)) {
    if (!Array.isArray(savedValue) || !Array.isArray(currentValue)) return false
    return JSON.stringify(normalizeCriteriaList(savedValue) ?? []) === JSON.stringify(normalizeCriteriaList(currentValue) ?? [])
  }
  return savedValue === currentValue
}

function includesAllValues(base?: string[], candidate?: string[]): boolean {
  const baseSet = new Set(normalizeCriteriaList(base) ?? [])
  const candidateSet = new Set(normalizeCriteriaList(candidate) ?? [])
  for (const value of candidateSet) {
    if (!baseSet.has(value)) return false
  }
  return true
}

function preferenceKeysByStrength(
  preferences: AvailabilityCriteria['capabilityPreferences'] | undefined,
  strength: 'hard' | 'soft',
): string[] {
  return [...new Set((preferences ?? [])
    .filter(preference => preference.strength === strength)
    .map(preference => preference.key))]
    .sort()
}

function featurePreferenceKeysByStrength(
  preferences: AvailabilityCriteria['featurePreferences'] | undefined,
  strength: 'hard' | 'soft',
): string[] {
  return [...new Set((preferences ?? [])
    .filter(preference => preference.strength === strength)
    .map(preference => preference.key))]
    .sort()
}

function attributePreferenceIdentitiesByStrength(
  preferences: AvailabilityCriteria['attributePreferences'] | undefined,
  strength: 'hard' | 'soft',
): string[] {
  return [...new Set((preferences ?? [])
    .filter(preference => preference.strength === strength)
    .map(preference => `${preference.key}:${preference.operator ?? ''}:${String(preference.value ?? '')}`))]
    .sort()
}

function normalizeFeaturePreferences(
  preferences: AvailabilityCriteria['featurePreferences'] | undefined,
): AvailabilityCriteria['featurePreferences'] | undefined {
  const normalized = (preferences ?? [])
    .map(preference => ({
      key: preference.key,
      strength: preference.strength,
      sourceText: preference.sourceText,
      detectedLocale: preference.detectedLocale,
    }))
    .sort((a, b) => `${a.strength}:${a.key}:${a.sourceText}`.localeCompare(`${b.strength}:${b.key}:${b.sourceText}`))
  return normalized.length ? normalized : undefined
}

function normalizeAttributePreferences(
  preferences: AvailabilityCriteria['attributePreferences'] | undefined,
): AvailabilityCriteria['attributePreferences'] | undefined {
  const normalized = (preferences ?? [])
    .map(preference => ({
      key: preference.key,
      operator: preference.operator,
      value: preference.value,
      strength: preference.strength,
      sourceText: preference.sourceText,
      detectedLocale: preference.detectedLocale,
    }))
    .sort((a, b) => `${a.strength}:${a.key}:${a.operator ?? ''}:${String(a.value ?? '')}:${a.sourceText}`
      .localeCompare(`${b.strength}:${b.key}:${b.operator ?? ''}:${String(b.value ?? '')}:${b.sourceText}`))
  return normalized.length ? normalized : undefined
}

function normalizeCapabilityPreferences(
  preferences: AvailabilityCriteria['capabilityPreferences'] | undefined,
): AvailabilityCriteria['capabilityPreferences'] | undefined {
  const normalized = (preferences ?? [])
    .map(preference => ({
      key: preference.key,
      strength: preference.strength,
      sourceText: preference.sourceText,
      detectedLocale: preference.detectedLocale,
    }))
    .sort((a, b) => `${a.strength}:${a.key}:${a.sourceText}`.localeCompare(`${b.strength}:${b.key}:${b.sourceText}`))
  return normalized.length ? normalized : undefined
}

function normalizePricingPreference(
  preference: AvailabilityCriteria['pricingPreference'] | undefined,
): AvailabilityCriteria['pricingPreference'] | undefined {
  if (!preference) return undefined
  return {
    intent: preference.intent,
    amount: preference.amount,
    currency: preference.currency,
    strength: preference.strength,
    sourceText: preference.sourceText,
  }
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of items) {
    const key = keyOf(item)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function createAvailabilityCriteria(state: ConversationState): AvailabilityCriteria {
  const criteria: AvailabilityCriteria = {}
  if (state.month) criteria.month = state.month
  if (state.startDate) criteria.startDate = state.startDate
  if (state.endDate) criteria.endDate = state.endDate
  if (state.durationDays !== undefined) criteria.durationDays = state.durationDays
  if (state.passengers !== undefined) criteria.passengers = state.passengers
  if (state.campingType) criteria.campingType = state.campingType
  const featurePreferences = normalizeFeaturePreferences(state.featurePreferences)
  if (featurePreferences) criteria.featurePreferences = featurePreferences
  const attributePreferences = normalizeAttributePreferences(state.attributePreferences)
  if (attributePreferences) criteria.attributePreferences = attributePreferences
  const capabilityPreferences = normalizeCapabilityPreferences(state.capabilityPreferences)
  if (capabilityPreferences) criteria.capabilityPreferences = capabilityPreferences
  const pricingPreference = normalizePricingPreference(state.pricingPreference)
  if (pricingPreference) criteria.pricingPreference = pricingPreference
  if (state.earliestAvailable !== undefined) criteria.earliestAvailable = state.earliestAvailable
  return criteria
}

export function createAvailabilityCriteriaHash(criteria: AvailabilityCriteria): string {
  const normalized: AvailabilityCriteria = {
    month: criteria.month,
    startDate: criteria.startDate,
    endDate: criteria.endDate,
    durationDays: criteria.durationDays,
    passengers: criteria.passengers,
    campingType: criteria.campingType,
    featurePreferences: normalizeFeaturePreferences(criteria.featurePreferences),
    attributePreferences: normalizeAttributePreferences(criteria.attributePreferences),
    capabilityPreferences: normalizeCapabilityPreferences(criteria.capabilityPreferences),
    pricingPreference: normalizePricingPreference(criteria.pricingPreference),
    extraRequirements: normalizeCriteriaList(criteria.extraRequirements),
    softPreferences: normalizeCriteriaList(criteria.softPreferences),
    earliestAvailable: criteria.earliestAvailable,
  }
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(normalized).filter(([, value]) => value !== undefined),
    ),
  )
}

export function evaluateAvailabilityCriteriaCompatibility(
  criteria: AvailabilityCriteria | undefined,
  currentState: ConversationState,
): AvailabilityCriteriaCompatibilityResult {
  if (!criteria) {
    return { status: 'stale', reasons: ['missing_saved_criteria'] }
  }

  const currentCriteria = createAvailabilityCriteria(currentState)
  const reasons: string[] = []
  let status: AvailabilityCriteriaCompatibilityStatus = 'compatible'

  const setStatus = (next: AvailabilityCriteriaCompatibilityStatus, reason: string) => {
    reasons.push(reason)
    const rank: Record<AvailabilityCriteriaCompatibilityStatus, number> = {
      compatible: 0,
      compatible_relaxed: 1,
      needs_recheck: 2,
      stale: 3,
    }
    if (rank[next] > rank[status]) status = next
  }

  const savedHasConcreteWindow = !!(criteria.startDate || criteria.endDate || criteria.month)
  const currentHasConcreteWindow = !!(currentCriteria.startDate || currentCriteria.endDate || currentCriteria.month)

  if (
    criteria.startDate !== currentCriteria.startDate ||
    criteria.endDate !== currentCriteria.endDate ||
    criteria.month !== currentCriteria.month
  ) {
    setStatus('stale', 'time_window_changed')
  }

  if (criteria.earliestAvailable !== currentCriteria.earliestAvailable) {
    if (savedHasConcreteWindow && currentHasConcreteWindow) {
      setStatus('needs_recheck', 'earliest_mode_changed_for_same_window')
    } else {
      setStatus('stale', 'earliest_mode_changed')
    }
  }

  if (criteria.durationDays !== undefined && currentCriteria.durationDays !== undefined) {
    if (currentCriteria.durationDays < criteria.durationDays) {
      setStatus('compatible_relaxed', 'duration_decreased')
    } else if (currentCriteria.durationDays > criteria.durationDays) {
      setStatus('needs_recheck', 'duration_increased')
    }
  } else if (criteria.durationDays !== currentCriteria.durationDays) {
    setStatus('needs_recheck', 'duration_specificity_changed')
  }

  if (criteria.passengers !== undefined && currentCriteria.passengers !== undefined) {
    if (currentCriteria.passengers < criteria.passengers) {
      setStatus('compatible_relaxed', 'passengers_decreased')
    } else if (currentCriteria.passengers > criteria.passengers) {
      setStatus('needs_recheck', 'passengers_increased')
    }
  } else if (criteria.passengers !== currentCriteria.passengers) {
    setStatus('needs_recheck', 'passenger_specificity_changed')
  }

  if (criteria.campingType === 'wild' || currentCriteria.campingType === 'wild') {
    setStatus('stale', 'legacy_wild_camping_type')
  } else if (criteria.campingType && currentCriteria.campingType && criteria.campingType !== currentCriteria.campingType) {
    setStatus('needs_recheck', 'camping_type_changed')
  } else if (criteria.campingType !== currentCriteria.campingType) {
    setStatus('needs_recheck', 'camping_type_specificity_changed')
  }

  const savedHardFeatures = featurePreferenceKeysByStrength(criteria.featurePreferences, 'hard')
  const currentHardFeatures = featurePreferenceKeysByStrength(currentCriteria.featurePreferences, 'hard')
  if (!includesAllValues(savedHardFeatures, currentHardFeatures)) {
    setStatus('needs_recheck', 'hard_feature_added')
  } else if (!includesAllValues(currentHardFeatures, savedHardFeatures)) {
    setStatus('compatible_relaxed', 'hard_feature_removed')
  }

  if (!criteriaValueMatches(
    featurePreferenceKeysByStrength(criteria.featurePreferences, 'soft'),
    featurePreferenceKeysByStrength(currentCriteria.featurePreferences, 'soft'),
  )) {
    reasons.push('soft_feature_changed')
  }

  const savedHardAttributes = attributePreferenceIdentitiesByStrength(criteria.attributePreferences, 'hard')
  const currentHardAttributes = attributePreferenceIdentitiesByStrength(currentCriteria.attributePreferences, 'hard')
  if (!includesAllValues(savedHardAttributes, currentHardAttributes)) {
    setStatus('needs_recheck', 'hard_attribute_added')
  } else if (!includesAllValues(currentHardAttributes, savedHardAttributes)) {
    setStatus('compatible_relaxed', 'hard_attribute_removed')
  }

  if (!criteriaValueMatches(
    attributePreferenceIdentitiesByStrength(criteria.attributePreferences, 'soft'),
    attributePreferenceIdentitiesByStrength(currentCriteria.attributePreferences, 'soft'),
  )) {
    reasons.push('soft_attribute_changed')
  }

  const savedHardCapabilities = preferenceKeysByStrength(criteria.capabilityPreferences, 'hard')
  const currentHardCapabilities = preferenceKeysByStrength(currentCriteria.capabilityPreferences, 'hard')
  if (!includesAllValues(savedHardCapabilities, currentHardCapabilities)) {
    setStatus('needs_recheck', 'hard_capability_added')
  } else if (!includesAllValues(currentHardCapabilities, savedHardCapabilities)) {
    setStatus('compatible_relaxed', 'hard_capability_removed')
  }

  if (!criteriaValueMatches(
    preferenceKeysByStrength(criteria.capabilityPreferences, 'soft'),
    preferenceKeysByStrength(currentCriteria.capabilityPreferences, 'soft'),
  )) {
    reasons.push('soft_capability_changed')
  }

  if (!criteriaValueMatches(
    criteria.pricingPreference ? JSON.stringify(normalizePricingPreference(criteria.pricingPreference)) : undefined,
    currentCriteria.pricingPreference ? JSON.stringify(normalizePricingPreference(currentCriteria.pricingPreference)) : undefined,
  )) {
    const savedBudget = criteria.pricingPreference?.intent === 'budget_limit' ? criteria.pricingPreference.amount : undefined
    const currentBudget = currentCriteria.pricingPreference?.intent === 'budget_limit' ? currentCriteria.pricingPreference.amount : undefined
    if (savedBudget !== undefined && currentBudget !== undefined) {
      if (currentBudget < savedBudget) {
        setStatus('needs_recheck', 'pricing_tightened')
      } else if (currentBudget > savedBudget) {
        setStatus('compatible_relaxed', 'pricing_relaxed')
      } else {
        reasons.push('pricing_preference_changed')
      }
    } else if (currentCriteria.pricingPreference?.intent === 'cheaper' || currentCriteria.pricingPreference?.intent === 'budget_limit') {
      setStatus('needs_recheck', 'pricing_tightened')
    } else if (criteria.pricingPreference && !currentCriteria.pricingPreference) {
      setStatus('compatible_relaxed', 'pricing_relaxed')
    } else {
      reasons.push('pricing_preference_changed')
    }
  }

  // Legacy raw criteria are only evaluated for old client-carried memory snapshots.
  if (criteria.extraRequirements !== undefined) {
    const savedExtras = normalizeCriteriaList(criteria.extraRequirements) ?? []
    const currentExtras = normalizeCriteriaList(currentState.extraRequirements) ?? []
    if (!includesAllValues(savedExtras, currentExtras)) {
      setStatus('needs_recheck', 'legacy_hard_requirements_added')
    } else if (!includesAllValues(currentExtras, savedExtras)) {
      setStatus('compatible_relaxed', 'legacy_hard_requirements_removed')
    }
  }

  // Soft preferences may affect ranking, but not whether a remembered availability slot existed.
  if (
    criteria.softPreferences !== undefined &&
    !criteriaValueMatches(criteria.softPreferences, currentState.softPreferences)
  ) {
    reasons.push('legacy_soft_preferences_changed')
  }

  return { status, reasons }
}

function isCriteriaUsableWithoutRecheck(criteria: AvailabilityCriteria | undefined, currentState: ConversationState): boolean {
  const status = evaluateAvailabilityCriteriaCompatibility(criteria, currentState).status
  return status === 'compatible' || status === 'compatible_relaxed'
}

function dedupeAvailabilityResults(results: SessionAvailabilityResult[]): SessionAvailabilityResult[] {
  return dedupeBy(
    results,
    item => `${item.camperSlug}|${item.from}|${item.to}|${item.days}|${item.source}|${item.criteriaHash ?? ''}`,
  )
}

export function rememberSessionAvailability(
  sessionMemory: SessionMemory,
  candidate: { camper: CamperResult; slot: CamperResult['availableSlots'][number] } | null,
  source: SessionAvailabilityResult['source'],
  state: ConversationState,
): SessionMemory {
  if (!candidate) return sessionMemory
  const criteria = createAvailabilityCriteria(state)
  const next: SessionAvailabilityResult = {
    camperSlug: candidate.camper.slug,
    camperName: candidate.camper.name,
    from: candidate.slot.from,
    to: candidate.slot.to,
    days: candidate.slot.days,
    pricePerDay: positivePriceOrUndefined(candidate.camper.price_per_day),
    source,
    criteria,
    criteriaHash: createAvailabilityCriteriaHash(criteria),
  }
  return {
    ...sessionMemory,
    lastAvailabilityResult: next,
    previousAvailabilityResults: dedupeAvailabilityResults([
      ...(sessionMemory.previousAvailabilityResults ?? []),
      next,
    ]).slice(-8),
  }
}

export function markStaleAvailabilityResults(sessionMemory: SessionMemory, state: ConversationState): SessionMemory {
  const candidates = dedupeAvailabilityResults([
    ...(sessionMemory.previousAvailabilityResults ?? []),
    ...(sessionMemory.lastAvailabilityResult ? [sessionMemory.lastAvailabilityResult] : []),
    ...(sessionMemory.lastSpecificCamperAvailability ? [sessionMemory.lastSpecificCamperAvailability] : []),
  ])
  const stale = candidates.filter(result => !isCriteriaUsableWithoutRecheck(result.criteria, state))
  return {
    ...sessionMemory,
    staleAvailabilityResults: dedupeAvailabilityResults([
      ...(sessionMemory.staleAvailabilityResults ?? []),
      ...stale,
    ]).slice(-8),
  }
}

export function rememberStaleAvailabilityResult(
  sessionMemory: SessionMemory,
  result: SessionAvailabilityResult,
): SessionMemory {
  return {
    ...sessionMemory,
    staleAvailabilityResults: dedupeAvailabilityResults([
      ...(sessionMemory.staleAvailabilityResults ?? []),
      result,
    ]).slice(-8),
  }
}

function choosePreferredAvailabilityResult(
  results: SessionAvailabilityResult[],
  state: ConversationState,
): ResolvedSessionAvailabilityReference | null {
  if (results.length === 0) return null
  const evaluated = results.map(result => ({
    result,
    compatibility: evaluateAvailabilityCriteriaCompatibility(result.criteria, state),
  }))
  const compatible = evaluated.filter(item =>
    item.compatibility.status === 'compatible' ||
    item.compatibility.status === 'compatible_relaxed',
  )
  const selected = compatible[compatible.length - 1] ?? evaluated[evaluated.length - 1]
  return {
    result: selected.result,
    compatibility: selected.compatibility,
  }
}

export function resolveSessionAvailabilityReference(
  state: ConversationState,
  sessionMemory: SessionMemory,
): ResolvedSessionAvailabilityReference | null {
  if (state.referenceTarget === 'lastAvailability') {
    const result = sessionMemory.lastAvailabilityResult
    return result ? { result, compatibility: evaluateAvailabilityCriteriaCompatibility(result.criteria, state) } : null
  }

  if (state.referenceTarget === 'previousAvailability') {
    const results = sessionMemory.previousAvailabilityResults ?? []
    const currentStart = state.pendingAvailabilityConfirmation?.startDate ?? state.startDate
    if (currentStart) {
      const earlier = results
        .filter(result => result.from < currentStart)
        .sort((a, b) => a.from.localeCompare(b.from))
      return choosePreferredAvailabilityResult(earlier, state)
        ?? choosePreferredAvailabilityResult(results.slice(0, -1), state)
        ?? (sessionMemory.lastAvailabilityResult
          ? {
              result: sessionMemory.lastAvailabilityResult,
              compatibility: evaluateAvailabilityCriteriaCompatibility(sessionMemory.lastAvailabilityResult.criteria, state),
            }
          : null)
    }
    return choosePreferredAvailabilityResult(results.slice(0, -1), state)
      ?? (sessionMemory.lastAvailabilityResult
        ? {
            result: sessionMemory.lastAvailabilityResult,
            compatibility: evaluateAvailabilityCriteriaCompatibility(sessionMemory.lastAvailabilityResult.criteria, state),
          }
        : null)
  }

  return null
}
