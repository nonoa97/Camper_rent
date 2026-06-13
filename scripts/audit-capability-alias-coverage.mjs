import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  auditCapabilityAliasCoverage,
  formatCapabilityAliasCoverageReport,
} from './capability-alias-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultOutputPath = path.join(__dirname, '..', 'docs', 'reviews', 'R3.3-capability-alias-coverage-report.md')

const report = auditCapabilityAliasCoverage()
const markdown = formatCapabilityAliasCoverageReport(report)

fs.writeFileSync(defaultOutputPath, markdown, 'utf8')
console.log(`Capability alias coverage report written to ${defaultOutputPath}`)
