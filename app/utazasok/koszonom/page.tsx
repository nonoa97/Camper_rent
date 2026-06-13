import Stripe from 'stripe'
import Link from 'next/link'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createAndSendInvoice } from '@/lib/billingo'

async function recordPurchase(stripeRef: string, isPaymentIntent: boolean) {
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

    let metadata: Record<string, string> = {}
    let amountFillér = 0
    let succeeded = false

    if (isPaymentIntent) {
      const pi = await stripe.paymentIntents.retrieve(stripeRef, {
        expand: ['payment_method'],
      })
      succeeded = pi.status === 'succeeded'
      metadata = pi.metadata as Record<string, string>
      amountFillér = pi.amount
      // Store billing name from card for invoice
      const pm = pi.payment_method as Stripe.PaymentMethod | null
      if (pm?.billing_details?.name) metadata._billing_name = pm.billing_details.name
      const addr = pm?.billing_details?.address
      if (addr?.postal_code) metadata._billing_post_code = addr.postal_code
      if (addr?.city) metadata._billing_city = addr.city
      if (addr?.line1) metadata._billing_address = addr.line1
    } else {
      const session = await stripe.checkout.sessions.retrieve(stripeRef)
      succeeded = session.payment_status === 'paid'
      metadata = session.metadata as Record<string, string>
      amountFillér = session.amount_total ?? 0
    }

    if (!succeeded) return

    // metadata.user_id was set server-side when the PaymentIntent was created —
    // more reliable than session cookie (which can be lost during 3DS redirect)
    const userId = metadata.user_id
    if (!userId || !metadata.trip_id) return

    const amountHuf = Math.round(amountFillér / 100)

    // Check if already recorded — if yes, invoice was already sent, skip everything
    const { data: existing } = await supabaseAdmin
      .from('purchases')
      .select('id')
      .eq('stripe_session_id', stripeRef)
      .maybeSingle()

    if (existing) return

    const { error: upsertError } = await supabaseAdmin.from('purchases').upsert(
      {
        user_id: userId,
        trip_id: metadata.trip_id,
        stripe_session_id: stripeRef,
        amount_huf: amountHuf,
        status: 'paid',
      },
      { onConflict: 'stripe_session_id', ignoreDuplicates: true },
    )

    if (!upsertError && amountHuf > 0) {
      const { data: userData } = await supabaseAdmin.auth.admin.getUserById(userId)
      const customerEmail = userData.user?.email ?? ''
      const customerName = metadata._billing_name
        || userData.user?.user_metadata?.full_name
        || customerEmail.split('@')[0]

      const { data: tripRow } = await supabaseAdmin
        .from('trips')
        .select('title')
        .eq('id', metadata.trip_id)
        .single()

      await createAndSendInvoice({
        customerName,
        customerEmail,
        tripTitle: (tripRow as { title: string } | null)?.title ?? 'VanLife útvonalterv',
        amountHuf,
        billingPostCode: metadata._billing_post_code,
        billingCity: metadata._billing_city,
        billingAddress: metadata._billing_address,
      })
    }
  } catch {
    // Non-blocking — payment already happened, success page still shows
  }
}

export default async function KoszonomPage({
  searchParams,
}: {
  searchParams: Promise<{
    slug?: string
    payment_intent?: string
    session_id?: string
    redirect_status?: string
  }>
}) {
  const { slug, payment_intent, session_id } = await searchParams

  const stripeRef = payment_intent ?? session_id
  if (stripeRef) {
    await recordPurchase(stripeRef, !!payment_intent)
  }

  return (
    <>
      <section className="min-h-[80vh] bg-[#f7f6f3] flex items-center justify-center px-4 py-20">
        <div className="max-w-[520px] mx-auto text-center">

          <div className="w-16 h-16 rounded-full bg-[#111] flex items-center justify-center mx-auto mb-8">
            <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>

          <p className="text-[11px] tracking-[0.2em] uppercase text-[#999] mb-3">Sikeres vásárlás</p>
          <h1 className="text-3xl md:text-4xl font-black text-[#111] mb-4 leading-tight">
            Köszönjük a rendelést!
          </h1>
          <p className="text-[#666] text-base leading-relaxed mb-10">
            Az útvonaltervet e-mailben elküldjük néhány percen belül. Nézd meg a spam mappát is, ha nem érkezne meg.
          </p>

          <div className="bg-white border border-[#e6e4df] rounded-2xl p-5 text-left mb-8">
            <div className="flex items-center justify-between py-2 border-b border-[#e6e4df]">
              <span className="text-[#999] text-sm">Tartalom</span>
              <span className="text-[#111] text-sm font-semibold">PDF + interaktív térkép</span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-[#e6e4df]">
              <span className="text-[#999] text-sm">Kézbesítés</span>
              <span className="text-[#111] text-sm font-semibold">E-mailben, azonnal</span>
            </div>
            {stripeRef && (
              <div className="flex items-center justify-between py-2 border-b border-[#e6e4df]">
                <span className="text-[#999] text-sm">Tranzakció</span>
                <span className="text-[#111] text-sm font-mono">{stripeRef.slice(0, 20)}…</span>
              </div>
            )}
            <div className="flex items-center justify-between py-2">
              <span className="text-[#999] text-sm">Támogatás</span>
              <span className="text-[#111] text-sm font-semibold">info@vanlifeeurope.hu</span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            {slug && (
              <Link
                href={`/utazasok/${slug}/terv`}
                className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors"
              >
                Teljes terv megtekintése →
              </Link>
            )}
            <Link
              href="/utazasok"
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full border border-[#e6e4df] text-[#555] text-sm hover:border-[#999] transition-colors"
            >
              Összes útvonal
            </Link>
          </div>

        </div>
      </section>
    </>
  )
}
