import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  loadCapabilityDefinitions,
  validateCapabilityKey,
} from './capability-utils.mjs'

export const LOCALE_PATTERN = /^[a-z]{2}(-[a-z0-9]+)*$/

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const DEFAULT_CAPABILITY_ALIAS_PATH = path.join(__dirname, '..', 'lib', 'chat', 'taxonomy', 'capability-aliases.json')

export const HIGH_PRIORITY_CAPABILITY_KEYS = [
  'wild_camping',
  'off_grid',
  'remote_work',
  'winter_use',
  'bike_transport',
  'pet_travel',
]

export function normalizeCapabilityAlias(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function loadCapabilityAliases(aliasPath = DEFAULT_CAPABILITY_ALIAS_PATH) {
  const raw = fs.readFileSync(aliasPath, 'utf8')
  return JSON.parse(raw)
}

export function getKnownCapabilityKeys(definitions = loadCapabilityDefinitions()) {
  return new Set(definitions.map(definition => definition.key))
}

export function flattenCapabilityAliases({
  aliasGroups = loadCapabilityAliases(),
} = {}) {
  const rows = []
  const seen = new Set()

  function addRow(row) {
    const normalizedAlias = normalizeCapabilityAlias(row.alias)
    const identity = `${row.capabilityKey}\t${row.locale}\t${normalizedAlias}\t${row.isAmbiguous ? 'ambiguous' : 'alias'}`
    if (seen.has(identity)) return
    seen.add(identity)
    rows.push({ ...row, normalizedAlias })
  }

  for (const group of aliasGroups) {
    for (const alias of group.aliases ?? []) {
      addRow({
        capabilityKey: group.capabilityKey,
        alias,
        locale: group.locale,
        isAmbiguous: false,
      })
    }

    for (const alias of group.ambiguousAliases ?? []) {
      addRow({
        capabilityKey: group.capabilityKey,
        alias,
        locale: group.locale,
        isAmbiguous: true,
      })
    }
  }

  return rows
}

export function validateCapabilityAliasRegistry({
  definitions = loadCapabilityDefinitions(),
  aliasGroups = loadCapabilityAliases(),
} = {}) {
  const errors = []
  const knownKeys = getKnownCapabilityKeys(definitions)

  for (const [index, group] of aliasGroups.entries()) {
    const label = `capability alias group ${index + 1}`
    if (!validateCapabilityKey(group.capabilityKey)) {
      errors.push(`${label} has invalid capabilityKey: ${JSON.stringify(group.capabilityKey)}`)
    } else if (!knownKeys.has(group.capabilityKey)) {
      errors.push(`${label} points to unknown capabilityKey: ${group.capabilityKey}`)
    }

    if (!LOCALE_PATTERN.test(group.locale ?? '')) {
      errors.push(`${label} has invalid locale: ${JSON.stringify(group.locale)}`)
    }

    for (const alias of [...(group.aliases ?? []), ...(group.ambiguousAliases ?? [])]) {
      if (typeof alias !== 'string' || alias.trim() === '') {
        errors.push(`${label} contains an empty alias.`)
        continue
      }
      const normalizedAlias = normalizeCapabilityAlias(alias)
      if (!normalizedAlias) {
        errors.push(`${label} has alias with empty normalized form: ${JSON.stringify(alias)}`)
      }
    }
  }

  const rows = flattenCapabilityAliases({ aliasGroups })
  const rowIdentity = new Map()
  const normalizedOwners = new Map()

  for (const row of rows) {
    const identity = `${row.capabilityKey}\t${row.locale}\t${row.normalizedAlias}\t${row.isAmbiguous ? 'ambiguous' : 'alias'}`
    const duplicate = rowIdentity.get(identity)
    if (duplicate) {
      errors.push(`Duplicate alias for same capability: "${row.alias}" and "${duplicate.alias}" both normalize to "${row.normalizedAlias}" (${row.capabilityKey}, ${row.locale})`)
    } else {
      rowIdentity.set(identity, row)
    }

    const key = `${row.locale}\t${row.normalizedAlias}`
    const owners = normalizedOwners.get(key) ?? []
    owners.push(row)
    normalizedOwners.set(key, owners)
  }

  for (const [key, owners] of normalizedOwners.entries()) {
    const capabilityKeys = [...new Set(owners.map(row => row.capabilityKey))]
    if (capabilityKeys.length <= 1) continue

    const allExplicitlyAmbiguous = owners.every(row => row.isAmbiguous)
    if (!allExplicitlyAmbiguous) {
      const [locale, normalizedAlias] = key.split('\t')
      errors.push(`Ambiguous capability alias "${normalizedAlias}" in locale "${locale}" must be explicit. Candidates: ${capabilityKeys.join(', ')}`)
    }
  }

  for (const capabilityKey of knownKeys) {
    const rowsForCapability = rows.filter(row => row.capabilityKey === capabilityKey && !row.isAmbiguous)
    if (rowsForCapability.length === 0) {
      errors.push(`Capability has no non-ambiguous aliases: ${capabilityKey}`)
    }
  }

  return { valid: errors.length === 0, errors, rows }
}

function phraseContainsAlias(normalizedPhrase, normalizedAlias) {
  if (!normalizedPhrase || !normalizedAlias) return false
  if (normalizedPhrase === normalizedAlias) return true

  const phraseTokens = normalizedPhrase.split(' ')
  const aliasTokens = normalizedAlias.split(' ')
  if (aliasTokens.length > phraseTokens.length) return false

  for (let i = 0; i <= phraseTokens.length - aliasTokens.length; i += 1) {
    const slice = phraseTokens.slice(i, i + aliasTokens.length).join(' ')
    if (slice === normalizedAlias) return true
  }

  return false
}

export function resolveCapabilityAlias(phrase, {
  locale,
  aliasGroups = loadCapabilityAliases(),
} = {}) {
  const normalizedPhrase = normalizeCapabilityAlias(phrase)
  if (!normalizedPhrase) {
    return { status: 'unmapped', sourceText: phrase }
  }

  const rows = validateCapabilityAliasRegistry({ aliasGroups }).rows
  const localeFiltered = locale
    ? rows.filter(row => row.locale === locale || row.locale === 'und')
    : rows

  const matches = localeFiltered
    .filter(row => phraseContainsAlias(normalizedPhrase, row.normalizedAlias))
    .sort((a, b) => b.normalizedAlias.length - a.normalizedAlias.length)

  if (matches.length === 0) {
    return { status: 'unmapped', sourceText: phrase }
  }

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

export function auditCapabilityAliasCoverage({
  definitions = loadCapabilityDefinitions(),
  aliasGroups = loadCapabilityAliases(),
  highPriorityCapabilityKeys = HIGH_PRIORITY_CAPABILITY_KEYS,
} = {}) {
  const rows = flattenCapabilityAliases({ aliasGroups })
  const capabilityCoverage = definitions
    .map(definition => {
      const capabilityRows = rows.filter(row => row.capabilityKey === definition.key)
      const curated = capabilityRows.filter(row => !row.isAmbiguous)
      const ambiguous = capabilityRows.filter(row => row.isAmbiguous)
      const curatedAliasLocales = [...new Set(curated.map(row => row.locale))].sort()
      let coverageLevel = 'none'
      if (curated.length >= 6 || curatedAliasLocales.length >= 2) {
        coverageLevel = 'strong'
      } else if (curated.length > 0) {
        coverageLevel = 'basic'
      }

      return {
        capabilityKey: definition.key,
        coverageLevel,
        curatedAliasLocales,
        curatedAliasCount: curated.length,
        ambiguousAliasCount: ambiguous.length,
      }
    })
    .sort((a, b) => a.capabilityKey.localeCompare(b.capabilityKey))

  const locales = [...new Set(rows.map(row => row.locale))].sort()
  const localeCoverage = locales.map(locale => {
    const localeRows = rows.filter(row => row.locale === locale)
    return {
      locale,
      capabilityCountWithAliases: new Set(localeRows.map(row => row.capabilityKey)).size,
      totalCapabilityCount: definitions.length,
      ambiguousAliasCount: localeRows.filter(row => row.isAmbiguous).length,
    }
  })

  return {
    totalCapabilityCount: definitions.length,
    capabilityCoverage,
    localeCoverage,
    missingHighPriorityCapabilities: highPriorityCapabilityKeys
      .filter(capabilityKey => capabilityCoverage.find(item => item.capabilityKey === capabilityKey)?.coverageLevel === 'none'),
    ambiguousAliasCount: rows.filter(row => row.isAmbiguous).length,
    strongCapabilityCount: capabilityCoverage.filter(item => item.coverageLevel === 'strong').length,
    basicCapabilityCount: capabilityCoverage.filter(item => item.coverageLevel === 'basic').length,
    noCoverageCapabilityCount: capabilityCoverage.filter(item => item.coverageLevel === 'none').length,
  }
}

export function formatCapabilityAliasCoverageReport(report = auditCapabilityAliasCoverage()) {
  const lines = [
    '# R3.3 Capability Alias Coverage Report',
    '',
    'Ez a riport a canonical capability keyek alias lefedettseget mutatja.',
    '',
    '## Summary',
    '',
    `- Total capabilities: ${report.totalCapabilityCount}`,
    `- No coverage capabilities: ${report.noCoverageCapabilityCount}`,
    `- Basic coverage capabilities: ${report.basicCapabilityCount}`,
    `- Strong coverage capabilities: ${report.strongCapabilityCount}`,
    `- Ambiguous alias rows: ${report.ambiguousAliasCount}`,
    '',
    '## Locale Coverage',
    '',
    '| Locale | Capabilities with aliases | Total capabilities | Ambiguous aliases |',
    '| --- | ---: | ---: | ---: |',
    ...report.localeCoverage.map(item =>
      `| ${item.locale} | ${item.capabilityCountWithAliases} | ${item.totalCapabilityCount} | ${item.ambiguousAliasCount} |`,
    ),
    '',
    '## Missing High-Priority Coverage',
    '',
    ...(report.missingHighPriorityCapabilities.length
      ? report.missingHighPriorityCapabilities.map(capabilityKey => `- ${capabilityKey}`)
      : ['None.']),
    '',
    '## Capability Coverage',
    '',
    '| Capability key | Level | Locales | Curated aliases | Ambiguous aliases |',
    '| --- | --- | --- | ---: | ---: |',
    ...report.capabilityCoverage.map(item =>
      `| ${item.capabilityKey} | ${item.coverageLevel} | ${item.curatedAliasLocales.join(', ') || '-'} | ${item.curatedAliasCount} | ${item.ambiguousAliasCount} |`,
    ),
    '',
  ]

  return `${lines.join('\n')}\n`
}
