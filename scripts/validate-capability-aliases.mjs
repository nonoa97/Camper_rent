import {
  loadCapabilityAliases,
  validateCapabilityAliasRegistry,
} from './capability-alias-utils.mjs'

const aliasGroups = loadCapabilityAliases()
const result = validateCapabilityAliasRegistry({ aliasGroups })

if (!result.valid) {
  console.error('Capability alias registry validation failed:')
  for (const error of result.errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log(`Capability alias registry validation passed for ${result.rows.length} aliases.`)
