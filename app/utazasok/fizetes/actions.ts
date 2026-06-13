'use server'

import { supabaseAdmin } from '@/lib/supabase-admin'

export async function grantFreeAccess(tripId: string, userId: string): Promise<void> {
  await supabaseAdmin.from('purchases').upsert(
    { user_id: userId, trip_id: tripId, amount_huf: 0, status: 'paid' },
    { onConflict: 'user_id,trip_id', ignoreDuplicates: true },
  )
}
