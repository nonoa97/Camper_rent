import { supabase } from '@/lib/supabase'

export interface ExtraItem {
  name: string
  category: string
  price_per_day: number
}

export async function loadExtras(): Promise<ExtraItem[]> {
  const { data: rows, error } = await supabase
    .from('extras')
    .select('name, category, price_per_day')
    .eq('available', true)
    .order('category')
    .order('name')

  if (error || !rows) return []
  return rows as ExtraItem[]
}
