import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { loadFeatureKeyMapping, validateFeatureKey } from './feature-key-utils.mjs'

export const CAPABILITY_KEY_PATTERN = /^[a-z0-9_]+$/

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
export const DEFAULT_CAPABILITY_PATH = path.join(__dirname, '..', 'lib', 'chat', 'taxonomy', 'capability-definitions.json')

export function loadCapabilityDefinitions(capabilityPath = DEFAULT_CAPABILITY_PATH) {
  const raw = fs.readFileSync(capabilityPath, 'utf8')
  const parsed = JSON.parse(raw)
  return Object.entries(parsed).map(([key, features]) => ({ key, features }))
}

export function validateCapabilityKey(key) {
  return typeof key === 'string' && key.length > 0 && CAPABILITY_KEY_PATTERN.test(key)
}

export function validateCapabilityDefinitions(definitions, featureMapping = loadFeatureKeyMapping()) {
  const errors = []
  const knownFeatureKeys = new Set(Object.values(featureMapping))
  const seenCapabilities = new Set()

  for (const definition of definitions) {
    if (!validateCapabilityKey(definition.key)) {
      errors.push(`Invalid capability key: ${JSON.stringify(definition.key)}`)
      continue
    }
    if (seenCapabilities.has(definition.key)) {
      errors.push(`Duplicate capability key: ${definition.key}`)
    }
    seenCapabilities.add(definition.key)

    if (!Array.isArray(definition.features) || definition.features.length === 0) {
      errors.push(`Capability has no feature links: ${definition.key}`)
      continue
    }

    const seenLinks = new Set()
    for (const feature of definition.features) {
      const featureKey = feature?.featureKey
      const linkKey = `${definition.key}|${featureKey}`
      if (seenLinks.has(linkKey)) {
        errors.push(`Duplicate capability feature link: ${linkKey}`)
      }
      seenLinks.add(linkKey)

      if (!validateFeatureKey(featureKey) || !knownFeatureKeys.has(featureKey)) {
        errors.push(`Unknown feature key "${featureKey}" in capability "${definition.key}"`)
      }
      if (![1, 2, 3].includes(feature?.weight)) {
        errors.push(`Invalid weight "${feature?.weight}" for "${definition.key}:${featureKey}"`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
