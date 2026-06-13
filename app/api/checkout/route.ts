import Stripe from 'stripe'
import { NextRequest, NextResponse } from 'next/server'
import { getTripBySlug } from '@/lib/supabase-trips'
import { createSupabaseServer } from '@/lib/supabase-server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  const { slug } = await req.json()

  const trip = await getTripBySlug(slug)
  if (!trip) return NextResponse.json({ error: 'Nem található' }, { status: 404 })

  // Free trips: no auth, no Stripe — just redirect to thank-you page
  if (trip.isFree) {
    return NextResponse.json({ url: `/utazasok/koszonom?slug=${slug}` })
  }

  // Paid trips: require authenticated user
  const supabase = await createSupabaseServer()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Bejelentkezés szükséges' }, { status: 401 })

  // Already purchased? Skip Stripe, go straight to koszonom
  const { data: existing } = await supabaseAdmin
    .from('purchases')
    .select('id')
    .eq('user_id', user.id)
    .eq('trip_id', trip.id)
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ url: `/utazasok/koszonom?slug=${slug}` })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [
      {
        price_data: {
          currency: 'huf',
          product_data: {
            name: trip.title,
            description: `${trip.days} napos útvonalterv — PDF + interaktív térkép`,
          },
          // HUF is a two-decimal currency in Stripe (fillér = 1/100 Ft)
          unit_amount: trip.priceHuf * 100,
        },
        quantity: 1,
      },
    ],
    // Store IDs in metadata for purchase recording on success
    metadata: {
      slug,
      trip_id: trip.id,
      user_id: user.id,
    },
    client_reference_id: user.id,
    success_url: `${baseUrl}/utazasok/koszonom?slug=${slug}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${baseUrl}/utazasok/${slug}`,
  })

  return NextResponse.json({ url: session.url })
}
