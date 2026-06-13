import { describe, expect, it } from 'vitest'
import {
  auditExplainabilityGovernance,
  validateExplainabilityIsNonDecisive,
  validateExplainabilityPresentationContract,
  validateExplainabilitySourceCoverage,
} from '../scripts/explainability-governance-utils.mjs'

describe('explainability governance audit', () => {
  it('keeps the checked-in explainability governance audit valid', () => {
    const report = auditExplainabilityGovernance()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'explainability_presentation_contract', valid: true }),
        expect.objectContaining({ name: 'explainability_non_decisive_boundary', valid: true }),
        expect.objectContaining({ name: 'explainability_source_coverage', valid: true }),
      ]),
    )
  })

  it('requires explicit non-decisive invariants in the presentation contract', () => {
    const result = validateExplainabilityPresentationContract({
      source: 'export interface ExplainabilityPresentationBundle {}',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Missing explainability presentation token: buildExplainabilityPresentationBundle',
        'Missing explainability presentation token: recommendationTruthSource',
        'Missing explainability presentation token: gptMayChooseCamper: false',
        'Missing explainability presentation token: memoryMayChooseCamper: false',
      ]),
    )
  })

  it('rejects decision or data-fetch logic in explainability presentation', () => {
    const result = validateExplainabilityIsNonDecisive({
      source: 'export function x() { evaluateCampers({}); supabase.from("campers") }',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Explainability presentation must not perform decision/data-fetch work: evaluateCampers(',
        'Explainability presentation must not perform decision/data-fetch work: supabase.',
        'Explainability presentation must not perform decision/data-fetch work: .from(',
      ]),
    )
  })

  it('requires source coverage across engine, feature, memory, and reference explainability', () => {
    const result = validateExplainabilitySourceCoverage({
      evaluationSource: '',
      featureSource: '',
      memorySource: '',
      referenceSource: '',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      'Missing Evaluation Engine explainability projection.',
      'Missing feature/capability recommendation explainability projection.',
      'Missing memory explainability snapshot.',
      'Missing reference resolver explainability projection.',
    ])
  })
})
