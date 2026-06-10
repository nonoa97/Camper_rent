'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { CamperGearbox, CamperFuel, CamperType } from '@/lib/types'

// ── Auth guard ─────────────────────────────────────────────────
async function requireAdmin() {
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || user.app_metadata?.role !== 'admin') throw new Error('Unauthorized')
}

// ── Input validation ───────────────────────────────────────────
function validateCamperData(data: { name: string; slug: string }): string | null {
  if (!data.name?.trim()) return 'A név nem lehet üres.'
  if (!data.slug?.trim()) return 'A slug nem lehet üres.'
  if (!/^[a-z0-9-]+$/.test(data.slug)) return 'A slug csak kisbetűket, számokat és kötőjelet tartalmazhat.'
  return null
}

// ── Update price (peak season in camper_prices) ────────────────
export async function actionUpdatePrice(id: string, price: number): Promise<{ error: string | null }> {
  await requireAdmin()
  if (!Number.isFinite(price) || price < 0) return { error: 'Az ár nem lehet negatív.' }
  const { error } = await supabaseAdmin
    .from('camper_prices')
    .upsert({ camper_id: id, season_id: 'peak', price }, { onConflict: 'camper_id,season_id' })
  return { error: error?.message ?? null }
}

// ── Toggle available ───────────────────────────────────────────
export async function actionToggleAvailable(id: string, available: boolean): Promise<{ error: string | null }> {
  await requireAdmin()
  const { error } = await supabaseAdmin.from('campers').update({ available }).eq('id', id)
  return { error: error?.message ?? null }
}

// ── Save (update) camper ───────────────────────────────────────
export async function actionSaveCamper(
  id: string,
  data: {
    name: string
    slug: string
    description: string | null
    overview_title: string | null
    overview_body: string | null
    available: boolean
    year: number | null
    type: CamperType | null
    gearbox: CamperGearbox | null
    fuel_type: CamperFuel | null
    wild_camping_suitable: boolean | null
    beds: number | null
    feature_ids: number[]
  },
): Promise<{ error: string | null }> {
  await requireAdmin()

  const validationError = validateCamperData(data)
  if (validationError) return { error: validationError }

  const { feature_ids, ...fields } = data
  const { error } = await supabaseAdmin.from('campers').update(fields).eq('id', id)
  if (error) return { error: error.message }

  await supabaseAdmin.from('camper_features').delete().eq('camper_id', id)
  if (feature_ids.length > 0) {
    const { error: fe } = await supabaseAdmin
      .from('camper_features')
      .insert(feature_ids.map(fid => ({ camper_id: id, feature_id: fid })))
    if (fe) return { error: fe.message }
  }

  return { error: null }
}

// ── Create camper ──────────────────────────────────────────────
export async function actionCreateCamper(data: {
  name: string
  slug: string
  description: string | null
  overview_title: string | null
  overview_body: string | null
  available: boolean
  year: number | null
  type: CamperType | null
  gearbox: CamperGearbox | null
  fuel_type: CamperFuel | null
  wild_camping_suitable: boolean | null
  beds: number | null
  feature_ids: number[]
}): Promise<{ id: string | null; error: string | null }> {
  await requireAdmin()

  const validationError = validateCamperData(data)
  if (validationError) return { id: null, error: validationError }

  const { feature_ids, ...fields } = data
  const slug = fields.slug || fields.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')

  const { data: row, error } = await supabaseAdmin
    .from('campers')
    .insert({ ...fields, slug })
    .select('id')
    .single()

  if (error || !row) return { id: null, error: error?.message ?? 'Insert failed' }

  const newId = (row as any).id as string
  if (feature_ids.length > 0) {
    await supabaseAdmin
      .from('camper_features')
      .insert(feature_ids.map(fid => ({ camper_id: newId, feature_id: fid })))
  }

  return { id: newId, error: null }
}

// ── Delete camper ──────────────────────────────────────────────
export async function actionDeleteCamper(id: string): Promise<{ error: string | null }> {
  await requireAdmin()
  await supabaseAdmin.from('camper_features').delete().eq('camper_id', id)
  const { error } = await supabaseAdmin.from('campers').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ── Logout ─────────────────────────────────────────────────────
export async function actionLogout(): Promise<void> {
  const supabase = await createSupabaseServer()
  await supabase.auth.signOut()
  redirect('/admin/login')
}
