import { describe, expect, it } from 'vitest'
import {
  buildChatArchitectureValidationReport,
  formatChatArchitectureValidationReport,
} from '../scripts/chat-architecture-validation-utils.mjs'

describe('chat architecture validation aggregator', () => {
  it('keeps the checked-in architecture governance gates valid', () => {
    const report = buildChatArchitectureValidationReport()

    expect(report.valid).toBe(true)
    expect(report.invalidChecks).toEqual([])
  })

  it('includes the core governance areas in one CI-safe gate', () => {
    const report = buildChatArchitectureValidationReport()
    const checkNames = report.checks.map(check => check.name)

    expect(checkNames).toEqual(expect.arrayContaining([
      'feature_key_mapping',
      'feature_alias_registry',
      'feature_alias_coverage',
      'capability_registry',
      'capability_alias_registry',
      'capability_alias_coverage',
      'feature_taxonomy_governance',
      'capability_governance',
      'extractor_contract_governance',
      'conversation_state_governance',
      'reference_resolver_governance',
      'refinement_pipeline_governance',
      'evaluation_engine_governance',
      'explainability_governance',
      'legacy_compatibility_governance',
    ]))
  })

  it('formats a human-readable validation report', () => {
    const formatted = formatChatArchitectureValidationReport({
      valid: true,
      checkCount: 1,
      invalidChecks: [],
      checks: [{ name: 'example_check', valid: true, errors: [] }],
    })

    expect(formatted).toContain('# Chat Architecture Validation')
    expect(formatted).toContain('| example_check | yes | - |')
  })
})
