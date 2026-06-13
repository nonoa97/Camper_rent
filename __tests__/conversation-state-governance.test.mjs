import { describe, expect, it } from 'vitest'
import {
  auditConversationStateGovernance,
  formatConversationStateGovernanceReport,
} from '../scripts/conversation-state-governance-utils.mjs'

describe('conversation state governance audit', () => {
  it('keeps the checked-in ConversationState governance audit valid', () => {
    const report = auditConversationStateGovernance()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'conversation_state_fields_documented', valid: true }),
        expect.objectContaining({ name: 'critical_ownership_categories', valid: true }),
        expect.objectContaining({ name: 'flow_state_fields_documented', valid: true }),
        expect.objectContaining({ name: 'state_memory_boundary_contract_present', valid: true }),
        expect.objectContaining({ name: 'state_explainability_contract_sections', valid: true }),
        expect.objectContaining({ name: 'legacy_deprecation_markers_present', valid: true }),
      ]),
    )
  })

  it('surfaces missing ownership documentation as invalid governance', () => {
    const report = auditConversationStateGovernance({
      ownershipDocSource: '',
    })

    expect(report.valid).toBe(false)
    expect(report.summary.invalidCheckCount).toBeGreaterThan(0)
    expect(formatConversationStateGovernanceReport(report)).toContain('Overall valid: no')
  })
})
