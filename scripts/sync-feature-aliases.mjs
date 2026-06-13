import { createClient } from '@supabase/supabase-js'
import {
  validateFeatureAliasRegistry,
} from './feature-alias-utils.mjs'
import {
  loadFeatureKeyMapping,
  validateFeatureKeyMapping,
} from './feature-key-utils.mjs'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')

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

const rows = aliasValidation.rows.map(row => ({
  feature_key: row.featureKey,
  alias: row.alias,
  normalized_alias: row.normalizedAlias,
  locale: row.locale,
  is_ambiguous: row.isAmbiguous,
}))

console.log(`Feature alias sync ${apply ? 'APPLY' : 'DRY RUN'}`)
console.log(`Aliases: ${rows.length}`)

if (!apply) {
  for (const row of rows.slice(0, 20)) {
    console.log(`Would upsert ${row.locale}:${row.normalized_alias} -> ${row.feature_key}${row.is_ambiguous ? ' (ambiguous)' : ''}`)
  }
  if (rows.length > 20) console.log(`...and ${rows.length - 20} more aliases.`)
  console.log('Dry run complete. Re-run with --apply to update Supabase.')
  process.exit(0)
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

const { error } = await supabase
  .from('feature_aliases')
  .upsert(rows, { onConflict: 'feature_key,locale,normalized_alias' })

if (error) {
  console.error(`Failed to sync feature aliases: ${error.message}`)
  process.exit(1)
}

console.log('Feature alias sync complete.')
