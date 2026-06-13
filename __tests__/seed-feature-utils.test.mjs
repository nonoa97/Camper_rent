import { describe, expect, it } from 'vitest'
import {
  createCamperFeatureRows,
  createFeatureIdByKey,
} from '../scripts/seed-feature-utils.mjs'

describe('seed feature utilities', () => {
  it('maps canonical feature keys to current DB ids', () => {
    const featureIdByKey = createFeatureIdByKey([
      { id: 54, key: 'cassette_wc' },
      { id: 61, key: 'solar_panel' },
      { id: 55, key: 'shower' },
    ])

    expect(createCamperFeatureRows('camper-1', ['cassette_wc', 'solar_panel'], featureIdByKey)).toEqual({
      rows: [
        { camper_id: 'camper-1', feature_id: 54 },
        { camper_id: 'camper-1', feature_id: 61 },
      ],
      missingFeatureKeys: [],
    })
  })

  it('reports missing feature keys instead of relying on numeric ids', () => {
    const featureIdByKey = createFeatureIdByKey([{ id: 54, key: 'cassette_wc' }])

    expect(createCamperFeatureRows('camper-1', ['cassette_wc', 'solar_panel'], featureIdByKey)).toEqual({
      rows: [{ camper_id: 'camper-1', feature_id: 54 }],
      missingFeatureKeys: ['solar_panel'],
    })
  })
})
