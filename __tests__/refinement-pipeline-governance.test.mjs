import { describe, expect, it } from 'vitest'
import {
  auditRefinementPipelineGovernance,
  REFINEMENT_PIPELINE_GOVERNANCE_CHECKS,
} from '../scripts/refinement-pipeline-governance-utils.mjs'

describe('refinement pipeline governance', () => {
  it('keeps refinement pipeline boundaries intact', () => {
    const result = auditRefinementPipelineGovernance(process.cwd())

    expect(Object.keys(result.checks).sort()).toEqual([...REFINEMENT_PIPELINE_GOVERNANCE_CHECKS].sort())
    expect(result.invalidChecks).toEqual([])
    expect(result.valid).toBe(true)
  })
})
