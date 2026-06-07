import { supabase } from '@/lib/supabase'

export interface FaqItem {
  id: number
  question: string
  answer: string
  category: string
  language: string | null
  priority: number
}

export async function loadFaqItems(): Promise<FaqItem[]> {
  const { data, error } = await supabase
    .from('faq_items')
    .select('id, question, answer, category, language, priority')
    .eq('active', true)
    .order('priority', { ascending: true })

  if (error) {
    console.error('[faq] Failed to load FAQ items:', error.message)
    return []
  }
  return (data ?? []) as FaqItem[]
}
