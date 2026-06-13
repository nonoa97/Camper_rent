import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  auditConversationStateGovernance,
  formatConversationStateGovernanceReport,
} from './conversation-state-governance-utils.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const defaultOutputPath = path.join(__dirname, '..', 'docs', 'reviews', 'R5.8-conversationstate-governance-report.md')

const shouldWrite = process.argv.includes('--write')
const report = auditConversationStateGovernance()
const formatted = formatConversationStateGovernanceReport(report)

if (shouldWrite) {
  fs.writeFileSync(defaultOutputPath, formatted)
} else {
  process.stdout.write(formatted)
}

if (!report.valid) {
  process.exitCode = 1
}
