'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import {
  Elements,
  CardNumberElement,
  CardExpiryElement,
  CardCvcElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js'
import type { Trip } from '@/lib/trips'
import { grantFreeAccess } from './actions'

const stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!)

const CARD_STYLE = {
  style: {
    base: {
      fontSize: '15px',
      color: '#111111',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSmoothing: 'antialiased',
      '::placeholder': { color: '#cccccc' },
    },
    invalid: { color: '#cc0000' },
  },
}

function CardField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] tracking-[0.12em] uppercase text-[#bbb] mb-1 font-medium">
        {label}
      </label>
      <div className="border border-[#e6e4df] rounded-xl px-3 py-2.5 bg-white focus-within:border-[#1a3a2a] transition-colors">
        {children}
      </div>
    </div>
  )
}

function CheckoutForm({
  trip,
  userEmail,
  clientSecret,
}: {
  trip: Trip
  userEmail: string | null
  clientSecret: string
}) {
  const stripe = useStripe()
  const elements = useElements()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [postCode, setPostCode] = useState('')
  const [city, setCity] = useState('')
  const [streetAddress, setStreetAddress] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setLoading(true)
    setError('')

    const cardNumber = elements.getElement(CardNumberElement)
    if (!cardNumber) { setLoading(false); return }

    const { error: stripeError, paymentIntent } = await stripe.confirmCardPayment(clientSecret, {
      payment_method: {
        card: cardNumber,
        billing_details: {
          ...(name && { name }),
          ...(userEmail && { email: userEmail }),
          address: {
            country: 'HU',
            ...(postCode && { postal_code: postCode }),
            ...(city && { city }),
            ...(streetAddress && { line1: streetAddress }),
          },
        },
      },
      return_url: `${window.location.origin}/utazasok/koszonom?slug=${trip.slug}`,
    })

    if (stripeError) {
      setError(stripeError.message ?? 'Sikertelen fizetés, próbáld újra.')
      setLoading(false)
    } else if (paymentIntent?.status === 'succeeded') {
      router.push(`/utazasok/koszonom?slug=${trip.slug}&payment_intent=${paymentIntent.id}`)
    }
  }

  const inputCls = "w-full border border-[#e6e4df] rounded-xl px-3 py-2.5 bg-white text-[14px] text-[#111] placeholder-[#ccc] focus:border-[#1a3a2a] focus:outline-none transition-colors"
  const labelCls = "block text-[10px] tracking-[0.12em] uppercase text-[#bbb] mb-1 font-medium"

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <CardField label="Kártyaszám">
        <CardNumberElement options={{ ...CARD_STYLE, showIcon: true }} />
      </CardField>

      <div className="grid grid-cols-2 gap-3">
        <CardField label="Lejárat (HH/ÉÉ)">
          <CardExpiryElement options={CARD_STYLE} />
        </CardField>
        <CardField label="Biztonsági kód">
          <CardCvcElement options={CARD_STYLE} />
        </CardField>
      </div>

      <div>
        <label className={labelCls}>Kártyabirtokos neve</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="Teljes név"
          className={inputCls}
        />
      </div>

      <p className="text-[10px] tracking-[0.15em] uppercase text-[#bbb] font-medium !mt-4">
        Számlázási cím
      </p>

      <div className="grid grid-cols-[80px_1fr] gap-2 !mt-1.5">
        <div>
          <label className={labelCls}>Ir. szám</label>
          <input
            type="text"
            value={postCode}
            onChange={e => setPostCode(e.target.value)}
            placeholder="1000"
            maxLength={4}
            className={inputCls}
          />
        </div>
        <div>
          <label className={labelCls}>Város</label>
          <input
            type="text"
            value={city}
            onChange={e => setCity(e.target.value)}
            placeholder="Budapest"
            className={inputCls}
          />
        </div>
      </div>

      <div className="!mt-2">
        <label className={labelCls}>Utca, házszám</label>
        <input
          type="text"
          value={streetAddress}
          onChange={e => setStreetAddress(e.target.value)}
          placeholder="Pl. Kossuth u. 1."
          className={inputCls}
        />
      </div>

      {error && <p className="text-red-500 text-sm">{error}</p>}

      <button
        type="submit"
        disabled={!stripe || loading}
        className="w-full py-3 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 !mt-5"
      >
        {loading ? (
          <>
            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
            Feldolgozás...
          </>
        ) : (
          `Fizetés — ${trip.priceHuf.toLocaleString('hu-HU')} Ft`
        )}
      </button>

      <p className="text-center text-[11px] text-[#bbb]">
        Biztonságos fizetés · Stripe · SSL titkosítás
      </p>
    </form>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────
export default function FizetesClient({
  trip,
  userId,
  userEmail,
  clientSecret,
}: {
  trip: Trip
  userId: string | null
  userEmail: string | null
  clientSecret: string | null
}) {
  const router = useRouter()
  const [freeLoading, setFreeLoading] = useState(false)

  const notLoggedIn = !userId

  async function handleFreeAccess() {
    if (!userId) return
    setFreeLoading(true)
    await grantFreeAccess(trip.id, userId)
    router.push(`/utazasok/${trip.slug}/terv`)
  }

  return (
    <section className="min-h-[80vh] bg-[#f7f6f3] px-4 md:px-10 py-12">
      <div className="max-w-[960px] mx-auto grid grid-cols-1 md:grid-cols-[1fr_340px] gap-8 items-start">

        {/* ── Left ── */}
        <div>
          <Link
            href={`/utazasok/${trip.slug}`}
            className="text-[13px] text-[#999] hover:text-[#333] transition-colors mb-8 inline-block"
          >
            ← Vissza az útvonalhoz
          </Link>

          <h1 className="text-2xl font-black text-[#111] mb-1 leading-tight">
            {trip.isFree ? 'Terv letöltése' : 'Fizetési adatok'}
          </h1>
          <p className="text-[#999] text-sm mb-8">
            {trip.isFree
              ? 'Ingyenes bemutató terv — nincs szükség fizetésre.'
              : 'A vásárlás után azonnal megkapod az útvonaltervet e-mailben.'}
          </p>

          {/* Auth wall */}
          {notLoggedIn && (
            <div className="bg-white border border-[#e6e4df] rounded-2xl p-6">
              <p className="text-sm font-semibold text-[#111] mb-1">Bejelentkezés szükséges</p>
              <p className="text-xs text-[#999] mb-4 leading-relaxed">
                A vásárláshoz be kell jelentkezned, hogy az útvonaltervet a fiókodhoz tudjuk kötni.
              </p>
              <Link
                href="/"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors"
              >
                Bejelentkezés
              </Link>
            </div>
          )}

          {/* Free trip */}
          {trip.isFree && !notLoggedIn && (
            <button
              onClick={handleFreeAccess}
              disabled={freeLoading}
              className="w-full py-3.5 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {freeLoading ? 'Betöltés...' : 'Megkapom — Ingyenes'}
            </button>
          )}

          {/* Individual card elements — no Link, no save section */}
          {!trip.isFree && !notLoggedIn && clientSecret && (
            <Elements stripe={stripePromise} options={{ locale: 'hu' }}>
              <CheckoutForm trip={trip} userEmail={userEmail} clientSecret={clientSecret} />
            </Elements>
          )}
        </div>

        {/* ── Right: order summary ── */}
        <div className="sticky top-24">
          <div className="bg-white border border-[#e6e4df] rounded-2xl p-6">
            <p className="text-[10px] tracking-[0.2em] uppercase text-[#bbb] mb-4">Rendelés összegzése</p>

            <div className="flex items-start gap-3 mb-5 pb-5 border-b border-[#e6e4df]">
              <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 bg-[#f0ede7]">
                {trip.heroImage && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`${trip.heroImage.split('?')[0]}?w=120&q=70`}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                )}
              </div>
              <div>
                <p className="text-[11px] text-[#999] mb-0.5">{trip.country} · {trip.days} nap</p>
                <p className="text-sm font-extrabold text-[#111] leading-snug">{trip.title}</p>
                <p className="text-[11px] text-[#bbb] mt-0.5">PDF + interaktív térkép</p>
              </div>
            </div>

            <div className="space-y-2 mb-5 text-sm">
              <div className="flex justify-between text-[#666]">
                <span>Útvonalterv</span>
                <span>{trip.isFree ? 'Ingyenes' : `${trip.priceHuf.toLocaleString('hu-HU')} Ft`}</span>
              </div>
              {!trip.isFree && (
                <div className="flex justify-between text-[#666]">
                  <span>ÁFA (27%)</span>
                  <span>{Math.round(trip.priceHuf * 0.27).toLocaleString('hu-HU')} Ft</span>
                </div>
              )}
            </div>

            <div className="flex justify-between items-baseline border-t border-[#e6e4df] pt-4">
              <span className="text-sm font-semibold text-[#111]">Összesen</span>
              <span className="text-xl font-black text-[#111]">
                {trip.isFree ? 'Ingyenes' : `${trip.priceHuf.toLocaleString('hu-HU')} Ft`}
              </span>
            </div>
          </div>

          {!trip.isFree && (
            <p className="text-[11px] text-[#bbb] text-center mt-4 leading-relaxed px-2">
              Digitális termékre vonatkozó EU-s szabályok: letöltés után nem visszatéríthető.
            </p>
          )}
        </div>

      </div>
    </section>
  )
}
