import { describe, expect, it } from 'vitest'
import {
  getCapabilityDefinitions,
  getCapabilityKeySet,
  validateCapabilityDefinitions,
  type CapabilityDefinition,
} from '@/lib/chat/capabilities'

describe('capability registry', () => {
  it('loads a valid registry', () => {
    const definitions = getCapabilityDefinitions()
    const result = validateCapabilityDefinitions(definitions)

    expect(definitions).toHaveLength(6)
    expect(getCapabilityKeySet()).toEqual(
      new Set(['bike_transport', 'off_grid', 'pet_travel', 'remote_work', 'wild_camping', 'winter_use']),
    )
    expect(result).toEqual({ valid: true, errors: [] })
  })

  it('rejects unknown feature keys', () => {
    const definitions: CapabilityDefinition[] = [
      { key: 'off_grid', features: [{ featureKey: 'unknown_panel', weight: 3 }] },
    ]

    expect(validateCapabilityDefinitions(definitions).errors).toEqual([
      'Unknown feature key "unknown_panel" in capability "off_grid"',
    ])
  })

  it('rejects invalid weights', () => {
    const definitions = [
      { key: 'off_grid', features: [{ featureKey: 'solar_panel', weight: 4 }] },
    ] as unknown as CapabilityDefinition[]

    expect(validateCapabilityDefinitions(definitions).errors).toEqual([
      'Invalid weight "4" for "off_grid:solar_panel"',
    ])
  })

  it('rejects duplicate capability-feature links', () => {
    const definitions: CapabilityDefinition[] = [
      {
        key: 'remote_work',
        features: [
          { featureKey: 'wifi_router', weight: 3 },
          { featureKey: 'wifi_router', weight: 2 },
        ],
      },
    ]

    expect(validateCapabilityDefinitions(definitions).errors).toEqual([
      'Duplicate capability feature link: remote_work|wifi_router',
    ])
  })

  it('rejects empty capabilities', () => {
    const definitions: CapabilityDefinition[] = [
      { key: 'winter_use', features: [] },
    ]

    expect(validateCapabilityDefinitions(definitions).errors).toEqual([
      'Capability has no feature links: winter_use',
    ])
  })
})
