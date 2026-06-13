import { loadCapabilityDefinitions, validateCapabilityDefinitions } from './capability-utils.mjs'

const definitions = loadCapabilityDefinitions()
const result = validateCapabilityDefinitions(definitions)

if (!result.valid) {
  console.error('Capability registry validation failed:')
  for (const error of result.errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Capability registry valid (${definitions.length} capabilities).`)
