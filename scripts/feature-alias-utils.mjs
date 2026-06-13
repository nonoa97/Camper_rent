import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  DEFAULT_MAPPING_PATH,
  loadFeatureKeyMapping,
  validateFeatureKey,
} from './feature-key-utils.mjs'

export const LOCALE_PATTERN = /^[a-z]{2}(-[a-z0-9]+)*$/

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const DEFAULT_ALIAS_PATH = path.join(__dirname, '..', 'lib', 'chat', 'taxonomy', 'feature-aliases.json')
export const DEFAULT_ALIAS_GOVERNANCE_PATH = path.join(__dirname, '..', 'lib', 'chat', 'taxonomy', 'feature-alias-governance.json')

export const HIGH_PRIORITY_FEATURE_KEYS = [
  'cassette_wc',
  'shower',
  'solar_panel',
  'bike_rack',
  'refrigerator',
  'awning',
  'wifi_router',
  'living_area_ac',
  'cab_ac',
  'pet_friendly',
  'leisure_battery',
  'lithium_battery',
  'inverter',
  'freshwater_tank',
  'greywater_tank',
  'gas_cylinder',
  'diesel_heater',
  'parking_heater',
  'socket_230v',
  'external_socket_230v',
  'water_filter',
  'water_level_indicator',
  'usb_charger',
  'usb_c_charger',
]

export function normalizeFeatureAlias(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

export function loadFeatureAliases(aliasPath = DEFAULT_ALIAS_PATH) {
  const raw = fs.readFileSync(aliasPath, 'utf8')
  return JSON.parse(raw)
}

export function loadFeatureAliasGovernance(governancePath = DEFAULT_ALIAS_GOVERNANCE_PATH) {
  const raw = fs.readFileSync(governancePath, 'utf8')
  return JSON.parse(raw)
}

export function getKnownFeatureKeys(featureNameMapping = loadFeatureKeyMapping()) {
  return new Set(Object.values(featureNameMapping))
}

export function flattenFeatureAliases({
  featureNameMapping = loadFeatureKeyMapping(),
  aliasGroups = loadFeatureAliases(),
  includeFeatureNames = true,
} = {}) {
  const rows = []
  const seen = new Set()

  function addRow(row) {
    const identity = `${row.featureKey}\t${row.locale}\t${row.normalizedAlias}`
    if (seen.has(identity)) return
    seen.add(identity)
    rows.push(row)
  }

  if (includeFeatureNames) {
    for (const [alias, featureKey] of Object.entries(featureNameMapping)) {
      addRow({
        featureKey,
        alias,
        normalizedAlias: normalizeFeatureAlias(alias),
        locale: 'hu',
        isAmbiguous: false,
        source: 'feature_name',
      })
    }
  }

  for (const group of aliasGroups) {
    for (const alias of group.aliases ?? []) {
      addRow({
        featureKey: group.featureKey,
        alias,
        normalizedAlias: normalizeFeatureAlias(alias),
        locale: group.locale,
        isAmbiguous: false,
        source: 'alias',
      })
    }

    for (const alias of group.ambiguousAliases ?? []) {
      addRow({
        featureKey: group.featureKey,
        alias,
        normalizedAlias: normalizeFeatureAlias(alias),
        locale: group.locale,
        isAmbiguous: true,
        source: 'ambiguous_alias',
      })
    }
  }

  return rows
}

export function validateFeatureAliasRegistry({
  featureNameMapping = loadFeatureKeyMapping(),
  aliasGroups = loadFeatureAliases(),
  aliasGovernance = loadFeatureAliasGovernance(),
} = {}) {
  const errors = []
  const knownKeys = getKnownFeatureKeys(featureNameMapping)
  const rejectedAliases = Array.isArray(aliasGovernance?.rejectedAliases)
    ? aliasGovernance.rejectedAliases
    : []
  const rejectedByLocaleAndAlias = new Map()

  for (const [index, rejected] of rejectedAliases.entries()) {
    const label = `rejected alias ${index + 1}`
    const locale = rejected.locale
    if (!LOCALE_PATTERN.test(locale ?? '')) {
      errors.push(`${label} has invalid locale: ${JSON.stringify(locale)}`)
    }
    if (typeof rejected.phrase !== 'string' || rejected.phrase.trim() === '') {
      errors.push(`${label} contains an empty phrase.`)
      continue
    }
    const normalizedAlias = normalizeFeatureAlias(rejected.phrase)
    if (!normalizedAlias) {
      errors.push(`${label} has phrase with empty normalized form: ${JSON.stringify(rejected.phrase)}`)
      continue
    }
    rejectedByLocaleAndAlias.set(`${locale}\t${normalizedAlias}`, rejected)
  }

  for (const [index, group] of aliasGroups.entries()) {
    const label = `alias group ${index + 1}`
    if (!validateFeatureKey(group.featureKey)) {
      errors.push(`${label} has invalid featureKey: ${JSON.stringify(group.featureKey)}`)
    } else if (!knownKeys.has(group.featureKey)) {
      errors.push(`${label} points to unknown featureKey: ${group.featureKey}`)
    }

    if (!LOCALE_PATTERN.test(group.locale ?? '')) {
      errors.push(`${label} has invalid locale: ${JSON.stringify(group.locale)}`)
    }

    for (const alias of [...(group.aliases ?? []), ...(group.ambiguousAliases ?? [])]) {
      if (typeof alias !== 'string' || alias.trim() === '') {
        errors.push(`${label} contains an empty alias.`)
        continue
      }
      const normalizedAlias = normalizeFeatureAlias(alias)
      if (!normalizedAlias) {
        errors.push(`${label} has alias with empty normalized form: ${JSON.stringify(alias)}`)
        continue
      }
      const rejected = rejectedByLocaleAndAlias.get(`${group.locale}\t${normalizedAlias}`)
      if (rejected) {
        errors.push(`${label} uses rejected alias "${alias}" (${group.locale}) for ${group.featureKey}. Owner should be ${rejected.owner}: ${rejected.reason}`)
      }
    }
  }

  const rows = flattenFeatureAliases({ featureNameMapping, aliasGroups })
  const rowIdentity = new Map()
  const normalizedOwners = new Map()

  for (const row of rows) {
    const identity = `${row.featureKey}\t${row.locale}\t${row.normalizedAlias}`
    const duplicate = rowIdentity.get(identity)
    if (duplicate) {
      errors.push(`Duplicate alias for same feature: "${row.alias}" and "${duplicate.alias}" both normalize to "${row.normalizedAlias}" (${row.featureKey}, ${row.locale})`)
    } else {
      rowIdentity.set(identity, row)
    }

    const key = `${row.locale}\t${row.normalizedAlias}`
    const owners = normalizedOwners.get(key) ?? []
    owners.push(row)
    normalizedOwners.set(key, owners)
  }

  for (const [key, owners] of normalizedOwners.entries()) {
    const featureKeys = [...new Set(owners.map(row => row.featureKey))]
    if (featureKeys.length <= 1) continue

    const allExplicitlyAmbiguous = owners.every(row => row.isAmbiguous)
    if (!allExplicitlyAmbiguous) {
      const [locale, normalizedAlias] = key.split('\t')
      errors.push(`Ambiguous alias "${normalizedAlias}" in locale "${locale}" must be explicit. Candidates: ${featureKeys.join(', ')}`)
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

export function resolveFeatureAlias(phrase, {
  locale,
  featureNameMapping = loadFeatureKeyMapping(),
  aliasGroups = loadFeatureAliases(),
} = {}) {
  const normalizedPhrase = normalizeFeatureAlias(phrase)
  if (!normalizedPhrase) {
    return { status: 'unmapped', sourceText: phrase }
  }

  const rows = validateFeatureAliasRegistry({ featureNameMapping, aliasGroups }).rows
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

export function auditFeatureAliasCoverage({
  featureNameMapping = loadFeatureKeyMapping(),
  aliasGroups = loadFeatureAliases(),
  highPriorityFeatureKeys = HIGH_PRIORITY_FEATURE_KEYS,
} = {}) {
  const rowsWithFeatureNames = flattenFeatureAliases({ featureNameMapping, aliasGroups, includeFeatureNames: true })
  const curatedRows = flattenFeatureAliases({ featureNameMapping, aliasGroups, includeFeatureNames: false })
  const featureEntries = Object.entries(featureNameMapping)
    .map(([displayName, featureKey]) => ({ displayName, featureKey }))
    .sort((a, b) => a.featureKey.localeCompare(b.featureKey))

  const featureCoverage = featureEntries.map(({ displayName, featureKey }) => {
    const rows = rowsWithFeatureNames.filter(row => row.featureKey === featureKey)
    const curated = curatedRows.filter(row => row.featureKey === featureKey && !row.isAmbiguous)
    const ambiguous = curatedRows.filter(row => row.featureKey === featureKey && row.isAmbiguous)
    const curatedAliasLocales = [...new Set(curated.map(row => row.locale))].sort()
    const hasDisplayNameAlias = rows.some(row => row.source === 'feature_name')

    let coverageLevel = 'none'
    if (curated.length >= 6 || curatedAliasLocales.length >= 3) {
      coverageLevel = 'strong'
    } else if (curated.length > 0) {
      coverageLevel = 'basic'
    } else if (hasDisplayNameAlias) {
      coverageLevel = 'display_only'
    }

    return {
      featureKey,
      displayName,
      hasDisplayNameAlias,
      curatedAliasLocales,
      curatedAliasCount: curated.length,
      ambiguousAliasCount: ambiguous.length,
      coverageLevel,
    }
  })

  const locales = [...new Set(rowsWithFeatureNames.map(row => row.locale))].sort()
  const localeCoverage = locales.map(locale => {
    const localeRows = rowsWithFeatureNames.filter(row => row.locale === locale)
    const localeFeatureKeys = new Set(localeRows.map(row => row.featureKey))
    const strongFeatureKeys = new Set(
      featureCoverage
        .filter(item => item.coverageLevel === 'strong' && item.curatedAliasLocales.includes(locale))
        .map(item => item.featureKey),
    )
    return {
      locale,
      featureCountWithAliases: localeFeatureKeys.size,
      totalFeatureCount: featureEntries.length,
      strongFeatureCount: strongFeatureKeys.size,
      ambiguousAliasCount: localeRows.filter(row => row.isAmbiguous).length,
    }
  })

  const missingHighPriorityFeatures = highPriorityFeatureKeys
    .filter(featureKey => featureCoverage.find(item => item.featureKey === featureKey)?.coverageLevel === 'display_only')

  return {
    totalFeatureCount: featureEntries.length,
    featureCoverage,
    localeCoverage,
    missingHighPriorityFeatures,
    ambiguousAliasCount: curatedRows.filter(row => row.isAmbiguous).length,
    displayOnlyFeatureCount: featureCoverage.filter(item => item.coverageLevel === 'display_only').length,
    basicFeatureCount: featureCoverage.filter(item => item.coverageLevel === 'basic').length,
    strongFeatureCount: featureCoverage.filter(item => item.coverageLevel === 'strong').length,
  }
}

export function formatFeatureAliasCoverageReport(report = auditFeatureAliasCoverage()) {
  const lines = [
    '# R2.3 Feature Alias Coverage Report',
    '',
    'Ez a riport a canonical feature keyek alias lefedettségét mutatja.',
    '',
    '## Summary',
    '',
    `- Total canonical features: ${report.totalFeatureCount}`,
    `- Display-only features: ${report.displayOnlyFeatureCount}`,
    `- Basic coverage features: ${report.basicFeatureCount}`,
    `- Strong coverage features: ${report.strongFeatureCount}`,
    `- Ambiguous alias rows: ${report.ambiguousAliasCount}`,
    '',
    '## Locale Coverage',
    '',
    '| Locale | Features with aliases | Total features | Strong features | Ambiguous aliases |',
    '| --- | ---: | ---: | ---: | ---: |',
    ...report.localeCoverage.map(item =>
      `| ${item.locale} | ${item.featureCountWithAliases} | ${item.totalFeatureCount} | ${item.strongFeatureCount} | ${item.ambiguousAliasCount} |`,
    ),
    '',
    '## Missing High-Priority Curated Coverage',
    '',
    ...(report.missingHighPriorityFeatures.length
      ? report.missingHighPriorityFeatures.map(featureKey => `- ${featureKey}`)
      : ['None.']),
    '',
    '## Feature Coverage',
    '',
    '| Feature key | Display name | Level | Locales | Curated aliases | Ambiguous aliases |',
    '| --- | --- | --- | --- | ---: | ---: |',
    ...report.featureCoverage.map(item =>
      `| ${item.featureKey} | ${item.displayName} | ${item.coverageLevel} | ${item.curatedAliasLocales.join(', ') || '-'} | ${item.curatedAliasCount} | ${item.ambiguousAliasCount} |`,
    ),
    '',
  ]

  return `${lines.join('\n')}\n`
}
