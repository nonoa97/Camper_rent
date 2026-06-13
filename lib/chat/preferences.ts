import featureNameMapping from './taxonomy/canonical-feature-keys.json'
import featureAliasGroups from './taxonomy/feature-aliases.json'
import { isKnownCapabilityKey } from './capabilities'
import { resolveCapabilityAlias } from './capabilityAliases'

export { resolveCapabilityAlias } from './capabilityAliases'

export type PreferenceStrength = 'hard' | 'soft'

export interface FeaturePreference {
  key: string
  strength: PreferenceStrength
  sourceText: string
  detectedLocale?: string
}

export type AttributePreferenceKey =
  | 'gearbox'
  | 'fuel_type'
  | 'type'
  | 'beds'
  | 'year'

export type AttributePreferenceOperator = 'eq' | 'neq' | 'gte' | 'lte' | 'range' | 'preferred'

export interface AttributePreference {
  key: AttributePreferenceKey
  value?: string | number | boolean
  operator?: AttributePreferenceOperator
  strength: PreferenceStrength
  sourceText: string
  detectedLocale?: string
}

export type CapabilityPreferenceKey = string

export interface CapabilityPreference {
  key: CapabilityPreferenceKey
  strength: PreferenceStrength
  sourceText: string
  detectedLocale?: string
}

export type PricingPreferenceIntent =
  | 'cheaper'
  | 'budget_limit'
  | 'best_value'
  | 'premium_ok'
  | 'avoid_extra_cost'

export interface PricingPreference {
  intent: PricingPreferenceIntent
  amount?: number
  referencePricePerDay?: number
  currency?: 'HUF' | 'EUR'
  strength: PreferenceStrength
  sourceText: string
}

export interface UnmappedPreference {
  sourceText: string
  strength?: PreferenceStrength
  detectedLocale?: string
  reason: 'unknown_feature' | 'unknown_attribute' | 'unknown_capability' | 'unknown_pricing' | 'too_vague'
}

export interface AmbiguousPreference {
  sourceText: string
  candidates: string[]
  strength?: PreferenceStrength
  detectedLocale?: string
  reason: 'ambiguous_feature' | 'ambiguous_attribute' | 'ambiguous_capability'
}

export type FeatureAliasResolution =
  | {
      status: 'matched'
      featureKey: string
      matchedAlias: string
      normalizedAlias: string
      locale: string
      sourceText: string
      normalizedSourceText: string
    }
  | {
      status: 'ambiguous'
      candidates: string[]
      sourceText: string
      normalizedSourceText: string
      matchedAlias?: string
      normalizedAlias?: string
      locale?: string
    }
  | {
      status: 'unmapped'
      sourceText: string
    }

type RawFeatureAliasGroup = {
  featureKey: string
  locale: string
  aliases?: string[]
  ambiguousAliases?: string[]
}

type RawFeaturePreference = Partial<FeaturePreference>
type RawAttributePreference = Partial<AttributePreference> & { key?: string }
type RawCapabilityPreference = Partial<CapabilityPreference> & { key?: string }
type RawPricingPreference = Partial<PricingPreference>
type RawUnmappedPreference = Partial<UnmappedPreference>
type RawAmbiguousPreference = Partial<AmbiguousPreference>

const FEATURE_KEY_PATTERN = /^[a-z0-9_]+$/
const LOCALE_PATTERN = /^[a-z]{2}(-[a-z0-9]+)*$/

const KNOWN_FEATURE_KEYS = new Set(Object.values(featureNameMapping))
const ATTRIBUTE_KEYS = new Set<AttributePreferenceKey>([
  'gearbox',
  'fuel_type',
  'type',
  'beds',
  'year',
])
const PRICING_INTENTS = new Set<PricingPreferenceIntent>([
  'cheaper',
  'budget_limit',
  'best_value',
  'premium_ok',
  'avoid_extra_cost',
])
const CURRENCIES = new Set(['HUF', 'EUR'])
const STRENGTHS = new Set<PreferenceStrength>(['hard', 'soft'])
const ATTRIBUTE_OPERATORS = new Set<AttributePreferenceOperator>(['eq', 'neq', 'gte', 'lte', 'range', 'preferred'])
const ATTRIBUTE_VALUES: Partial<Record<AttributePreferenceKey, Set<string>>> = {
  gearbox: new Set(['Automata', 'Manuális']),
  fuel_type: new Set(['Dízel', 'Benzin', 'Elektromos', 'Hibrid']),
  type: new Set(['Camper van', 'Alkóvos', 'Integrált', 'Félintegrált']),
}

export function isKnownFeatureKey(key: unknown): key is string {
  return typeof key === 'string' && FEATURE_KEY_PATTERN.test(key) && KNOWN_FEATURE_KEYS.has(key)
}

function isStrength(value: unknown): value is PreferenceStrength {
  return value === 'hard' || value === 'soft'
}

function normalizeStrength(value: unknown): PreferenceStrength {
  return isStrength(value) ? value : 'soft'
}

export function normalizeFeatureAlias(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function phraseContainsAlias(normalizedPhrase: string, normalizedAlias: string): boolean {
  if (!normalizedPhrase || !normalizedAlias) return false
  if (normalizedPhrase === normalizedAlias) return true

  const phraseTokens = normalizedPhrase.split(' ')
  const aliasTokens = normalizedAlias.split(' ')
  if (aliasTokens.length > phraseTokens.length) return false

  for (let i = 0; i <= phraseTokens.length - aliasTokens.length; i += 1) {
    if (phraseTokens.slice(i, i + aliasTokens.length).join(' ') === normalizedAlias) {
      return true
    }
  }

  return false
}

function flattenFeatureAliases() {
  const rows: Array<{
    featureKey: string
    alias: string
    normalizedAlias: string
    locale: string
    isAmbiguous: boolean
  }> = []
  const seen = new Set<string>()

  function addRow(row: { featureKey: string; alias: string; locale: string; isAmbiguous: boolean }) {
    if (!isKnownFeatureKey(row.featureKey) || !LOCALE_PATTERN.test(row.locale)) return
    const normalizedAlias = normalizeFeatureAlias(row.alias)
    if (!normalizedAlias) return
    const identity = `${row.featureKey}\t${row.locale}\t${normalizedAlias}`
    if (seen.has(identity)) return
    seen.add(identity)
    rows.push({ ...row, normalizedAlias })
  }

  for (const [alias, featureKey] of Object.entries(featureNameMapping)) {
    addRow({ featureKey, alias, locale: 'hu', isAmbiguous: false })
  }

  for (const group of featureAliasGroups as RawFeatureAliasGroup[]) {
    for (const alias of group.aliases ?? []) {
      addRow({ featureKey: group.featureKey, alias, locale: group.locale, isAmbiguous: false })
    }
    for (const alias of group.ambiguousAliases ?? []) {
      addRow({ featureKey: group.featureKey, alias, locale: group.locale, isAmbiguous: true })
    }
  }

  return rows
}

export function resolveFeatureAlias(phrase: string, locale?: string): FeatureAliasResolution {
  const normalizedPhrase = normalizeFeatureAlias(phrase)
  if (!normalizedPhrase) return { status: 'unmapped', sourceText: phrase }

  const rows = flattenFeatureAliases()
  const localeFiltered = locale
    ? rows.filter(row => row.locale === locale || row.locale === 'und')
    : rows

  const matches = localeFiltered
    .filter(row => phraseContainsAlias(normalizedPhrase, row.normalizedAlias))
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length)

  if (!matches.length) return { status: 'unmapped', sourceText: phrase }

  const bestLength = matches[0].normalizedAlias.length
  const bestMatches = matches.filter(row => row.normalizedAlias.length === bestLength)
  const candidates = [...new Set(bestMatches.map(row => row.featureKey))]

  if (candidates.length > 1) {
    return {
      status: 'ambiguous',
      candidates,
      sourceText: phrase,
      normalizedSourceText: normalizedPhrase,
      matchedAlias: bestMatches[0].alias,
      normalizedAlias: bestMatches[0].normalizedAlias,
      locale: locale ?? bestMatches[0].locale,
    }
  }

  const match = bestMatches[0]
  return {
    status: 'matched',
    featureKey: match.featureKey,
    matchedAlias: match.alias,
    normalizedAlias: match.normalizedAlias,
    locale: match.locale,
    sourceText: phrase,
    normalizedSourceText: normalizedPhrase,
  }
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  return [...new Map(items.map(item => [getKey(item), item])).values()]
}

export function validateFeaturePreferences(raw: unknown): {
  featurePreferences?: FeaturePreference[]
  unmappedPreferences?: UnmappedPreference[]
  ambiguousPreferences?: AmbiguousPreference[]
} {
  if (!Array.isArray(raw)) return {}

  const featurePreferences: FeaturePreference[] = []
  const unmappedPreferences: UnmappedPreference[] = []
  const ambiguousPreferences: AmbiguousPreference[] = []

  for (const item of raw as RawFeaturePreference[]) {
    const sourceText = typeof item.sourceText === 'string' && item.sourceText.trim()
      ? item.sourceText.trim()
      : typeof item.key === 'string'
        ? item.key
        : ''
    if (!sourceText) continue

    const strength = normalizeStrength(item.strength)
    const detectedLocale = typeof item.detectedLocale === 'string' ? item.detectedLocale : undefined

    const resolution = resolveFeatureAlias(sourceText, detectedLocale)
    if (resolution.status === 'matched') {
      featurePreferences.push({
        key: resolution.featureKey,
        strength,
        sourceText,
        detectedLocale: resolution.locale,
      })
    } else if (resolution.status === 'ambiguous') {
      ambiguousPreferences.push({
        sourceText,
        candidates: resolution.candidates,
        strength,
        detectedLocale,
        reason: 'ambiguous_feature',
      })
    } else if (isKnownFeatureKey(item.key)) {
      featurePreferences.push({ key: item.key, strength, sourceText, detectedLocale })
    } else {
      unmappedPreferences.push({
        sourceText,
        strength,
        detectedLocale,
        reason: 'unknown_feature',
      })
    }
  }

  return {
    featurePreferences: uniqueBy(featurePreferences, pref => `${pref.key}|${pref.strength}|${pref.sourceText}`),
    unmappedPreferences: uniqueBy(unmappedPreferences, pref => `${pref.reason}|${pref.sourceText}`),
    ambiguousPreferences: uniqueBy(ambiguousPreferences, pref => `${pref.reason}|${pref.sourceText}|${pref.candidates.join(',')}`),
  }
}

export function validateAttributePreferences(raw: unknown): {
  attributePreferences?: AttributePreference[]
  unmappedPreferences?: UnmappedPreference[]
} {
  if (!Array.isArray(raw)) return {}

  const attributePreferences: AttributePreference[] = []
  const unmappedPreferences: UnmappedPreference[] = []

  for (const item of raw as RawAttributePreference[]) {
    const sourceText = typeof item.sourceText === 'string' && item.sourceText.trim()
      ? item.sourceText.trim()
      : typeof item.key === 'string'
        ? item.key
        : ''
    if (!sourceText) continue

    const strength = normalizeStrength(item.strength)
    const detectedLocale = typeof item.detectedLocale === 'string' ? item.detectedLocale : undefined

    if (!ATTRIBUTE_KEYS.has(item.key as AttributePreferenceKey)) {
      unmappedPreferences.push({ sourceText, strength, detectedLocale, reason: 'unknown_attribute' })
      continue
    }

    const key = item.key as AttributePreferenceKey
    const operator = ATTRIBUTE_OPERATORS.has(item.operator as AttributePreferenceOperator)
      ? item.operator as AttributePreferenceOperator
      : undefined
    const allowedValues = ATTRIBUTE_VALUES[key]
    if (allowedValues && !allowedValues.has(String(item.value))) {
      unmappedPreferences.push({ sourceText, strength, detectedLocale, reason: 'unknown_attribute' })
      continue
    }
    if ((key === 'beds' || key === 'year') && typeof item.value !== 'number') {
      unmappedPreferences.push({ sourceText, strength, detectedLocale, reason: 'unknown_attribute' })
      continue
    }
    attributePreferences.push({
      key,
      value: item.value,
      operator,
      strength,
      sourceText,
      detectedLocale,
    })
  }

  return {
    attributePreferences: uniqueBy(attributePreferences, pref => `${pref.key}|${pref.operator ?? ''}|${String(pref.value)}|${pref.strength}|${pref.sourceText}`),
    unmappedPreferences: uniqueBy(unmappedPreferences, pref => `${pref.reason}|${pref.sourceText}`),
  }
}

export function validateCapabilityPreferences(raw: unknown): {
  capabilityPreferences?: CapabilityPreference[]
  unmappedPreferences?: UnmappedPreference[]
  ambiguousPreferences?: AmbiguousPreference[]
} {
  if (!Array.isArray(raw)) return {}

  const capabilityPreferences: CapabilityPreference[] = []
  const unmappedPreferences: UnmappedPreference[] = []
  const ambiguousPreferences: AmbiguousPreference[] = []

  for (const item of raw as RawCapabilityPreference[]) {
    const sourceText = typeof item.sourceText === 'string' && item.sourceText.trim()
      ? item.sourceText.trim()
      : typeof item.key === 'string'
        ? item.key
        : ''
    if (!sourceText) continue

    const strength = normalizeStrength(item.strength)
    const detectedLocale = typeof item.detectedLocale === 'string' ? item.detectedLocale : undefined

    const capabilityResolution = resolveCapabilityAlias(sourceText, detectedLocale)
    if (capabilityResolution.status === 'matched') {
      capabilityPreferences.push({
        key: capabilityResolution.capabilityKey,
        strength,
        sourceText,
        detectedLocale: capabilityResolution.locale,
      })
      continue
    }

    if (capabilityResolution.status === 'ambiguous') {
      ambiguousPreferences.push({
        sourceText,
        candidates: capabilityResolution.candidates,
        strength,
        detectedLocale,
        reason: 'ambiguous_capability',
      })
      continue
    }

    const featureResolution = resolveFeatureAlias(sourceText, detectedLocale)
    if (featureResolution.status !== 'unmapped') {
      unmappedPreferences.push({ sourceText, strength, detectedLocale, reason: 'unknown_capability' })
      continue
    }

    if (!isKnownCapabilityKey(item.key)) {
      unmappedPreferences.push({ sourceText, strength, detectedLocale, reason: 'unknown_capability' })
      continue
    }

    capabilityPreferences.push({
      key: item.key,
      strength,
      sourceText,
      detectedLocale,
    })
  }

  return {
    capabilityPreferences: uniqueBy(capabilityPreferences, pref => `${pref.key}|${pref.strength}|${pref.sourceText}`),
    unmappedPreferences: uniqueBy(unmappedPreferences, pref => `${pref.reason}|${pref.sourceText}`),
    ambiguousPreferences: uniqueBy(ambiguousPreferences, pref => `${pref.reason}|${pref.sourceText}|${pref.candidates.join(',')}`),
  }
}

export function validatePricingPreference(raw: unknown): {
  pricingPreference?: PricingPreference
  unmappedPreferences?: UnmappedPreference[]
} {
  if (!raw || typeof raw !== 'object') return {}
  const item = raw as RawPricingPreference
  const sourceText = typeof item.sourceText === 'string' && item.sourceText.trim()
    ? item.sourceText.trim()
    : typeof item.intent === 'string'
      ? item.intent
      : ''
  if (!sourceText) return {}

  const strength = normalizeStrength(item.strength)
  if (!PRICING_INTENTS.has(item.intent as PricingPreferenceIntent)) {
    return { unmappedPreferences: [{ sourceText, strength, reason: 'unknown_pricing' }] }
  }

  const amount = typeof item.amount === 'number' && Number.isFinite(item.amount) && item.amount > 0
    ? item.amount
    : undefined
  const currency = typeof item.currency === 'string' && CURRENCIES.has(item.currency)
    ? item.currency as PricingPreference['currency']
    : undefined

  if (item.intent === 'budget_limit' && !amount) {
    return { unmappedPreferences: [{ sourceText, strength, reason: 'unknown_pricing' }] }
  }

  return {
    pricingPreference: {
      intent: item.intent as PricingPreferenceIntent,
      amount,
      currency,
      strength,
      sourceText,
    },
  }
}

export function validateUnmappedPreferences(raw: unknown): UnmappedPreference[] {
  if (!Array.isArray(raw)) return []
  return (raw as RawUnmappedPreference[])
    .filter(item => typeof item.sourceText === 'string' && item.sourceText.trim().length > 0)
    .map(item => ({
      sourceText: item.sourceText!.trim(),
      strength: STRENGTHS.has(item.strength as PreferenceStrength) ? item.strength as PreferenceStrength : undefined,
      detectedLocale: typeof item.detectedLocale === 'string' ? item.detectedLocale : undefined,
      reason: ['unknown_feature', 'unknown_attribute', 'unknown_capability', 'unknown_pricing', 'too_vague'].includes(item.reason ?? '')
        ? item.reason as UnmappedPreference['reason']
        : 'too_vague',
    }))
}

export function validateAmbiguousPreferences(raw: unknown): AmbiguousPreference[] {
  if (!Array.isArray(raw)) return []
  return (raw as RawAmbiguousPreference[])
    .filter(item =>
      typeof item.sourceText === 'string' &&
      item.sourceText.trim().length > 0 &&
      Array.isArray(item.candidates) &&
      item.candidates.every(candidate => typeof candidate === 'string' && candidate.length > 0),
    )
    .map(item => ({
      sourceText: item.sourceText!.trim(),
      candidates: [...new Set(item.candidates as string[])],
      strength: STRENGTHS.has(item.strength as PreferenceStrength) ? item.strength as PreferenceStrength : undefined,
      detectedLocale: typeof item.detectedLocale === 'string' ? item.detectedLocale : undefined,
      reason: ['ambiguous_feature', 'ambiguous_attribute', 'ambiguous_capability'].includes(item.reason ?? '')
        ? item.reason as AmbiguousPreference['reason']
        : 'ambiguous_feature',
    }))
}
