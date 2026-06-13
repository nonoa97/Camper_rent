import { describe, expect, it } from 'vitest'
import {
  auditExtractorContractGovernance,
  formatExtractorContractGovernanceReport,
} from '../scripts/extractor-contract-governance-utils.mjs'

describe('extractor contract governance audit', () => {
  it('keeps the checked-in extractor contract governance audit valid', () => {
    const report = auditExtractorContractGovernance()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'runtime_prompt_schema_fields', valid: true }),
        expect.objectContaining({ name: 'runtime_prompt_canonical_bucket_contract', valid: true }),
        expect.objectContaining({ name: 'runtime_prompt_boundary_contract', valid: true }),
        expect.objectContaining({ name: 'runtime_prompt_intent_reference_refinement_enums', valid: true }),
        expect.objectContaining({ name: 'state_type_contract_fields', valid: true }),
        expect.objectContaining({ name: 'reference_parser_guardrails', valid: true }),
        expect.objectContaining({ name: 'preference_validators_available', valid: true }),
        expect.objectContaining({ name: 'contract_doc_canonical_legacy_status', valid: true }),
      ]),
    )
  })

  it('surfaces prompt/schema drift as an invalid governance report', () => {
    const report = auditExtractorContractGovernance({
      extractStateSource: '',
      referenceParserSource: '',
      preferencesSource: '',
      stateSource: '',
      contractDocSource: '',
    })

    expect(report.valid).toBe(false)
    expect(report.summary.invalidCheckCount).toBeGreaterThan(0)
    expect(formatExtractorContractGovernanceReport(report)).toContain('Overall valid: no')
  })
})
