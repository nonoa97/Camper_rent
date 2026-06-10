'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
import AuthModal from '@/components/ui/AuthModal'
import ProfileModal from '@/components/ui/ProfileModal'

const NAV = [
  ['Útvonalak', '/utazasok'],
  ['Lakóautók', '/katalogus'],
  ['Rólunk', '/rolunk'],
  ['GYIK', '/gyik'],
  ['Kapcsolat', '/kapcsolat'],
]

export default function PageHeader() {
  const [open, setOpen] = useState(false)
  const [authModal, setAuthModal] = useState<'login' | 'register' | null>(null)
  const [profileOpen, setProfileOpen] = useState(false)
  const [user, setUser] = useState<User | null>(null)
  const supabase = createSupabaseBrowser()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleLogout() {
    await supabase.auth.signOut()
    setProfileOpen(false)
  }

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Fiók'
  const initials = displayName.slice(0, 2).toUpperCase()

  return (
    <>
      <div className="relative w-full" style={{ height: '70px' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/menu_pic.png"
          alt=""
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center' }}
        />
        <div className="absolute inset-0 z-10 flex items-center justify-between px-4 md:grid md:grid-cols-3 md:px-10">
          <Link href="/" className="text-white flex flex-col leading-tight">
            <span className="block text-[21px] font-black tracking-[0.15em] uppercase">VanLife</span>
            <span className="block text-[10px] font-semibold tracking-[0.32em] uppercase opacity-[0.65] mt-px">Europe</span>
          </Link>

          <nav className="hidden md:flex gap-10 justify-center">
            {NAV.map(([label, href]) => (
              <Link key={href} href={href} className="text-white text-base font-semibold tracking-wide">
                {label}
              </Link>
            ))}
          </nav>

          {/* Desktop auth */}
          <div className="hidden md:flex items-center justify-end gap-3">
            {user ? (
              <button
                onClick={() => setProfileOpen(true)}
                className="flex items-center gap-2 text-white/90 hover:text-white transition-colors"
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.2)' }}
                >
                  {user.user_metadata?.avatar_url ? (
                    <img src={user.user_metadata.avatar_url} alt="avatar" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
                <span className="text-sm font-semibold">{displayName}</span>
              </button>
            ) : (
              <>
                <button
                  onClick={() => setAuthModal('login')}
                  className="text-white/90 hover:text-white text-sm font-semibold tracking-wide transition-colors"
                >
                  Belépés
                </button>
                <button
                  onClick={() => setAuthModal('register')}
                  className="px-4 py-2 rounded-full text-sm font-semibold transition-colors"
                  style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', backdropFilter: 'blur(4px)' }}
                >
                  Regisztráció
                </button>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <div className="flex md:hidden justify-end">
            <button
              onClick={() => setOpen(true)}
              className="text-white p-1"
              aria-label="Menü megnyitása"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden fixed inset-0 z-[100] bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-7">
          <button
            onClick={() => setOpen(false)}
            className="absolute top-6 right-4 text-white p-1"
            aria-label="Menü bezárása"
          >
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {NAV.map(([label, href]) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              className="text-white text-3xl font-extrabold tracking-wide hover:text-white/60 transition-colors duration-200"
            >
              {label}
            </Link>
          ))}

          <div className="flex flex-col items-center gap-3 mt-4 w-48">
            {user ? (
              <>
                <div className="text-white/60 text-sm">{user.email}</div>
                <button
                  onClick={() => { handleLogout(); setOpen(false) }}
                  className="w-full py-2.5 rounded-full text-sm font-semibold text-white border border-white/30 hover:bg-white/10 transition-colors"
                >
                  Kijelentkezés
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setAuthModal('login'); setOpen(false) }}
                  className="w-full py-2.5 rounded-full text-sm font-semibold text-white border border-white/30 hover:bg-white/10 transition-colors"
                >
                  Belépés
                </button>
                <button
                  onClick={() => { setAuthModal('register'); setOpen(false) }}
                  className="w-full py-2.5 rounded-full text-sm font-semibold text-white bg-white/15 hover:bg-white/25 transition-colors"
                >
                  Regisztráció
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {authModal && (
        <AuthModal
          initialView={authModal}
          onClose={() => setAuthModal(null)}
        />
      )}

      {profileOpen && user && (
        <ProfileModal
          user={user}
          onClose={() => setProfileOpen(false)}
          onLogout={handleLogout}
        />
      )}
    </>
  )
}
