#!/usr/bin/env node
import {
  buildChatArchitectureValidationReport,
  formatChatArchitectureValidationReport,
} from './chat-architecture-validation-utils.mjs'

const args = new Set(process.argv.slice(2))
const report = buildChatArchitectureValidationReport()

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  process.stdout.write(formatChatArchitectureValidationReport(report))
}

if (!report.valid) {
  process.exitCode = 1
}
