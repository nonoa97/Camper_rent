import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

export const DEFAULT_STATE_SOURCE_PATH = path.join(repoRoot, 'lib', 'chat', 'state.ts')
export const DEFAULT_OWNERSHIP_DOC_PATH = path.join(repoRoot, 'docs', 'reviews', 'R5.2-state-ownership-matrix.md')
export const DEFAULT_STATE_MEMORY_DOC_PATH = path.join(repoRoot, 'docs', 'reviews', 'R5.5-state-memory-boundary.md')
export const DEFAULT_STATE_FLOW_DOC_PATH = path.join(repoRoot, 'docs', 'reviews', 'R5.6-state-flow-boundary.md')
export const DEFAULT_STATE_EXPLAINABILITY_DOC_PATH = path.join(repoRoot, 'docs', 'reviews', 'R5.7-state-explainability-contract.md')

const EXPECTED_OWNERSHIP = {
  featurePreferences: 'canonical_preference',
  attributePreferences: 'canonical_preference',
  capabilityPreferences: 'canonical_preference',
  pricingPreference: 'canonical_preference',
  extraRequirements: 'compatibility_bridge',
  softPreferences: 'compatibility_bridge',
  refinementPreference: 'compatibility_bridge',
  conversationMemory: 'prompt_context_mirror',
  lastAvailabilitySlots: 'legacy_mirror',
  lastAskedField: 'flow_helper',
  pendingAvailabilityAction: 'flow_helper',
  pendingAvailabilityConfirmation: 'flow_helper',
  alreadyRecommendedSlugs: 'current_focus',
  lastShownCamperSlug: 'current_focus',
  lastShownPrice: 'current_focus',
}

const EXPECTED_FLOW_FIELDS = [
  'activeFlow',
  'activeStep',
  'pendingQuestionField',
  'pendingQuestionText',
  'lastSideTopic',
  'canResumePreviousFlow',
]

const EXPECTED_DEBUG_SECTIONS = [
  'currentTripCriteria',
  'canonicalPreferences',
  'legacyCompatibility',
  'currentFocus',
  'flowCompatibility',
  'ephemeralSignals',
  'memoryBoundary',
  'engineInput',
  'warnings',
]

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8')
}

function extractInterfaceBody(source, interfaceName) {
  const marker = `export interface ${interfaceName}`
  const start = source.indexOf(marker)
  if (start === -1) return ''
  const open = source.indexOf('{', start)
  if (open === -1) return ''

  let depth = 0
  for (let i = open; i < source.length; i += 1) {
    const char = source[i]
    if (char === '{') depth += 1
    if (char === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, i)
    }
  }
  return ''
}

export function extractTopLevelInterfaceFields(source, interfaceName) {
  const body = extractInterfaceBody(source, interfaceName)
  if (!body) return []
  return body
    .split(/\r?\n/)
    .map(line => {
      const match = line.match(/^ {2}([A-Za-z_][A-Za-z0-9_]*)\??:/)
      return match?.[1]
    })
    .filter(Boolean)
}

export function extractOwnershipRows(ownershipDocSource) {
  const rows = new Map()
  for (const line of ownershipDocSource.split(/\r?\n/)) {
    const match = line.match(/^\| `([^`]+)` \| `([^`]+)`/)
    if (match) rows.set(match[1], match[2])
  }
  return rows
}

function makeCheck(name, valid, details = []) {
  return {
    name,
    valid,
    details,
  }
}

export function auditConversationStateGovernance(options = {}) {
  const stateSource = options.stateSource ?? readText(DEFAULT_STATE_SOURCE_PATH)
  const ownershipDocSource = options.ownershipDocSource ?? readText(DEFAULT_OWNERSHIP_DOC_PATH)
  const stateMemoryDocSource = options.stateMemoryDocSource ?? readText(DEFAULT_STATE_MEMORY_DOC_PATH)
  const stateFlowDocSource = options.stateFlowDocSource ?? readText(DEFAULT_STATE_FLOW_DOC_PATH)
  const stateExplainabilityDocSource = options.stateExplainabilityDocSource ?? readText(DEFAULT_STATE_EXPLAINABILITY_DOC_PATH)

  const stateFields = extractTopLevelInterfaceFields(stateSource, 'ConversationState')
  const flowFields = extractTopLevelInterfaceFields(stateSource, 'FlowState')
  const ownershipRows = extractOwnershipRows(ownershipDocSource)

  const undocumentedStateFields = stateFields.filter(field => !ownershipRows.has(field))
  const ownershipMismatches = Object.entries(EXPECTED_OWNERSHIP)
    .filter(([field, expectedCategory]) => {
      const category = ownershipRows.get(field)
      return !category || !category.includes(expectedCategory)
    })
    .map(([field, expectedCategory]) => `${field}: expected category containing ${expectedCategory}, found ${ownershipRows.get(field) ?? 'missing'}`)

  const missingFlowDocs = EXPECTED_FLOW_FIELDS.filter(field => !stateFlowDocSource.includes(`FlowState.${field}`) && !stateFlowDocSource.includes(`\`${field}\``))
  const missingDebugSections = EXPECTED_DEBUG_SECTIONS.filter(section => !stateExplainabilityDocSource.includes(section))

  const checks = [
    makeCheck(
      'conversation_state_fields_documented',
      undocumentedStateFields.length === 0,
      undocumentedStateFields,
    ),
    makeCheck(
      'critical_ownership_categories',
      ownershipMismatches.length === 0,
      ownershipMismatches,
    ),
    makeCheck(
      'flow_state_fields_documented',
      missingFlowDocs.length === 0 && EXPECTED_FLOW_FIELDS.every(field => flowFields.includes(field)),
      missingFlowDocs,
    ),
    makeCheck(
      'state_memory_boundary_contract_present',
      [
        'SessionMemory nem recommendation truth source',
        'conversationMemory',
        'lastAvailabilitySlots',
        'alreadyRecommendedSlugs',
        'shownOptions',
        'memoryEvents',
      ].every(fragment => stateMemoryDocSource.includes(fragment)),
      [],
    ),
    makeCheck(
      'state_explainability_contract_sections',
      missingDebugSections.length === 0,
      missingDebugSections,
    ),
    makeCheck(
      'legacy_deprecation_markers_present',
      stateSource.includes('@deprecated Legacy ephemeral refinement bridge') &&
        stateSource.includes('Do not use as primary recommendation truth source'),
      [],
    ),
  ]

  const invalidChecks = checks.filter(check => !check.valid)

  return {
    valid: invalidChecks.length === 0,
    summary: {
      stateFieldCount: stateFields.length,
      flowFieldCount: flowFields.length,
      ownershipRowCount: ownershipRows.size,
      checkCount: checks.length,
      invalidCheckCount: invalidChecks.length,
    },
    checks,
  }
}

export function formatConversationStateGovernanceReport(report) {
  const lines = [
    '# R5.8 ConversationState Governance Report',
    '',
    `Overall valid: ${report.valid ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- ConversationState fields: ${report.summary.stateFieldCount}`,
    `- FlowState fields: ${report.summary.flowFieldCount}`,
    `- Ownership rows: ${report.summary.ownershipRowCount}`,
    `- Checks: ${report.summary.checkCount}`,
    `- Invalid checks: ${report.summary.invalidCheckCount}`,
    '',
    '## Checks',
    '',
  ]

  for (const check of report.checks) {
    lines.push(`### ${check.name}`)
    lines.push('')
    lines.push(`Valid: ${check.valid ? 'yes' : 'no'}`)
    if (check.details.length) {
      lines.push('')
      lines.push('Details:')
      for (const detail of check.details) lines.push(`- ${detail}`)
    }
    lines.push('')
  }

  return `${lines.join('\n').trim()}\n`
}
