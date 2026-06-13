import capabilityAliasGroups from './taxonomy/capability-aliases.json'
import { isKnownCapabilityKey } from './capabilities'

export type CapabilityAliasResolution =
  | {
      status: 'matched'
      capabilityKey: string
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
      reason: 'multiple_capabilities' | 'explicit_ambiguous_alias'
    }
  | {
      status: 'unmapped'
      sourceText: string
    }

type RawCapabilityAliasGroup = {
  capabilityKey: string
  locale: string
  aliases?: string[]
  ambiguousAliases?: string[]
}

const LOCALE_PATTERN = /^[a-z]{2}(-[a-z0-9]+)*$/

export function normalizeCapabilityAlias(value: unknown): string {
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

function flattenCapabilityAliases() {
  const rows: Array<{
    capabilityKey: string
    alias: string
    normalizedAlias: string
    locale: string
    isAmbiguous: boolean
  }> = []
  const seen = new Set<string>()

  function addRow(row: { capabilityKey: string; alias: string; locale: string; isAmbiguous: boolean }) {
    if (!isKnownCapabilityKey(row.capabilityKey) || !LOCALE_PATTERN.test(row.locale)) return
    const normalizedAlias = normalizeCapabilityAlias(row.alias)
    if (!normalizedAlias) return
    const identity = `${row.capabilityKey}\t${row.locale}\t${normalizedAlias}\t${row.isAmbiguous ? 'ambiguous' : 'alias'}`
    if (seen.has(identity)) return
    seen.add(identity)
    rows.push({ ...row, normalizedAlias })
  }

  for (const group of capabilityAliasGroups as RawCapabilityAliasGroup[]) {
    for (const alias of group.aliases ?? []) {
      addRow({ capabilityKey: group.capabilityKey, alias, locale: group.locale, isAmbiguous: false })
    }
    for (const alias of group.ambiguousAliases ?? []) {
      addRow({ capabilityKey: group.capabilityKey, alias, locale: group.locale, isAmbiguous: true })
    }
  }

  return rows
}

export function resolveCapabilityAlias(phrase: string, locale?: string): CapabilityAliasResolution {
  const normalizedPhrase = normalizeCapabilityAlias(phrase)
  if (!normalizedPhrase) return { status: 'unmapped', sourceText: phrase }

  const rows = flattenCapabilityAliases()
  const localeFiltered = locale
    ? rows.filter(row => row.locale === locale || row.locale === 'und')
    : rows

  const matches = localeFiltered
    .filter(row => phraseContainsAlias(normalizedPhrase, row.normalizedAlias))
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length)

  if (!matches.length) return { status: 'unmapped', sourceText: phrase }

  const bestLength = matches[0].normalizedAlias.length
  const bestMatches = matches.filter(row => row.normalizedAlias.length === bestLength)
  const candidates = [...new Set(bestMatches.map(row => row.capabilityKey))]
  const hasExplicitAmbiguousAlias = bestMatches.some(row => row.isAmbiguous)

  if (candidates.length > 1 || hasExplicitAmbiguousAlias) {
    return {
      status: 'ambiguous',
      candidates,
      sourceText: phrase,
      normalizedSourceText: normalizedPhrase,
      matchedAlias: bestMatches[0].alias,
      normalizedAlias: bestMatches[0].normalizedAlias,
      locale: locale ?? bestMatches[0].locale,
      reason: candidates.length > 1 ? 'multiple_capabilities' : 'explicit_ambiguous_alias',
    }
  }

  const match = bestMatches[0]
  return {
    status: 'matched',
    capabilityKey: match.capabilityKey,
    matchedAlias: match.alias,
    normalizedAlias: match.normalizedAlias,
    locale: match.locale,
    sourceText: phrase,
    normalizedSourceText: normalizedPhrase,
  }
}
