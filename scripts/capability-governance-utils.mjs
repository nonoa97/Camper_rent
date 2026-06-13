import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  loadCapabilityDefinitions,
  validateCapabilityDefinitions,
} from './capability-utils.mjs'
import {
  auditCapabilityAliasCoverage,
  loadCapabilityAliases,
  validateCapabilityAliasRegistry,
} from './capability-alias-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.join(__dirname, '..')

export const DEFAULT_EVALUATION_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluation.ts')
export const DEFAULT_EVALUATION_POLICY_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluationPolicy.ts')
export const DEFAULT_EXPLAINABILITY_PATH = path.join(repoRoot, 'lib', 'chat', 'featureExplainability.ts')
export const DEFAULT_ADMIN_SOURCE_PATHS = [
  path.join(repoRoot, 'app', 'admin', 'page.tsx'),
  path.join(repoRoot, 'app', 'admin', 'actions.ts'),
]

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function addCheck(checks, name, result, extra = {}) {
  checks.push({
    name,
    valid: result.valid,
    errors: result.errors,
    ...extra,
  })
}

export function validateHardCapabilityThreshold({
  evaluationSource = readIfExists(DEFAULT_EVALUATION_PATH),
  policySource,
  expectedThreshold = 0.8,
} = {}) {
  const errors = []
  const source = policySource || evaluationSource
  const match = source.match(/HARD_CAPABILITY_THRESHOLD\s*=\s*([0-9.]+)/)
  if (!match) {
    errors.push('Missing HARD_CAPABILITY_THRESHOLD constant.')
  } else if (Number(match[1]) !== expectedThreshold) {
    errors.push(`HARD_CAPABILITY_THRESHOLD must remain ${expectedThreshold}, got ${match[1]}.`)
  }
  return { valid: errors.length === 0, errors, expectedThreshold }
}

export function validateCapabilityDisplayNames({
  definitions = loadCapabilityDefinitions(),
  explainabilitySource = readIfExists(DEFAULT_EXPLAINABILITY_PATH),
} = {}) {
  const errors = []
  const displayNameBlockMatch = explainabilitySource.match(/CAPABILITY_DISPLAY_NAMES[^=]*=\s*\{([\s\S]*?)\}\s*(?:export|function)/)
  const block = displayNameBlockMatch?.[1] ?? ''
  const definedDisplayKeys = [...block.matchAll(/([a-z0-9_]+)\s*:/g)].map(match => match[1])
  const displayKeySet = new Set(definedDisplayKeys)

  for (const definition of definitions) {
    if (!displayKeySet.has(definition.key)) {
      errors.push(`Missing capability display name: ${definition.key}`)
    }
  }

  for (const key of displayKeySet) {
    if (!definitions.some(definition => definition.key === key)) {
      errors.push(`Display name for unknown capability: ${key}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    displayNameCount: definedDisplayKeys.length,
  }
}

export function validateAdminDoesNotExposeCapabilities({
  adminSourcePaths = DEFAULT_ADMIN_SOURCE_PATHS,
  sourceByPath,
} = {}) {
  const errors = []
  for (const filePath of adminSourcePaths) {
    const source = sourceByPath?.[filePath] ?? readIfExists(filePath)
    if (!source) continue
    if (/\bcapabilit(?:y|ies)\b/i.test(source)) {
      const displayPath = path.isAbsolute(filePath) ? path.relative(repoRoot, filePath) : filePath
      errors.push(`Admin source references capability domain: ${displayPath}`)
    }
  }
  return { valid: errors.length === 0, errors, checkedFileCount: adminSourcePaths.length }
}

export function auditCapabilityGovernance({
  definitions = loadCapabilityDefinitions(),
  aliasGroups = loadCapabilityAliases(),
  evaluationSource = readIfExists(DEFAULT_EVALUATION_PATH),
  policySource = readIfExists(DEFAULT_EVALUATION_POLICY_PATH),
  explainabilitySource = readIfExists(DEFAULT_EXPLAINABILITY_PATH),
  adminSourcePaths = DEFAULT_ADMIN_SOURCE_PATHS,
} = {}) {
  const checks = []

  const registryValidation = validateCapabilityDefinitions(definitions)
  addCheck(checks, 'capability_registry', registryValidation, {
    capabilityCount: definitions.length,
  })

  const aliasValidation = validateCapabilityAliasRegistry({ definitions, aliasGroups })
  addCheck(checks, 'capability_alias_registry', aliasValidation, {
    aliasCount: aliasValidation.rows.length,
  })

  const coverage = auditCapabilityAliasCoverage({ definitions, aliasGroups })
  const aliasCoverageValidation = {
    valid: coverage.missingHighPriorityCapabilities.length === 0 && coverage.noCoverageCapabilityCount === 0,
    errors: [
      ...coverage.missingHighPriorityCapabilities.map(key => `Missing high-priority capability alias coverage: ${key}`),
      ...(coverage.noCoverageCapabilityCount > 0
        ? [`Capabilities without alias coverage: ${coverage.noCoverageCapabilityCount}`]
        : []),
    ],
  }
  addCheck(checks, 'capability_alias_coverage', aliasCoverageValidation, {
    strongCapabilityCount: coverage.strongCapabilityCount,
    basicCapabilityCount: coverage.basicCapabilityCount,
    noCoverageCapabilityCount: coverage.noCoverageCapabilityCount,
  })

  addCheck(checks, 'hard_capability_threshold_lock', validateHardCapabilityThreshold({
    evaluationSource,
    policySource,
  }))

  addCheck(checks, 'capability_display_names', validateCapabilityDisplayNames({
    definitions,
    explainabilitySource,
  }))

  addCheck(checks, 'admin_capability_invisibility', validateAdminDoesNotExposeCapabilities({
    adminSourcePaths,
  }))

  return {
    valid: checks.every(check => check.valid),
    checks,
    coverageSummary: {
      totalCapabilityCount: coverage.totalCapabilityCount,
      strongCapabilityCount: coverage.strongCapabilityCount,
      basicCapabilityCount: coverage.basicCapabilityCount,
      noCoverageCapabilityCount: coverage.noCoverageCapabilityCount,
      ambiguousAliasCount: coverage.ambiguousAliasCount,
      missingHighPriorityCapabilities: coverage.missingHighPriorityCapabilities,
    },
  }
}

export function formatCapabilityGovernanceReport(report = auditCapabilityGovernance()) {
  const lines = [
    '# R3.8 Capability Governance Report',
    '',
    'Ez a riport a capability registry, alias coverage, threshold lock, display name es admin visibility guardrail allapotat mutatja.',
    '',
    '## Summary',
    '',
    `- Overall valid: ${report.valid ? 'yes' : 'no'}`,
    `- Total capabilities: ${report.coverageSummary.totalCapabilityCount}`,
    `- Strong alias coverage: ${report.coverageSummary.strongCapabilityCount}`,
    `- Basic alias coverage: ${report.coverageSummary.basicCapabilityCount}`,
    `- No alias coverage: ${report.coverageSummary.noCoverageCapabilityCount}`,
    `- Ambiguous alias rows: ${report.coverageSummary.ambiguousAliasCount}`,
    `- Missing high-priority alias coverage: ${report.coverageSummary.missingHighPriorityCapabilities.length}`,
    '',
    '## Checks',
    '',
    '| Check | Valid | Details | Errors |',
    '| --- | --- | --- | --- |',
    ...report.checks.map(check => {
      const details = Object.entries(check)
        .filter(([key]) => !['name', 'valid', 'errors'].includes(key))
        .map(([key, value]) => `${key}: ${value}`)
        .join('<br>')
      return `| ${check.name} | ${check.valid ? 'yes' : 'no'} | ${details || '-'} | ${check.errors.length ? check.errors.join('<br>') : '-' } |`
    }),
    '',
    '## Missing High-Priority Alias Coverage',
    '',
    ...(report.coverageSummary.missingHighPriorityCapabilities.length
      ? report.coverageSummary.missingHighPriorityCapabilities.map(key => `- ${key}`)
      : ['None.']),
    '',
  ]

  return `${lines.join('\n')}\n`
}
