import { createClient } from '@supabase/supabase-js'
import {
  createFeatureKeyBackfillPlan,
  loadFeatureKeyMapping,
  validateFeatureKeyMapping,
  validateFeatureRows,
} from './feature-key-utils.mjs'

const args = new Set(process.argv.slice(2))
const apply = args.has('--apply')
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

const plan = createFeatureKeyBackfillPlan(rows ?? [], mapping)

if (plan.conflicts.length > 0) {
  console.error('Feature key backfill has conflicts:')
  for (const conflict of plan.conflicts) console.error(`- ${conflict}`)
  process.exit(1)
}

console.log(`Feature key backfill ${apply ? 'APPLY' : 'DRY RUN'}`)
console.log(`Updates: ${plan.updates.length}`)
console.log(`Already keyed: ${plan.skipped.length}`)
console.log(`Missing from mapping: ${plan.missing.length}`)

if (plan.missing.length > 0) {
  console.log('\nMissing mapping entries:')
  for (const row of plan.missing) console.log(`- ${row.name} (${row.id})`)
  console.error('\nBackfill refused to continue. Add these names to lib/chat/taxonomy/canonical-feature-keys.json first.')
  process.exit(1)
}

for (const update of plan.updates) {
  console.log(`${apply ? 'Updating' : 'Would update'} ${update.name} (${update.id}) -> ${update.key}`)

  if (!apply) continue

  const { error: updateError } = await supabase
    .from('features')
    .update({ key: update.key })
    .eq('id', update.id)

  if (updateError) {
    console.error(`Failed to update "${update.name}" (${update.id}): ${updateError.message}`)
    process.exit(1)
  }
}

if (apply) {
  const { data: finalRows, error: finalError } = await supabase
    .from('features')
    .select('id, name, key')
    .order('name', { ascending: true })

  if (finalError) {
    console.error(`Failed to validate final feature keys: ${finalError.message}`)
    process.exit(1)
  }

  const finalValidation = validateFeatureRows(finalRows ?? [])
  if (!finalValidation.valid) {
    console.error('Backfill finished, but validation failed:')
    for (const validationError of finalValidation.errors) console.error(`- ${validationError}`)
    process.exit(1)
  }
}

console.log(apply ? 'Feature key backfill complete.' : 'Dry run complete. Re-run with --apply to update Supabase.')
