export interface DisplayFeature {
  key: string
  name: string
}

export const CATALOG_CARD_FEATURE_KEYS = [
  'shower',
  'cassette_wc',
  'gas_stove',
  'wifi_router',
  'cab_ac',
  'living_area_ac',
] as const

export function hasFeatureKey(features: DisplayFeature[], key: string): boolean {
  return features.some(feature => feature.key === key)
}

export function selectFeatureNamesByKeys(
  features: DisplayFeature[],
  keys: readonly string[],
  limit = 3,
): string[] {
  const keyOrder = new Map(keys.map((key, index) => [key, index]))

  return features
    .filter(feature => keyOrder.has(feature.key))
    .sort((a, b) => keyOrder.get(a.key)! - keyOrder.get(b.key)!)
    .map(feature => feature.name)
    .slice(0, limit)
}
