import { supabase } from '@/lib/supabase'

export interface CatalogEntry {
  type: string
  minPrice: number
  maxPrice: number
  count: number
}

export async function loadCatalogSummary(): Promise<CatalogEntry[]> {
  const [{ data: rows, error }, { data: priceRows }] = await Promise.all([
    supabase.from('campers').select('id, camper_types!type_id(name)').eq('available', true),
    supabase.from('camper_prices').select('camper_id, price').eq('season_id', 'peak'),
  ])

  if (error || !rows) return []

  const peakPrices: Record<string, number> = {}
  for (const p of (priceRows ?? []) as any[]) peakPrices[p.camper_id] = p.price

  const byType: Record<string, number[]> = {}
  for (const r of rows as any[]) {
    const type: string = (r.camper_types?.name as string) ?? 'Egyéb'
    if (!byType[type]) byType[type] = []
    byType[type].push((peakPrices[r.id] ?? 0) as number)
  }

  return Object.entries(byType).map(([type, prices]) => ({
    type,
    minPrice: Math.min(...prices),
    maxPrice: Math.max(...prices),
    count: prices.length,
  }))
}
