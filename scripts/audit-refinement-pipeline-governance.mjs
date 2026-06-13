#!/usr/bin/env node
import { auditRefinementPipelineGovernance } from './refinement-pipeline-governance-utils.mjs'

const result = auditRefinementPipelineGovernance(process.cwd())

console.log(JSON.stringify(result, null, 2))

if (!result.valid) {
  process.exitCode = 1
}
