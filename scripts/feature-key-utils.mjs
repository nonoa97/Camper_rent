import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

export const FEATURE_KEY_PATTERN = /^[a-z0-9_]+$/

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const DEFAULT_MAPPING_PATH = path.join(__dirname, '..', 'lib', 'chat', 'taxonomy', 'canonical-feature-keys.json')

export function loadFeatureKeyMapping(mappingPath = DEFAULT_MAPPING_PATH) {
  const raw = fs.readFileSync(mappingPath, 'utf8')
  return JSON.parse(raw)
}

export function validateFeatureKey(key) {
  return typeof key === 'string' && key.length > 0 && FEATURE_KEY_PATTERN.test(key)
}

export function validateFeatureKeyMapping(mapping) {
  const errors = []
  const keyOwners = new Map()

  for (const [name, key] of Object.entries(mapping)) {
    if (!name.trim()) {
      errors.push('Mapping contains an empty feature name.')
    }
    if (!validateFeatureKey(key)) {
      errors.push(`Invalid key for "${name}": ${JSON.stringify(key)}`)
      continue
    }

    const owners = keyOwners.get(key) ?? []
    owners.push(name)
    keyOwners.set(key, owners)
  }

  return { valid: errors.length === 0, errors }
}

export function validateFeatureRows(rows) {
  const errors = []
  const keyOwners = new Map()

  for (const row of rows) {
    const label = `${row.name ?? '(unnamed)'} (${row.id})`
    if (row.key == null || row.key === '') {
      errors.push(`Missing key: ${label}`)
      continue
    }
    if (!validateFeatureKey(row.key)) {
      errors.push(`Invalid key "${row.key}": ${label}`)
      continue
    }

    const owners = keyOwners.get(row.key) ?? []
    owners.push(label)
    keyOwners.set(row.key, owners)
  }

  for (const [key, owners] of keyOwners.entries()) {
    if (owners.length > 1) {
      errors.push(`Duplicate key "${key}": ${owners.join(', ')}`)
    }
  }

  return { valid: errors.length === 0, errors }
}

export function createFeatureKeyBackfillPlan(rows, mapping) {
  const updates = []
  const skipped = []
  const missing = []
  const conflicts = []
  const seenNames = new Map()
  const finalKeyOwners = new Map()

  for (const row of rows) {
    const nameOwners = seenNames.get(row.name) ?? []
    nameOwners.push(row.id)
    seenNames.set(row.name, nameOwners)
  }

  for (const [name, ids] of seenNames.entries()) {
    if (ids.length > 1) {
      conflicts.push(`Duplicate feature name "${name}" appears on ids: ${ids.join(', ')}`)
    }
  }

  for (const row of rows) {
    const mappedKey = mapping[row.name]
    if (row.key) {
      if (!validateFeatureKey(row.key)) {
        conflicts.push(`Existing invalid key "${row.key}" on "${row.name}" (${row.id})`)
      } else if (mappedKey && mappedKey !== row.key) {
        conflicts.push(`Existing key "${row.key}" differs from mapping "${mappedKey}" on "${row.name}" (${row.id})`)
      } else {
        skipped.push({ id: row.id, name: row.name, key: row.key, reason: 'already_keyed' })
        const owners = finalKeyOwners.get(row.key) ?? []
        owners.push(`${row.name} (${row.id})`)
        finalKeyOwners.set(row.key, owners)
      }
      continue
    }

    if (!mappedKey) {
      missing.push({ id: row.id, name: row.name })
      continue
    }

    if (!validateFeatureKey(mappedKey)) {
      conflicts.push(`Mapping for "${row.name}" has invalid key "${mappedKey}"`)
      continue
    }

    updates.push({ id: row.id, name: row.name, key: mappedKey })
    const owners = finalKeyOwners.get(mappedKey) ?? []
    owners.push(`${row.name} (${row.id})`)
    finalKeyOwners.set(mappedKey, owners)
  }

  for (const [key, owners] of finalKeyOwners.entries()) {
    if (owners.length > 1) {
      conflicts.push(`Backfill would create duplicate key "${key}": ${owners.join(', ')}`)
    }
  }

  return { updates, skipped, missing, conflicts }
}
