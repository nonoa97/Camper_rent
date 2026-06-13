import { describe, expect, it } from 'vitest'
import {
  auditReferenceResolverGovernance,
  REFERENCE_RESOLVER_GOVERNANCE_CHECKS,
} from '../scripts/reference-resolver-governance-utils.mjs'

describe('reference resolver governance', () => {
  it('keeps resolver contract boundaries intact', () => {
    const result = auditReferenceResolverGovernance(process.cwd())

    expect(Object.keys(result.checks).sort()).toEqual([...REFERENCE_RESOLVER_GOVERNANCE_CHECKS].sort())
    expect(result.invalidChecks).toEqual([])
    expect(result.valid).toBe(true)
  })
})
