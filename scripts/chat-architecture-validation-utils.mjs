import { auditCapabilityAliasCoverage, validateCapabilityAliasRegistry } from './capability-alias-utils.mjs'
import { auditCapabilityGovernance } from './capability-governance-utils.mjs'
import { loadCapabilityDefinitions, validateCapabilityDefinitions } from './capability-utils.mjs'
import { auditConversationStateGovernance } from './conversation-state-governance-utils.mjs'
import { auditEvaluationEngineGovernance } from './evaluation-engine-governance-utils.mjs'
import { auditExtractorContractGovernance } from './extractor-contract-governance-utils.mjs'
import { auditExplainabilityGovernance } from './explainability-governance-utils.mjs'
import { auditFeatureAliasCoverage, validateFeatureAliasRegistry } from './feature-alias-utils.mjs'
import { loadFeatureKeyMapping, validateFeatureKeyMapping } from './feature-key-utils.mjs'
import { auditLegacyCompatibilityInventory } from './legacy-compatibility-inventory-utils.mjs'
import { auditReferenceResolverGovernance } from './reference-resolver-governance-utils.mjs'
import { auditRefinementPipelineGovernance } from './refinement-pipeline-governance-utils.mjs'
import { auditFeatureTaxonomyGovernance } from './taxonomy-governance-utils.mjs'

function resultFromValidation(name, result, extra = {}) {
  return {
    name,
    valid: result.valid,
    errors: result.errors ?? [],
    ...extra,
  }
}

function resultFromCoverage(name, report, missingKey) {
  const missing = report[missingKey] ?? []
  return {
    name,
    valid: missing.length === 0,
    errors: missing.map(key => `Missing high-priority alias coverage: ${key}`),
    ...report,
  }
}

function resultFromGovernance(name, report) {
  const invalidChecks = report.invalidChecks ?? []
  const checks = Array.isArray(report.checks)
    ? report.checks
    : Object.entries(report.checks ?? {}).map(([checkName, valid]) => ({
      name: checkName,
      valid,
      errors: [],
    }))
  const checkErrors = checks
    .filter(check => check.valid === false)
    .flatMap(check => (check.errors ?? []).map(error => `${check.name}: ${error}`))

  return {
    name,
    valid: report.valid,
    errors: [...invalidChecks.map(check => `Invalid check: ${check}`), ...checkErrors],
    report,
  }
}

export function buildChatArchitectureValidationReport() {
  const featureKeyMapping = loadFeatureKeyMapping()
  const capabilityDefinitions = loadCapabilityDefinitions()

  const checks = [
    resultFromValidation(
      'feature_key_mapping',
      validateFeatureKeyMapping(featureKeyMapping),
      { featureCount: Object.keys(featureKeyMapping).length },
    ),
    resultFromValidation(
      'feature_alias_registry',
      validateFeatureAliasRegistry({ featureNameMapping: featureKeyMapping }),
    ),
    resultFromCoverage(
      'feature_alias_coverage',
      auditFeatureAliasCoverage({ featureNameMapping: featureKeyMapping }),
      'missingHighPriorityFeatures',
    ),
    resultFromValidation(
      'capability_registry',
      validateCapabilityDefinitions(capabilityDefinitions, featureKeyMapping),
      { capabilityCount: capabilityDefinitions.length },
    ),
    resultFromValidation(
      'capability_alias_registry',
      validateCapabilityAliasRegistry({ definitions: capabilityDefinitions }),
    ),
    resultFromCoverage(
      'capability_alias_coverage',
      auditCapabilityAliasCoverage({ definitions: capabilityDefinitions }),
      'missingHighPriorityCapabilities',
    ),
    resultFromGovernance('feature_taxonomy_governance', auditFeatureTaxonomyGovernance({
      featureNameMapping: featureKeyMapping,
      capabilityDefinitions,
    })),
    resultFromGovernance('capability_governance', auditCapabilityGovernance({
      capabilityDefinitions,
    })),
    resultFromGovernance('extractor_contract_governance', auditExtractorContractGovernance()),
    resultFromGovernance('conversation_state_governance', auditConversationStateGovernance()),
    resultFromGovernance('reference_resolver_governance', auditReferenceResolverGovernance()),
    resultFromGovernance('refinement_pipeline_governance', auditRefinementPipelineGovernance()),
    resultFromGovernance('evaluation_engine_governance', auditEvaluationEngineGovernance()),
    resultFromGovernance('explainability_governance', auditExplainabilityGovernance()),
    resultFromGovernance('legacy_compatibility_governance', auditLegacyCompatibilityInventory()),
  ]

  return {
    valid: checks.every(check => check.valid),
    checkCount: checks.length,
    invalidChecks: checks.filter(check => !check.valid).map(check => check.name),
    checks,
  }
}

export function formatChatArchitectureValidationReport(report = buildChatArchitectureValidationReport()) {
  const lines = [
    '# Chat Architecture Validation',
    '',
    `Overall valid: ${report.valid ? 'yes' : 'no'}`,
    `Checks: ${report.checkCount}`,
    `Invalid checks: ${report.invalidChecks.length}`,
    '',
    '| Check | Valid | Errors |',
    '| --- | --- | --- |',
    ...report.checks.map(check => {
      const errors = check.errors?.length ? check.errors.join('<br>') : '-'
      return `| ${check.name} | ${check.valid ? 'yes' : 'no'} | ${errors} |`
    }),
    '',
  ]

  return `${lines.join('\n')}\n`
}
