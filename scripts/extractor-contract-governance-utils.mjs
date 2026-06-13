import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.join(__dirname, '..')

export const DEFAULT_EXTRACT_STATE_PATH = path.join(repoRoot, 'lib', 'chat', 'extractState.ts')
export const DEFAULT_EXTRACTOR_PROMPT_PATH = path.join(repoRoot, 'lib', 'chat', 'extractorPrompt.ts')
export const DEFAULT_REFERENCE_PARSER_PATH = path.join(repoRoot, 'lib', 'chat', 'extractorReferenceParsing.ts')
export const DEFAULT_PREFERENCES_PATH = path.join(repoRoot, 'lib', 'chat', 'preferences.ts')
export const DEFAULT_STATE_PATH = path.join(repoRoot, 'lib', 'chat', 'state.ts')
export const DEFAULT_CONTRACT_DOC_PATH = path.join(repoRoot, 'docs', 'reviews', 'R4.2-extractor-contract.md')

function readIfExists(filePath) {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
}

function validateContains(source, tokens, label) {
  const missing = tokens.filter(token => !source.includes(token))
  return {
    valid: missing.length === 0,
    errors: missing.map(token => `${label} is missing contract token: ${token}`),
    tokenCount: tokens.length,
  }
}

function addCheck(checks, name, result, extra = {}) {
  checks.push({
    name,
    valid: result.valid,
    errors: result.errors,
    ...extra,
  })
}

export function auditExtractorContractGovernance({
  extractStateSource = readIfExists(DEFAULT_EXTRACT_STATE_PATH),
  extractorPromptSource = readIfExists(DEFAULT_EXTRACTOR_PROMPT_PATH),
  referenceParserSource = readIfExists(DEFAULT_REFERENCE_PARSER_PATH),
  preferencesSource = readIfExists(DEFAULT_PREFERENCES_PATH),
  stateSource = readIfExists(DEFAULT_STATE_PATH),
  contractDocSource = readIfExists(DEFAULT_CONTRACT_DOC_PATH),
} = {}) {
  const checks = []

  addCheck(checks, 'runtime_prompt_schema_fields', validateContains(extractorPromptSource, [
    '"intent"',
    '"featurePreferences"',
    '"attributePreferences"',
    '"capabilityPreferences"',
    '"pricingPreference"',
    '"unmappedPreferences"',
    '"ambiguousPreferences"',
    '"refinementIntent"',
    '"referenceTarget"',
    '"recommendationReference"',
    '"recommendationInteraction"',
    '"memoryNotes"',
    '"skipCurrentField"',
    '"positiveAcknowledgement"',
    '"availabilityQuestion"',
    '"flexibleCriteria"',
  ], 'extractorPrompt prompt schema'))

  addCheck(checks, 'runtime_prompt_canonical_bucket_contract', validateContains(extractorPromptSource, [
    'Use canonical preference fields first.',
    'Legacy raw fields may mirror text',
    'not the primary structured truth source',
    'Concrete equipment or onboard amenity',
    'Objective camper field',
    'Usage goal or capability',
    'Do not force every user need into featurePreferences.',
    'Do not use featurePreferences for camper attributes, capabilities, or pricing.',
  ], 'extractorPrompt prompt canonical bucket contract'))

  addCheck(checks, 'runtime_prompt_boundary_contract', validateContains(extractorPromptSource, [
    'automatic transmission / automata váltó / gearbox',
    'wild camping usage goal',
    'never campingType, never featurePreferences',
    'off-grid usage goal',
    'never featurePreferences',
    'Price/budget/refinement',
    'recommendationInteraction instead',
  ], 'extractorPrompt prompt boundary contract'))

  addCheck(checks, 'runtime_prompt_intent_reference_refinement_enums', validateContains(extractorPromptSource, [
    '"recommendation"',
    '"availability"',
    '"faq"',
    '"booking"',
    '"catalog"',
    '"previousAvailability"',
    '"lastAvailability"',
    '"lastRecommendation"',
    '"firstShownOption"',
    '"lastShownOption"',
    '"cheaper"',
    '"more_expensive"',
    '"bigger"',
    '"smaller"',
    '"different"',
    '"similar"',
    '"keep_current"',
    '"prefer_previous"',
    '"remove_constraint"',
    '"add_constraint"',
  ], 'extractorPrompt prompt enum contract'))

  addCheck(checks, 'state_type_contract_fields', validateContains(stateSource, [
    'export type RefinementIntentType',
    'export type RecommendationReferenceHint',
    'export interface RecommendationInteractionSignal',
    'export type MemoryNoteType',
    'featurePreferences?: FeaturePreference[]',
    'attributePreferences?: AttributePreference[]',
    'capabilityPreferences?: CapabilityPreference[]',
    'pricingPreference?: PricingPreference',
    'recommendationReference?: RecommendationReferenceHint',
    'recommendationInteraction?: RecommendationInteractionSignal',
    'refinementIntent?: RefinementIntent',
  ], 'ConversationState type contract'))

  addCheck(checks, 'reference_parser_guardrails', validateContains(referenceParserSource, [
    'parseRecommendationReferenceHint',
    'parseRecommendationInteractionSignal',
    'isKnownFeatureKey',
    'isKnownCapabilityKey',
    'hasPrimaryTarget',
    'hasSecondaryTarget',
    'selected',
    'dismissed',
    'compared',
    'cheapest',
    'most_expensive',
    'eq',
    'max',
    'min',
  ], 'extractor reference parser guardrails'))

  addCheck(checks, 'preference_validators_available', validateContains(preferencesSource, [
    'validateFeaturePreferences',
    'validateAttributePreferences',
    'validateCapabilityPreferences',
    'validatePricingPreference',
    'validateUnmappedPreferences',
    'validateAmbiguousPreferences',
    'cheaper',
    'budget_limit',
    'best_value',
    'premium_ok',
    'avoid_extra_cost',
  ], 'preference validator contract'))

  addCheck(checks, 'contract_doc_canonical_legacy_status', validateContains(contractDocSource, [
    '`featurePreferences` | canonical',
    '`attributePreferences` | canonical',
    '`capabilityPreferences` | canonical',
    '`pricingPreference` | canonical',
    '`extraRequirements` | legacy compatibility',
    '`softPreferences` | legacy compatibility',
    '`refinementPreference` | legacy bridge',
    'The extractor must not:',
    'R4.8 should add drift governance.',
  ], 'R4.2 extractor contract doc'))

  return {
    valid: checks.every(check => check.valid),
    checks,
    summary: {
      checkCount: checks.length,
      invalidCheckCount: checks.filter(check => !check.valid).length,
    },
  }
}

export function formatExtractorContractGovernanceReport(report = auditExtractorContractGovernance()) {
  const lines = [
    '# R4.8 Extractor Contract Governance Report',
    '',
    'Ez a riport azt ellenorzi, hogy az extractor runtime prompt, TypeScript state contract, reference parser, preference validatorok es R4.2 contract dokumentacio nem csusztak-e szet egymastol.',
    '',
    '## Summary',
    '',
    `- Overall valid: ${report.valid ? 'yes' : 'no'}`,
    `- Checks: ${report.summary.checkCount}`,
    `- Invalid checks: ${report.summary.invalidCheckCount}`,
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
    '## Governance Meaning',
    '',
    '- This audit is a drift guard, not runtime behavior.',
    '- It fails when important extractor contract tokens disappear from prompt, schema, parser, validators or docs.',
    '- It does not prove semantic completeness; it catches accidental contract erosion early.',
    '',
  ]

  return `${lines.join('\n')}\n`
}
