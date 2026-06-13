import Stripe from 'stripe'
import { redirect } from 'next/navigation'
import { getTripBySlug } from '@/lib/supabase-trips'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import FizetesClient from './FizetesClient'

async function createPaymentIntent(tripId: string, tripPriceHuf: number, userId: string, slug: string) {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const pi = await stripe.paymentIntents.create({
    amount: tripPriceHuf * 100,
    currency: 'huf',
    payment_method_types: ['card'],
    metadata: { trip_id: tripId, user_id: userId, slug },
  })
  return pi.client_secret!
}

export default async function FizetesPage({
  searchParams,
}: {
  searchParams: Promise<{ slug?: string }>
}) {
  const { slug = '' } = await searchParams
  const trip = await getTripBySlug(slug)

  if (!trip) {
    return (
      <div className="min-h-[80vh] bg-[#f7f6f3] flex items-center justify-center">
        <p className="text-[#888] text-sm">Az útvonal nem található.</p>
      </div>
    )
  }

  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()

  // Already has access → send straight to the full plan
  if (user) {
    const { data: existing } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('user_id', user.id)
      .eq('trip_id', trip.id)
      .maybeSingle()

    if (existing) redirect(`/utazasok/${slug}/terv`)
  }

  let clientSecret: string | null = null

  if (!trip.isFree && user) {
    clientSecret = await createPaymentIntent(trip.id, trip.priceHuf, user.id, trip.slug)
  }

  return (
    <FizetesClient
      trip={trip}
      userId={user?.id ?? null}
      userEmail={user?.email ?? null}
      clientSecret={clientSecret}
    />
  )
}
