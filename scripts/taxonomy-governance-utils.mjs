import {
  loadFeatureKeyMapping,
  validateFeatureKeyMapping,
} from './feature-key-utils.mjs'
import {
  loadFeatureAliases,
  loadFeatureAliasGovernance,
  validateFeatureAliasRegistry,
  auditFeatureAliasCoverage,
} from './feature-alias-utils.mjs'
import {
  loadCapabilityDefinitions,
  validateCapabilityDefinitions,
} from './capability-utils.mjs'

export const DEFAULT_UI_FEATURE_KEYS = [
  'shower',
  'cassette_wc',
  'gas_stove',
  'wifi_router',
  'cab_ac',
  'living_area_ac',
]

export function validateUiFeatureKeys(
  uiFeatureKeys = DEFAULT_UI_FEATURE_KEYS,
  featureNameMapping = loadFeatureKeyMapping(),
) {
  const errors = []
  const knownFeatureKeys = new Set(Object.values(featureNameMapping))
  const seen = new Set()

  for (const key of uiFeatureKeys) {
    if (seen.has(key)) {
      errors.push(`Duplicate UI feature key: ${key}`)
    }
    seen.add(key)
    if (!knownFeatureKeys.has(key)) {
      errors.push(`Unknown UI feature key: ${key}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function auditFeatureTaxonomyGovernance({
  featureNameMapping = loadFeatureKeyMapping(),
  aliasGroups = loadFeatureAliases(),
  aliasGovernance = loadFeatureAliasGovernance(),
  capabilityDefinitions = loadCapabilityDefinitions(),
  uiFeatureKeys = DEFAULT_UI_FEATURE_KEYS,
} = {}) {
  const checks = []

  function addCheck(name, result, extra = {}) {
    checks.push({
      name,
      valid: result.valid,
      errors: result.errors,
      ...extra,
    })
  }

  const featureKeyValidation = validateFeatureKeyMapping(featureNameMapping)
  addCheck('feature_key_mapping', featureKeyValidation, {
    featureCount: Object.keys(featureNameMapping).length,
  })

  const aliasValidation = validateFeatureAliasRegistry({
    featureNameMapping,
    aliasGroups,
    aliasGovernance,
  })
  addCheck('feature_alias_registry', aliasValidation, {
    aliasCount: aliasValidation.rows.length,
  })

  const capabilityValidation = validateCapabilityDefinitions(capabilityDefinitions, featureNameMapping)
  addCheck('capability_registry', capabilityValidation, {
    capabilityCount: capabilityDefinitions.length,
  })

  const uiFeatureValidation = validateUiFeatureKeys(uiFeatureKeys, featureNameMapping)
  addCheck('ui_feature_keys', uiFeatureValidation, {
    uiFeatureKeyCount: uiFeatureKeys.length,
  })

  const coverage = auditFeatureAliasCoverage({
    featureNameMapping,
    aliasGroups,
  })

  return {
    valid: checks.every(check => check.valid),
    checks,
    coverageSummary: {
      totalFeatureCount: coverage.totalFeatureCount,
      displayOnlyFeatureCount: coverage.displayOnlyFeatureCount,
      basicFeatureCount: coverage.basicFeatureCount,
      strongFeatureCount: coverage.strongFeatureCount,
      ambiguousAliasCount: coverage.ambiguousAliasCount,
      missingHighPriorityFeatures: coverage.missingHighPriorityFeatures,
    },
  }
}

export function formatFeatureTaxonomyGovernanceReport(report = auditFeatureTaxonomyGovernance()) {
  const lines = [
    '# R2.5 Feature Taxonomy Governance Report',
    '',
    'Ez a riport a feature taxonomy fő registry és validációs rétegeinek állapotát mutatja.',
    '',
    '## Summary',
    '',
    `- Overall valid: ${report.valid ? 'yes' : 'no'}`,
    `- Total canonical features: ${report.coverageSummary.totalFeatureCount}`,
    `- Display-only alias coverage: ${report.coverageSummary.displayOnlyFeatureCount}`,
    `- Basic alias coverage: ${report.coverageSummary.basicFeatureCount}`,
    `- Strong alias coverage: ${report.coverageSummary.strongFeatureCount}`,
    `- Ambiguous alias rows: ${report.coverageSummary.ambiguousAliasCount}`,
    `- Missing high-priority alias coverage: ${report.coverageSummary.missingHighPriorityFeatures.length}`,
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
    ...(report.coverageSummary.missingHighPriorityFeatures.length
      ? report.coverageSummary.missingHighPriorityFeatures.map(key => `- ${key}`)
      : ['None.']),
    '',
  ]

  return `${lines.join('\n')}\n`
}

