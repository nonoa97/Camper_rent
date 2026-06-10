import { createClient } from '@supabase/supabase-js'

// Server-only client.
// Uses service role key (bypasses RLS) when available.
// Falls back to anon key for testing — requires open write policies on the tables.
// Never import this in client components.
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  key,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
