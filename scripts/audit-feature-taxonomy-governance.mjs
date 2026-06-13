#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  auditFeatureTaxonomyGovernance,
  formatFeatureTaxonomyGovernanceReport,
} from './taxonomy-governance-utils.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const defaultOutputPath = path.join(__dirname, '..', 'docs', 'reviews', 'R2.5-feature-taxonomy-governance-report.md')

const args = new Set(process.argv.slice(2))
const report = auditFeatureTaxonomyGovernance()
const markdown = formatFeatureTaxonomyGovernanceReport(report)

if (args.has('--json')) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
} else {
  process.stdout.write(markdown)
}

if (args.has('--write')) {
  fs.mkdirSync(path.dirname(defaultOutputPath), { recursive: true })
  fs.writeFileSync(defaultOutputPath, markdown, 'utf8')
}

if (!report.valid) {
  process.exitCode = 1
}

