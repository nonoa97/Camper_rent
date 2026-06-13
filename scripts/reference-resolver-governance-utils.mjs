import fs from 'node:fs'
import path from 'node:path'

export const REFERENCE_RESOLVER_GOVERNANCE_CHECKS = [
  'resolver_status_contract',
  'no_engine_import',
  'no_prompt_import',
  'no_context_assembler_import',
  'basic_reference_targets',
  'fact_reference_kinds',
  'no_guessing_tests_present',
  'interaction_event_tests_present',
]

const REQUIRED_STATUS_TOKENS = [
  "'resolved'",
  "'ambiguous'",
  "'not_found'",
]

const REQUIRED_BASIC_TARGETS = [
  "'lastRecommendation'",
  "'firstShownOption'",
  "'lastShownOption'",
]

const REQUIRED_FACT_KINDS = [
  "query.kind === 'feature'",
  "query.kind === 'attribute'",
  "query.kind === 'capability'",
]

function readFile(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

function hasAll(source, tokens) {
  return tokens.every(token => source.includes(token))
}

export function auditReferenceResolverGovernance(rootDir = process.cwd()) {
  const resolver = readFile(rootDir, 'lib/chat/recommendationReference.ts')
  const resolverTests = readFile(rootDir, '__tests__/chat/recommendationReference.test.ts')
  const eventTests = readFile(rootDir, '__tests__/chat/recommendationInteractionEvents.test.ts')

  const checks = {
    resolver_status_contract: hasAll(resolver, REQUIRED_STATUS_TOKENS),
    no_engine_import: !resolver.includes("from './evaluation") && !resolver.includes('@/lib/chat/evaluation'),
    no_prompt_import: !resolver.includes("from './prompts") && !resolver.includes('@/lib/chat/prompts'),
    no_context_assembler_import: !resolver.includes('contextAssembler'),
    basic_reference_targets: hasAll(resolver, REQUIRED_BASIC_TARGETS),
    fact_reference_kinds: hasAll(resolver, REQUIRED_FACT_KINDS) && resolver.includes('return resolvePriceReference'),
    no_guessing_tests_present:
      resolverTests.includes('returns ambiguous') &&
      resolverTests.includes('returns not_found') &&
      resolverTests.includes('does not choose recommendation'),
    interaction_event_tests_present:
      eventTests.includes('ambiguous') &&
      eventTests.includes('not_found') &&
      eventTests.includes('does not create'),
  }

  const invalidChecks = Object.entries(checks)
    .filter(([, valid]) => !valid)
    .map(([name]) => name)

  return {
    checks,
    invalidChecks,
    valid: invalidChecks.length === 0,
  }
}
