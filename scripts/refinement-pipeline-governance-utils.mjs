import fs from 'node:fs'
import path from 'node:path'

export const REFINEMENT_PIPELINE_GOVERNANCE_CHECKS = [
  'route_uses_refinement_pipeline_module',
  'route_has_no_local_apply_refinement_intent_delta',
  'route_has_no_local_legacy_apply_refinement',
  'canonical_delta_tests_present',
  'legacy_bridge_tests_present',
  'refinement_context_tests_present',
  'no_evaluation_import_in_refinement_pipeline',
  'no_prompt_import_in_refinement_pipeline',
]

function readFile(rootDir, relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8')
}

export function auditRefinementPipelineGovernance(rootDir = process.cwd()) {
  const route = readFile(rootDir, 'app/api/chat/route.ts')
  const pipeline = readFile(rootDir, 'lib/chat/refinementPipeline.ts')
  const pipelineTests = readFile(rootDir, '__tests__/chat/refinementPipeline.test.ts')
  const contextTests = readFile(rootDir, '__tests__/chat/refinementContext.test.ts')

  const checks = {
    route_uses_refinement_pipeline_module: route.includes('@/lib/chat/refinementPipeline'),
    route_has_no_local_apply_refinement_intent_delta: !route.includes('function applyRefinementIntentDelta'),
    route_has_no_local_legacy_apply_refinement: !route.includes('function applyRefinement(') && !route.includes('const BOUNDARY_NOTES'),
    canonical_delta_tests_present:
      pipelineTests.includes('applies cheaper refinement') &&
      pipelineTests.includes('applies bigger refinement') &&
      pipelineTests.includes('applies different refinement'),
    legacy_bridge_tests_present:
      pipelineTests.includes('converts legacy refinementPreference') &&
      pipelineTests.includes('legacy refinement fallback'),
    refinement_context_tests_present:
      contextTests.includes('rerunTriggered') &&
      contextTests.includes('rerunSkippedReason'),
    no_evaluation_import_in_refinement_pipeline:
      !pipeline.includes("from './evaluation") &&
      !pipeline.includes('@/lib/chat/evaluation'),
    no_prompt_import_in_refinement_pipeline:
      !pipeline.includes("from './prompts") &&
      !pipeline.includes('@/lib/chat/prompts'),
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
