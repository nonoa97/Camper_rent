import {
  validateFeatureAliasRegistry,
} from './feature-alias-utils.mjs'
import {
  loadFeatureKeyMapping,
  validateFeatureKeyMapping,
} from './feature-key-utils.mjs'

const featureNameMapping = loadFeatureKeyMapping()
const keyValidation = validateFeatureKeyMapping(featureNameMapping)
const aliasValidation = validateFeatureAliasRegistry({ featureNameMapping })

if (!keyValidation.valid) {
  console.error('Feature key mapping is invalid:')
  for (const error of keyValidation.errors) console.error(`- ${error}`)
  process.exit(1)
}

if (!aliasValidation.valid) {
  console.error('Feature alias registry is invalid:')
  for (const error of aliasValidation.errors) console.error(`- ${error}`)
  process.exit(1)
}

console.log(`Feature alias registry validation passed for ${aliasValidation.rows.length} aliases.`)
