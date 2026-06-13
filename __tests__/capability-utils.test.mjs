import { describe, expect, it } from 'vitest'
import {
  loadCapabilityDefinitions,
  validateCapabilityDefinitions,
} from '../scripts/capability-utils.mjs'

describe('capability utility validation', () => {
  it('validates the checked-in capability registry', () => {
    const definitions = loadCapabilityDefinitions()

    expect(validateCapabilityDefinitions(definitions)).toEqual({ valid: true, errors: [] })
  })

  it('rejects duplicate links and invalid weights', () => {
    const result = validateCapabilityDefinitions([
      {
        key: 'off_grid',
        features: [
          { featureKey: 'solar_panel', weight: 3 },
          { featureKey: 'solar_panel', weight: 5 },
        ],
      },
    ])

    expect(result.valid).toBe(false)
    expect(result.errors).toEqual([
      'Duplicate capability feature link: off_grid|solar_panel',
      'Invalid weight "5" for "off_grid:solar_panel"',
    ])
  })
})
