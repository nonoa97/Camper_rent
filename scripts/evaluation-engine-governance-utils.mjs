import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.join(__dirname, '..')

export const DEFAULT_EVALUATION_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluation.ts')
export const DEFAULT_SCORING_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluationScoring.ts')
export const DEFAULT_POLICY_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluationPolicy.ts')
export const DEFAULT_EXPLAINABILITY_PATH = path.join(repoRoot, 'lib', 'chat', 'evaluationExplainability.ts')
export const DEFAULT_ROUTE_PATH = path.join(repoRoot, 'app', 'api', 'chat', 'route.ts')

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function addCheck(checks, name, valid, errors = [], extra = {}) {
  checks.push({ name, valid, errors, ...extra })
}

export function validateEvaluationTruthSource({
  evaluationSource = readIfExists(DEFAULT_EVALUATION_PATH),
  routeSource = readIfExists(DEFAULT_ROUTE_PATH),
} = {}) {
  const errors = []
  if (!/export\s+async\s+function\s+evaluateCampers/.test(evaluationSource)) {
    errors.push('evaluateCampers must remain the exported Evaluation Engine entrypoint.')
  }
  if (!/evaluateCampers/.test(routeSource)) {
    errors.push('Route must still call the Evaluation Engine entrypoint for recommendation mode.')
  }
  return { valid: errors.length === 0, errors }
}

export function validateEvaluationOwnershipBoundaries({
  evaluationSource = readIfExists(DEFAULT_EVALUATION_PATH),
} = {}) {
  const errors = []
  const forbiddenImports = [
    './prompts',
    './contextAssembler',
    './recommendationReference',
    './recommendationReferenceOrchestrator',
    './refinementPipeline',
    './memory',
    './sessionMemory',
  ]

  for (const importPath of forbiddenImports) {
    if (evaluationSource.includes(`from '${importPath}'`) || evaluationSource.includes(`from "${importPath}"`)) {
      errors.push(`Evaluation Engine must not import orchestration/context/memory module: ${importPath}`)
    }
  }

  return { valid: errors.length === 0, errors, forbiddenImportCount: forbiddenImports.length }
}

export function validateEvaluationPolicyContract({
  policySource = readIfExists(DEFAULT_POLICY_PATH),
  expectedThreshold = 0.8,
} = {}) {
  const errors = []
  const thresholdMatch = policySource.match(/HARD_CAPABILITY_THRESHOLD\s*=\s*([0-9.]+)/)
  if (!thresholdMatch) {
    errors.push('Missing HARD_CAPABILITY_THRESHOLD in evaluationPolicy.')
  } else if (Number(thresholdMatch[1]) !== expectedThreshold) {
    errors.push(`HARD_CAPABILITY_THRESHOLD must remain ${expectedThreshold}, got ${thresholdMatch[1]}.`)
  }

  const requiredPolicyTokens = [
    'MAX_EVALUATION_BRANCHES',
    'MIN_RENTAL_DAYS',
    'MAX_SOFT_CAPABILITY_POINTS',
    'EVALUATION_SCORE_POLICY',
    'HARD_FAILURE_LABELS',
  ]
  for (const token of requiredPolicyTokens) {
    if (!policySource.includes(token)) {
      errors.push(`Missing evaluation policy token: ${token}`)
    }
  }

  return { valid: errors.length === 0, errors, expectedThreshold }
}

export function validateCanonicalFeatureMatching({
  evaluationSource = readIfExists(DEFAULT_EVALUATION_PATH),
  scoringSource = readIfExists(DEFAULT_SCORING_PATH),
} = {}) {
  const errors = []
  const decisionSource = `${evaluationSource}\n${scoringSource}`
  if (!decisionSource.includes('camper.featureKeys.has(preference.key)')) {
    errors.push('Evaluation Engine must match feature preferences by canonical feature key.')
  }
  if (
    /features?\.name\s*\.\s*includes/i.test(decisionSource) ||
    /features?\.name\s*\.\s*toLowerCase/i.test(decisionSource) ||
    /feature\.name\s*\.\s*includes/i.test(decisionSource) ||
    /feature\.name\s*\.\s*toLowerCase/i.test(decisionSource)
  ) {
    errors.push('Evaluation Engine must not use feature display name string matching for business decisions.')
  }
  return { valid: errors.length === 0, errors }
}

export function validateEvaluationExplainabilityProjection({
  explainabilitySource = readIfExists(DEFAULT_EXPLAINABILITY_PATH),
} = {}) {
  const errors = []
  const requiredExports = [
    'explainCamperEvaluation',
    'buildEvaluationNoResultDiagnostics',
    "source: 'evaluation_engine'",
  ]
  for (const token of requiredExports) {
    if (!explainabilitySource.includes(token)) {
      errors.push(`Missing evaluation explainability token: ${token}`)
    }
  }
  return { valid: errors.length === 0, errors }
}

export function auditEvaluationEngineGovernance({
  evaluationSource = readIfExists(DEFAULT_EVALUATION_PATH),
  scoringSource = readIfExists(DEFAULT_SCORING_PATH),
  policySource = readIfExists(DEFAULT_POLICY_PATH),
  explainabilitySource = readIfExists(DEFAULT_EXPLAINABILITY_PATH),
  routeSource = readIfExists(DEFAULT_ROUTE_PATH),
} = {}) {
  const checks = []
  const truthSource = validateEvaluationTruthSource({ evaluationSource, routeSource })
  addCheck(checks, 'evaluation_truth_source', truthSource.valid, truthSource.errors)

  const ownership = validateEvaluationOwnershipBoundaries({ evaluationSource })
  addCheck(checks, 'evaluation_ownership_boundaries', ownership.valid, ownership.errors, {
    forbiddenImportCount: ownership.forbiddenImportCount,
  })

  const policy = validateEvaluationPolicyContract({ policySource })
  addCheck(checks, 'evaluation_policy_contract', policy.valid, policy.errors, {
    expectedThreshold: policy.expectedThreshold,
  })

  const featureMatching = validateCanonicalFeatureMatching({ evaluationSource, scoringSource })
  addCheck(checks, 'canonical_feature_matching', featureMatching.valid, featureMatching.errors)

  const explainability = validateEvaluationExplainabilityProjection({ explainabilitySource })
  addCheck(checks, 'evaluation_explainability_projection', explainability.valid, explainability.errors)

  return {
    valid: checks.every(check => check.valid),
    checks,
  }
}

export function formatEvaluationEngineGovernanceReport(report = auditEvaluationEngineGovernance()) {
  const lines = [
    '# R9 Evaluation Engine Governance Report',
    '',
    'Ez a riport az Evaluation Engine truth source, ownership boundary, policy contract, canonical feature matching es explainability projection guardrail allapotat mutatja.',
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
