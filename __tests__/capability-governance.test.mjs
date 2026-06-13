import { describe, expect, it } from 'vitest'
import {
  auditCapabilityGovernance,
  validateAdminDoesNotExposeCapabilities,
  validateCapabilityDisplayNames,
  validateHardCapabilityThreshold,
} from '../scripts/capability-governance-utils.mjs'

describe('capability governance audit', () => {
  it('keeps the checked-in capability governance audit valid', () => {
    const report = auditCapabilityGovernance()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'capability_registry', valid: true }),
        expect.objectContaining({ name: 'capability_alias_registry', valid: true }),
        expect.objectContaining({ name: 'capability_alias_coverage', valid: true }),
        expect.objectContaining({ name: 'hard_capability_threshold_lock', valid: true }),
        expect.objectContaining({ name: 'capability_display_names', valid: true }),
        expect.objectContaining({ name: 'admin_capability_invisibility', valid: true }),
      ]),
    )
    expect(report.coverageSummary.missingHighPriorityCapabilities).toEqual([])
  })

  it('rejects hard capability threshold drift', () => {
    expect(validateHardCapabilityThreshold({
      evaluationSource: 'export const HARD_CAPABILITY_THRESHOLD = 0.7',
    })).toEqual({
      valid: false,
      errors: ['HARD_CAPABILITY_THRESHOLD must remain 0.8, got 0.7.'],
      expectedThreshold: 0.8,
    })
  })

  it('requires display names for every capability', () => {
    const result = validateCapabilityDisplayNames({
      definitions: [
        { key: 'off_grid', features: [{ featureKey: 'solar_panel', weight: 3 }] },
        { key: 'new_capability', features: [{ featureKey: 'solar_panel', weight: 1 }] },
      ],
      explainabilitySource: 'const CAPABILITY_DISPLAY_NAMES: Record<string, string> = { off_grid: "Off-grid" }\n\nexport function x() {}',
    })

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual(['Missing capability display name: new_capability'])
  })

  it('keeps capability management out of admin source', () => {
    const filePath = 'app/admin/page.tsx'
    const result = validateAdminDoesNotExposeCapabilities({
      adminSourcePaths: [filePath],
      sourceByPath: {
        [filePath]: 'export default function Admin() { return <div>Capability editor</div> }',
      },
    })

    expect(result).toEqual({
      valid: false,
      errors: ['Admin source references capability domain: app/admin/page.tsx'],
      checkedFileCount: 1,
    })
  })
})
