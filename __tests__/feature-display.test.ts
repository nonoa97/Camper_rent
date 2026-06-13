import { describe, expect, it } from 'vitest'
import {
  CATALOG_CARD_FEATURE_KEYS,
  hasFeatureKey,
  selectFeatureNamesByKeys,
  type DisplayFeature,
} from '@/lib/featureDisplay'

describe('feature display helpers', () => {
  it('checks features by canonical key, independent of display name', () => {
    const features: DisplayFeature[] = [
      { key: 'shower', name: 'Renamed shower display label' },
      { key: 'cassette_wc', name: 'Renamed toilet display label' },
    ]

    expect(hasFeatureKey(features, 'shower')).toBe(true)
    expect(hasFeatureKey(features, 'solar_panel')).toBe(false)
  })

  it('selects catalog highlight names by key while displaying current DB names', () => {
    const features: DisplayFeature[] = [
      { key: 'cassette_wc', name: 'Átnevezett WC címke' },
      { key: 'solar_panel', name: 'Átnevezett napelem címke' },
      { key: 'shower', name: 'Átnevezett zuhany címke' },
    ]

    expect(selectFeatureNamesByKeys(features, CATALOG_CARD_FEATURE_KEYS, 3)).toEqual([
      'Átnevezett zuhany címke',
      'Átnevezett WC címke',
    ])
  })
})
