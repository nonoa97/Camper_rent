import { describe, expect, it } from 'vitest'

import {
  auditLegacyCompatibilityInventory,
  formatLegacyCompatibilityInventoryReport,
} from '../scripts/legacy-compatibility-inventory-utils.mjs'

describe('legacy compatibility runtime inventory', () => {
  it('keeps legacy compatibility boundaries explicit', () => {
    const report = auditLegacyCompatibilityInventory()

    expect(report.valid).toBe(true)
    expect(report.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'evaluation_engine_has_no_legacy_preference_reads', valid: true }),
        expect.objectContaining({ name: 'legacy_preference_bridge_is_isolated', valid: true }),
        expect.objectContaining({ name: 'legacy_refinement_fallback_is_explicit', valid: true }),
        expect.objectContaining({ name: 'prompt_uses_single_structured_legacy_context', valid: true }),
        expect.objectContaining({ name: 'legacy_memory_mirrors_are_explainable', valid: true }),
        expect.objectContaining({ name: 'canonical_refinement_intent_suppresses_legacy_mirror_write', valid: true }),
        expect.objectContaining({ name: 'flow_and_state_use_shared_preference_context', valid: true }),
        expect.objectContaining({ name: 'route_has_no_direct_legacy_raw_preference_branching', valid: true }),
        expect.objectContaining({ name: 'availability_memory_new_snapshots_use_canonical_preferences', valid: true }),
        expect.objectContaining({ name: 'extractor_prompt_uses_canonical_availability_options_context', valid: true }),
        expect.objectContaining({ name: 'session_memory_sanitizer_drops_deprecated_compared_mirror', valid: true }),
        expect.objectContaining({ name: 'availability_orchestration_does_not_write_legacy_slot_mirror', valid: true }),
        expect.objectContaining({ name: 'extractor_prompt_does_not_request_legacy_refinement_preference', valid: true }),
      ]),
    )
  })

  it('surfaces legacy reads in the Evaluation Engine as invalid governance', () => {
    const report = auditLegacyCompatibilityInventory({
      sources: {
        ...Object.fromEntries(Object.keys(auditLegacyCompatibilityInventory().termByFile).map(key => [key, ''])),
        evaluation: 'state.extraRequirements state.softPreferences',
      },
    })

    expect(report.valid).toBe(false)
    expect(formatLegacyCompatibilityInventoryReport(report)).toContain('Overall valid: no')
  })
})
