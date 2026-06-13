import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.join(__dirname, '..')

export const DEFAULT_PRESENTATION_PATH = path.join(repoRoot, 'lib', 'chat', 'explainabilityPresentation.ts')
export const DEFAULT_EVALUATION_EXPLAINABILITY_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluationExplainability.ts')
export const DEFAULT_FEATURE_EXPLAINABILITY_PATH = path.join(repoRoot, 'lib', 'chat', 'featureExplainability.ts')
export const DEFAULT_MEMORY_EXPLAINABILITY_PATH = path.join(repoRoot, 'lib', 'chat', 'memoryExplainability.ts')
export const DEFAULT_REFERENCE_EXPLAINABILITY_PATH = path.join(repoRoot, 'lib', 'chat', 'recommendationReferenceExplainability.ts')

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function addCheck(checks, name, valid, errors = [], extra = {}) {
  checks.push({ name, valid, errors, ...extra })
}

export function validateExplainabilityPresentationContract({
  source = readIfExists(DEFAULT_PRESENTATION_PATH),
} = {}) {
  const errors = []
  const requiredTokens = [
    'ExplainabilityPresentationBundle',
    'buildExplainabilityPresentationBundle',
    'recommendationTruthSource',
    "gptMayChooseCamper: false",
    "memoryMayChooseCamper: false",
  ]
  for (const token of requiredTokens) {
    if (!source.includes(token)) {
      errors.push(`Missing explainability presentation token: ${token}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function validateExplainabilityIsNonDecisive({
  source = readIfExists(DEFAULT_PRESENTATION_PATH),
} = {}) {
  const errors = []
  const forbiddenTokens = [
    'evaluateCampers(',
    'supabase.',
    '.from(',
    'buildBackendSelectedRecommendations(',
    'searchAvailableCampers(',
  ]
  for (const token of forbiddenTokens) {
    if (source.includes(token)) {
      errors.push(`Explainability presentation must not perform decision/data-fetch work: ${token}`)
    }
  }
  return { valid: errors.length === 0, errors, forbiddenTokenCount: forbiddenTokens.length }
}

export function validateExplainabilitySourceCoverage({
  evaluationSource = readIfExists(DEFAULT_EVALUATION_EXPLAINABILITY_PATH),
  featureSource = readIfExists(DEFAULT_FEATURE_EXPLAINABILITY_PATH),
  memorySource = readIfExists(DEFAULT_MEMORY_EXPLAINABILITY_PATH),
  referenceSource = readIfExists(DEFAULT_REFERENCE_EXPLAINABILITY_PATH),
} = {}) {
  const errors = []
  if (!evaluationSource.includes('explainCamperEvaluation')) {
    errors.push('Missing Evaluation Engine explainability projection.')
  }
  if (!featureSource.includes('createRecommendationExplainability')) {
    errors.push('Missing feature/capability recommendation explainability projection.')
  }
  if (!memorySource.includes('buildMemoryExplainabilitySnapshot')) {
    errors.push('Missing memory explainability snapshot.')
  }
  if (!referenceSource.includes('explainRecommendationReferenceResult')) {
    errors.push('Missing reference resolver explainability projection.')
  }
  return { valid: errors.length === 0, errors }
}

export function auditExplainabilityGovernance({
  presentationSource = readIfExists(DEFAULT_PRESENTATION_PATH),
  evaluationSource = readIfExists(DEFAULT_EVALUATION_EXPLAINABILITY_PATH),
  featureSource = readIfExists(DEFAULT_FEATURE_EXPLAINABILITY_PATH),
  memorySource = readIfExists(DEFAULT_MEMORY_EXPLAINABILITY_PATH),
  referenceSource = readIfExists(DEFAULT_REFERENCE_EXPLAINABILITY_PATH),
} = {}) {
  const checks = []

  const contract = validateExplainabilityPresentationContract({ source: presentationSource })
  addCheck(checks, 'explainability_presentation_contract', contract.valid, contract.errors)

  const nonDecisive = validateExplainabilityIsNonDecisive({ source: presentationSource })
  addCheck(checks, 'explainability_non_decisive_boundary', nonDecisive.valid, nonDecisive.errors, {
    forbiddenTokenCount: nonDecisive.forbiddenTokenCount,
  })

  const coverage = validateExplainabilitySourceCoverage({
    evaluationSource,
    featureSource,
    memorySource,
    referenceSource,
  })
  addCheck(checks, 'explainability_source_coverage', coverage.valid, coverage.errors)

  return {
    valid: checks.every(check => check.valid),
    checks,
  }
}

export function formatExplainabilityGovernanceReport(report = auditExplainabilityGovernance()) {
  const lines = [
    '# R10 Explainability Governance Report',
    '',
    'Ez a riport az explainability presentation contract, non-decisive boundary es source coverage guardrail allapotat mutatja.',
    '',
    '## Summary',
    '',
    `- Overall valid: ${report.valid ? 'yes' : 'no'}`,
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
      return `| ${check.name} | ${check.valid ? 'yes' : 'no'} | ${details || '-'} | ${check.errors.length ? check.errors.join('<br>') : '-'} |`
    }),
    '',
  ]

  return `${lines.join('\n')}\n`
}
