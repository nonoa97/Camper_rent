import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '..')

export const DEFAULT_FILES = {
  route: path.join(repoRoot, 'app', 'api', 'chat', 'route.ts'),
  state: path.join(repoRoot, 'lib', 'chat', 'state.ts'),
  evaluation: path.join(repoRoot, 'lib', 'chat', 'evaluation.ts'),
  prompts: path.join(repoRoot, 'lib', 'chat', 'prompts.ts'),
  extractorPrompt: path.join(repoRoot, 'lib', 'chat', 'extractorPrompt.ts'),
  parser: path.join(repoRoot, 'lib', 'chat', 'extractorParser.ts'),
  extractorFallbacks: path.join(repoRoot, 'lib', 'chat', 'extractorFallbacks.ts'),
  legacyPreferenceBridge: path.join(repoRoot, 'lib', 'chat', 'legacyPreferenceBridge.ts'),
  recommendationPipeline: path.join(repoRoot, 'lib', 'chat', 'recommendationPipeline.ts'),
  availabilityMemory: path.join(repoRoot, 'lib', 'chat', 'availabilityMemory.ts'),
  availabilityOrchestration: path.join(repoRoot, 'lib', 'chat', 'availabilityOrchestration.ts'),
  stateLifecycle: path.join(repoRoot, 'lib', 'chat', 'stateLifecycle.ts'),
  flowPipeline: path.join(repoRoot, 'lib', 'chat', 'flowPipeline.ts'),
  preferenceContext: path.join(repoRoot, 'lib', 'chat', 'preferenceContext.ts'),
  memoryExplainability: path.join(repoRoot, 'lib', 'chat', 'memoryExplainability.ts'),
  sessionMemoryValidation: path.join(repoRoot, 'lib', 'chat', 'sessionMemoryValidation.ts'),
  stateDebugSnapshot: path.join(repoRoot, 'lib', 'chat', 'stateDebugSnapshot.ts'),
}

export const LEGACY_TERMS = [
  'extraRequirements',
  'softPreferences',
  'refinementPreference',
  'lastAvailabilitySlots',
  'lastComparedCamper',
  'applyLegacyRefinement',
  'legacy_fallback',
  'failed_fallback_used',
]

function readText(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function findTerms(source, terms = LEGACY_TERMS) {
  return terms.filter(term => source.includes(term))
}

function makeCheck(name, valid, details = []) {
  return { name, valid, details }
}

export function auditLegacyCompatibilityInventory(options = {}) {
  const files = options.files ?? DEFAULT_FILES
  const sources = options.sources ?? Object.fromEntries(
    Object.entries(files).map(([key, filePath]) => [key, readText(filePath)]),
  )

  const termByFile = Object.fromEntries(
    Object.entries(sources).map(([key, source]) => [key, findTerms(source)]),
  )

  const evaluationLegacyTerms = findTerms(sources.evaluation ?? '', [
    'extraRequirements',
    'softPreferences',
    'refinementPreference',
    'lastAvailabilitySlots',
    'lastComparedCamper',
    'applyLegacyRefinement',
    'legacy_fallback',
  ])

  const checks = [
    makeCheck(
      'evaluation_engine_has_no_legacy_preference_reads',
      evaluationLegacyTerms.length === 0,
      evaluationLegacyTerms,
    ),
    makeCheck(
      'legacy_preference_bridge_is_isolated',
      sources.legacyPreferenceBridge?.includes('applyLegacyRawPreferenceCanonicalBridge') &&
        sources.parser?.includes("from './legacyPreferenceBridge'") &&
        !sources.parser?.includes('resolveCapabilityAlias'),
      [],
    ),
    makeCheck(
      'legacy_refinement_fallback_is_explicit',
      sources.recommendationPipeline?.includes('applyLegacyRefinement') &&
        sources.recommendationPipeline?.includes("evaluationStatus: 'failed_fallback_used'"),
      [],
    ),
    makeCheck(
      'prompt_uses_single_structured_legacy_context',
      sources.prompts?.includes('legacyCompatibility is compatibility/context only and not a recommendation truth source') &&
        sources.prompts?.includes('legacyCompatibilityContext') &&
        !sources.prompts?.includes('legacyRefinementPreferenceContext') &&
        !sources.prompts?.includes('legacyHardRequirementsContext'),
      [],
    ),
    makeCheck(
      'legacy_memory_mirrors_are_explainable',
      sources.memoryExplainability?.includes('legacy_mirror_present') &&
        sources.stateDebugSnapshot?.includes('legacyCompatibility') &&
        sources.stateDebugSnapshot?.includes('lastAvailabilitySlots is a legacy mirror'),
      [],
    ),
    makeCheck(
      'canonical_refinement_intent_suppresses_legacy_mirror_write',
      sources.parser?.includes('legacyRefinementPreference') &&
        !sources.parser?.includes('update.refinementPreference = parsed.refinementPreference') &&
        !sources.extractorFallbacks?.includes('update.refinementPreference =') &&
        sources.stateLifecycle?.includes('stateUpdate.refinementPreference = undefined'),
      [],
    ),
    makeCheck(
      'flow_and_state_use_shared_preference_context',
      sources.preferenceContext?.includes('hasCanonicalPreferenceContext') &&
        sources.preferenceContext?.includes('hasLegacyRawPreferenceContext') &&
        sources.flowPipeline?.includes('hasPreferenceContext(state)') &&
        sources.stateLifecycle?.includes('hasPreferenceContext(update)'),
      [],
    ),
    makeCheck(
      'route_has_no_direct_legacy_raw_preference_branching',
      !sources.route?.includes('extraRequirements?.length') &&
        !sources.route?.includes('softPreferences?.length') &&
        sources.route?.includes('hasPreferenceContext(state)'),
      [],
    ),
    makeCheck(
      'availability_memory_new_snapshots_use_canonical_preferences',
      sources.availabilityMemory?.includes('const featurePreferences = normalizeFeaturePreferences(state.featurePreferences)') &&
        sources.availabilityMemory?.includes('const pricingPreference = normalizePricingPreference(state.pricingPreference)') &&
        sources.availabilityMemory?.includes('legacy_hard_requirements_added') &&
        !sources.availabilityMemory?.includes('criteria.extraRequirements = extraRequirements') &&
        !sources.availabilityMemory?.includes('criteria.softPreferences = softPreferences'),
      [],
    ),
    makeCheck(
      'extractor_prompt_uses_canonical_availability_options_context',
      sources.extractorPrompt?.includes('availabilityOptionsContext') &&
        sources.extractorPrompt?.includes('conversationMemory.mentionedAvailabilityOptions') &&
        !sources.extractorPrompt?.includes('legacyAvailabilitySlotsContext'),
      [],
    ),
    makeCheck(
      'session_memory_sanitizer_drops_deprecated_compared_mirror',
      sources.sessionMemoryValidation?.includes('last_compared_camper_deprecated') &&
        !sources.sessionMemoryValidation?.includes('memory.lastComparedCamper = input.lastComparedCamper'),
      [],
    ),
    makeCheck(
      'availability_orchestration_does_not_write_legacy_slot_mirror',
      sources.availabilityOrchestration?.includes('conversationMemory?.mentionedAvailabilityOptions ?? state.lastAvailabilitySlots') &&
        !sources.availabilityOrchestration?.includes('state.lastAvailabilitySlots ='),
      [],
    ),
    makeCheck(
      'extractor_prompt_does_not_request_legacy_refinement_preference',
      sources.extractorPrompt?.includes('"refinementIntent"') &&
        !sources.extractorPrompt?.includes('"refinementPreference"') &&
        sources.extractorPrompt?.includes('refinementIntent.intent = different'),
      [],
    ),
  ]

  const invalidChecks = checks.filter(check => !check.valid)

  return {
    valid: invalidChecks.length === 0,
    termByFile,
    checks,
    summary: {
      fileCount: Object.keys(files).length,
      legacyTermCount: LEGACY_TERMS.length,
      checkCount: checks.length,
      invalidCheckCount: invalidChecks.length,
    },
  }
}

export function formatLegacyCompatibilityInventoryReport(report = auditLegacyCompatibilityInventory()) {
  const lines = [
    '# D1 Legacy Compatibility Runtime Inventory',
    '',
    `Overall valid: ${report.valid ? 'yes' : 'no'}`,
    '',
    '## Summary',
    '',
    `- Files scanned: ${report.summary.fileCount}`,
    `- Legacy terms tracked: ${report.summary.legacyTermCount}`,
    `- Checks: ${report.summary.checkCount}`,
    `- Invalid checks: ${report.summary.invalidCheckCount}`,
    '',
    '## Runtime Term Map',
    '',
    '| File Key | Legacy Terms Present |',
    '| --- | --- |',
    ...Object.entries(report.termByFile).map(([key, terms]) => `| ${key} | ${terms.length ? terms.map(term => `\`${term}\``).join(', ') : '-' } |`),
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
