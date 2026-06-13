import { createClient } from '@supabase/supabase-js'
import {
  loadFeatureKeyMapping,
  validateFeatureKeyMapping,
  validateFeatureRows,
} from './feature-key-utils.mjs'

const mapping = loadFeatureKeyMapping()
const mappingValidation = validateFeatureKeyMapping(mapping)

if (!mappingValidation.valid) {
  console.error('Feature key mapping is invalid:')
  for (const error of mappingValidation.errors) console.error(`- ${error}`)
  process.exit(1)
}

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing SUPABASE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: rows, error } = await supabase
  .from('features')
  .select('id, name, key')
  .order('name', { ascending: true })

if (error) {
  console.error(`Failed to load features: ${error.message}`)
  process.exit(1)
}

const validation = validateFeatureRows(rows ?? [])

if (!validation.valid) {
  console.error('Feature key validation failed:')
  for (const validationError of validation.errors) console.error(`- ${validationError}`)
  process.exit(1)
}

console.log(`Feature key validation passed for ${(rows ?? []).length} features.`)
