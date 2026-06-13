import featureNameMapping from './taxonomy/canonical-feature-keys.json'
import capabilityDefinitions from './taxonomy/capability-definitions.json'

export type CapabilityWeight = 1 | 2 | 3

export interface CapabilityFeatureDefinition {
  featureKey: string
  weight: CapabilityWeight
}

export interface CapabilityDefinition {
  key: string
  features: CapabilityFeatureDefinition[]
}

export interface CapabilityRegistryValidation {
  valid: boolean
  errors: string[]
}

export interface CapabilityMatchResult {
  capabilityKey: string
  score: number
  matchedWeight: number
  totalWeight: number
  matchedFeatures: string[]
  missingFeatures: string[]
}

const KEY_PATTERN = /^[a-z0-9_]+$/
const KNOWN_FEATURE_KEYS = new Set(Object.values(featureNameMapping))

export function isValidCapabilityKey(key: unknown): key is string {
  return typeof key === 'string' && KEY_PATTERN.test(key)
}

export function isKnownCapabilityKey(key: unknown): key is string {
  return isValidCapabilityKey(key) && getCapabilityKeySet().has(key)
}

export function getCapabilityDefinitions(): CapabilityDefinition[] {
  return Object.entries(capabilityDefinitions).map(([key, features]) => ({
    key,
    features: features.map(feature => ({
      featureKey: feature.featureKey,
      weight: feature.weight as CapabilityWeight,
    })),
  }))
}

export function getCapabilityDefinition(key: string): CapabilityDefinition | undefined {
  return getCapabilityDefinitions().find(definition => definition.key === key)
}

export function getCapabilityKeySet(): Set<string> {
  return new Set(Object.keys(capabilityDefinitions))
}

export function calculateCapabilityMatch(
  camperFeatureKeys: Iterable<string>,
  definition: CapabilityDefinition,
): CapabilityMatchResult {
  const camperFeatures = new Set(camperFeatureKeys)
  const matchedFeatures: string[] = []
  const missingFeatures: string[] = []
  let matchedWeight = 0
  let totalWeight = 0

  for (const feature of definition.features) {
    totalWeight += feature.weight
    if (camperFeatures.has(feature.featureKey)) {
      matchedFeatures.push(feature.featureKey)
      matchedWeight += feature.weight
    } else {
      missingFeatures.push(feature.featureKey)
    }
  }

  return {
    capabilityKey: definition.key,
    score: totalWeight > 0 ? matchedWeight / totalWeight : 0,
    matchedWeight,
    totalWeight,
    matchedFeatures,
    missingFeatures,
  }
}

export function validateCapabilityDefinitions(
  definitions: CapabilityDefinition[] = getCapabilityDefinitions(),
): CapabilityRegistryValidation {
  const errors: string[] = []
  const seenCapabilities = new Set<string>()

  for (const definition of definitions) {
    if (!isValidCapabilityKey(definition.key)) {
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

    const seenFeatureLinks = new Set<string>()
    for (const feature of definition.features) {
      const linkKey = `${definition.key}|${feature.featureKey}`
      if (seenFeatureLinks.has(linkKey)) {
        errors.push(`Duplicate capability feature link: ${linkKey}`)
      }
      seenFeatureLinks.add(linkKey)

      if (!KNOWN_FEATURE_KEYS.has(feature.featureKey)) {
        errors.push(`Unknown feature key "${feature.featureKey}" in capability "${definition.key}"`)
      }
      if (![1, 2, 3].includes(feature.weight)) {
        errors.push(`Invalid weight "${feature.weight}" for "${definition.key}:${feature.featureKey}"`)
      }
    }
  }

  return { valid: errors.length === 0, errors }
}
