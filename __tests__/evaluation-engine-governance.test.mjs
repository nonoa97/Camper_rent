import { describe, expect, it } from 'vitest'
import {
  auditEvaluationEngineGovernance,
  validateCanonicalFeatureMatching,
  validateEvaluationOwnershipBoundaries,
  validateEvaluationPolicyContract,
} from '../scripts/evaluation-engine-governance-utils.mjs'

describe('evaluation engine governance audit', () => {
  it('keeps the checked-in Evaluation Engine governance audit valid', () => {
    const report = auditEvaluationEngineGovernance()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'evaluation_truth_source', valid: true }),
        expect.objectContaining({ name: 'evaluation_ownership_boundaries', valid: true }),
        expect.objectContaining({ name: 'evaluation_policy_contract', valid: true }),
        expect.objectContaining({ name: 'canonical_feature_matching', valid: true }),
        expect.objectContaining({ name: 'evaluation_explainability_projection', valid: true }),
      ]),
    )
  })

  it('rejects capability threshold drift in evaluation policy', () => {
    expect(validateEvaluationPolicyContract({
      policySource: 'export const HARD_CAPABILITY_THRESHOLD = 0.7',
    })).toEqual({
      valid: false,
      errors: [
        'HARD_CAPABILITY_THRESHOLD must remain 0.8, got 0.7.',
        'Missing evaluation policy token: MAX_EVALUATION_BRANCHES',
        'Missing evaluation policy token: MIN_RENTAL_DAYS',
        'Missing evaluation policy token: MAX_SOFT_CAPABILITY_POINTS',
        'Missing evaluation policy token: EVALUATION_SCORE_POLICY',
        'Missing evaluation policy token: HARD_FAILURE_LABELS',
      ],
      expectedThreshold: 0.8,
    })
  })

  it('rejects orchestration/context imports inside the Evaluation Engine', () => {
    const result = validateEvaluationOwnershipBoundaries({
      evaluationSource: "import { assembleGptContext } from './contextAssembler'\nexport async function evaluateCampers() {}",
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      'Evaluation Engine must not import orchestration/context/memory module: ./contextAssembler',
    ])
  })

  it('requires canonical feature key matching instead of feature display name matching', () => {
    const result = validateCanonicalFeatureMatching({
      evaluationSource: 'const ok = camper.features.name.includes(preference.sourceText.toLowerCase())',
      scoringSource: '',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(
      expect.arrayContaining([
        'Evaluation Engine must match feature preferences by canonical feature key.',
        'Evaluation Engine must not use feature display name string matching for business decisions.',
      ]),
    )
  })
})
