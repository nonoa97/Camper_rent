export function createFeatureIdByKey(featureRows) {
  return new Map(
    (featureRows ?? [])
      .filter(row => typeof row?.key === 'string' && row.key.length > 0 && row.id != null)
      .map(row => [row.key, row.id]),
  )
}

export function createCamperFeatureRows(camperId, featureKeys, featureIdByKey) {
  const missingFeatureKeys = []
  const rows = []

  for (const key of featureKeys) {
    const featureId = featureIdByKey.get(key)
    if (!featureId) {
      missingFeatureKeys.push(key)
      continue
    }
    rows.push({ camper_id: camperId, feature_id: featureId })
  }

  return { rows, missingFeatureKeys }
}
