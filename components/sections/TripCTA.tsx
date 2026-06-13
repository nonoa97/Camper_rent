'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import AuthModal from '@/components/ui/AuthModal'

const supabase = createSupabaseBrowser()

export default function TripCTA({ slug, isFree, priceHuf }: {
  slug: string
  isFree: boolean
  priceHuf: number
}) {
  const router = useRouter()
  const [showAuth, setShowAuth] = useState(false)

  async function handleClick() {
    const { data } = await supabase.auth.getUser()
    if (data.user) {
      router.push(`/utazasok/fizetes?slug=${slug}`)
    } else {
      setShowAuth(true)
    }
  }

  // After successful login redirect to fizetes
  useEffect(() => {
    if (!showAuth) return
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') {
        setShowAuth(false)
        router.push(`/utazasok/fizetes?slug=${slug}`)
      }
    })
    return () => subscription.unsubscribe()
  }, [showAuth, slug, router])

  return (
    <>
      <button
        onClick={handleClick}
        className="inline-flex items-center gap-2 mt-4 px-5 py-2.5 rounded-full bg-[#1a3a2a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors"
      >
        {isFree ? 'Megkapom ingyen' : 'Megvásárlom'} <span aria-hidden>→</span>
      </button>

      {showAuth && (
        <AuthModal
          initialView="login"
          onClose={() => setShowAuth(false)}
          afterLoginUrl={`/utazasok/fizetes?slug=${slug}`}
        />
      )}
    </>
  )
}
