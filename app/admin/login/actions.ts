'use server'

import { redirect } from 'next/navigation'
import { createSupabaseServer } from '@/lib/supabase-server'

export async function loginAction(formData: FormData): Promise<{ error: string } | never> {
  const email    = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createSupabaseServer()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: 'Hibás email vagy jelszó.' }

  redirect('/admin')
}
