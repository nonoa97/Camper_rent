#!/usr/bin/env node
import { auditReferenceResolverGovernance } from './reference-resolver-governance-utils.mjs'

const result = auditReferenceResolverGovernance(process.cwd())

console.log(JSON.stringify(result, null, 2))

if (!result.valid) {
  process.exitCode = 1
}
