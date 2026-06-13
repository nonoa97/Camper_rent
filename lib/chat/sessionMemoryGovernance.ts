import type { ConversationState, SessionMemory } from './state'
import {
  buildMemoryExplainabilitySnapshot,
  MemoryExplainabilitySnapshot,
  MemoryExplainabilityWarning,
} from './memoryExplainability'
import { validateAndSanitizeSessionMemory } from './sessionMemoryValidation'

export type SessionMemoryGovernanceSeverity = 'info' | 'warning'

export interface SessionMemoryGovernanceFinding {
  code: MemoryExplainabilityWarning | 'invalid_session_memory_input'
  severity: SessionMemoryGovernanceSeverity
  layer: 'SessionMemory' | 'ConversationState'
  message: string
}

export interface SessionMemoryGovernanceReport {
  isValid: boolean
  sanitizedMemory: SessionMemory
  validationWarnings: string[]
  explainability: MemoryExplainabilitySnapshot
  findings: SessionMemoryGovernanceFinding[]
}

const WARNING_MESSAGES: Record<MemoryExplainabilityWarning, { layer: 'SessionMemory' | 'ConversationState'; message: string }> = {
  session_memory_missing: {
    layer: 'SessionMemory',
    message: 'No incoming SessionMemory was provided; backend treats this as empty objective history.',
  },
  schema_version_missing: {
    layer: 'SessionMemory',
    message: 'SessionMemory has no schemaVersion; accepted for backwards compatibility.',
  },
  schema_version_unknown: {
    layer: 'SessionMemory',
    message: 'SessionMemory schemaVersion is unknown; unsupported version should not become a runtime truth source.',
  },
  availability_criteria_missing: {
    layer: 'SessionMemory',
    message: 'Availability memory exists without criteria snapshot; compatibility may be needs_recheck.',
  },
  recommendation_criteria_missing: {
    layer: 'SessionMemory',
    message: 'Recommendation memory exists without criteria snapshot; compatibility may be needs_recheck.',
  },
  legacy_mirror_present: {
    layer: 'ConversationState',
    message: 'Legacy/current-focus mirror fields are present; they must remain context only, not stable memory.',
  },
  deprecated_field_present: {
    layer: 'SessionMemory',
    message: 'Deprecated memory field is present; canonical objective history is memoryEvents.',
  },
  memory_event_limit_reached: {
    layer: 'SessionMemory',
    message: 'Memory event history reached its limit; oldest events may be trimmed by append/sanitize helpers.',
  },
  shown_options_limit_reached: {
    layer: 'SessionMemory',
    message: 'Shown option history reached its limit; oldest options may be trimmed by snapshot/sanitize helpers.',
  },
  stale_availability_present: {
    layer: 'SessionMemory',
    message: 'Stale availability history is present; it is useful for explanation only, not current availability decisions.',
  },
  recommendation_needs_recheck: {
    layer: 'SessionMemory',
    message: 'Recommendation memory differs from current state enough to require recheck before current decision use.',
  },
  availability_needs_recheck: {
    layer: 'SessionMemory',
    message: 'Availability memory differs from current state enough to require recheck before current decision use.',
  },
}

function severityForWarning(warning: MemoryExplainabilityWarning): SessionMemoryGovernanceSeverity {
  return warning === 'schema_version_missing' ||
    warning === 'session_memory_missing' ||
    warning === 'legacy_mirror_present'
    ? 'info'
    : 'warning'
}

export function auditSessionMemoryGovernance(
  input: unknown,
  state: ConversationState = {},
): SessionMemoryGovernanceReport {
  const validation = validateAndSanitizeSessionMemory(input)
  const explainability = buildMemoryExplainabilitySnapshot(validation.memory, state)

  const findings: SessionMemoryGovernanceFinding[] = [
    ...validation.warnings.map((warning): SessionMemoryGovernanceFinding => ({
      code: 'invalid_session_memory_input',
      severity: 'warning',
      layer: 'SessionMemory',
      message: `Incoming SessionMemory required sanitize warning: ${warning}.`,
    })),
    ...explainability.warnings.map((warning): SessionMemoryGovernanceFinding => {
      const contract = WARNING_MESSAGES[warning]
      return {
        code: warning,
        severity: severityForWarning(warning),
        layer: contract.layer,
        message: contract.message,
      }
    }),
  ]

  return {
    isValid: validation.warnings.length === 0,
    sanitizedMemory: validation.memory,
    validationWarnings: validation.warnings,
    explainability,
    findings,
  }
}
