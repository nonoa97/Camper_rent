'use client'

import { useState, useEffect } from 'react'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

type View = 'login' | 'register'
type Provider = 'google' | 'facebook' | 'twitter' | 'x'

interface Props {
  initialView?: View
  onClose: () => void
  afterLoginUrl?: string
}

const PROVIDERS: { id: Provider; label: string; icon: React.ReactNode; bg: string; color: string; border: string }[] = [
  {
    id: 'google',
    label: 'Google',
    bg: '#fff',
    color: '#111',
    border: '#e0e0da',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
      </svg>
    ),
  },
  {
    id: 'facebook',
    label: 'Facebook',
    bg: '#1877F2',
    color: '#fff',
    border: '#1877F2',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    id: 'x',
    label: 'X (Twitter)',
    bg: '#000',
    color: '#fff',
    border: '#000',
    icon: (
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="#fff" xmlns="http://www.w3.org/2000/svg">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
]

export default function AuthModal({ initialView = 'login', onClose, afterLoginUrl }: Props) {
  const [view, setView] = useState<View>(initialView)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState<Provider | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const supabase = createSupabaseBrowser()

  useEffect(() => {
    setError(null)
    setEmail('')
    setPassword('')
    setSent(false)
  }, [view])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (view === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError('Hibás email cím vagy jelszó.')
      } else {
        onClose()
      }
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) {
        setError(error.message === 'User already registered' ? 'Ez az email cím már regisztrálva van.' : error.message)
      } else {
        setSent(true)
      }
    }

    setLoading(false)
  }

  async function handleOAuth(provider: Provider) {
    setOauthLoading(provider)
    setError(null)
    const next = afterLoginUrl ? `?next=${encodeURIComponent(afterLoginUrl)}` : ''
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback${next}`,
      },
    })
    if (error) {
      setError('Hiba a bejelentkezés során. Kérlek próbáld újra.')
      setOauthLoading(null)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* close */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-700 transition-colors z-10"
          aria-label="Bezárás"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* header */}
        <div className="px-8 pt-8 pb-5">
          <div className="text-[15px] font-black tracking-[0.15em] uppercase text-[#1a3a2a] mb-1">VanLife</div>
          <div className="text-[9px] font-semibold tracking-[0.32em] uppercase text-gray-400">Europe</div>
        </div>

        {/* tabs */}
        <div className="flex border-b border-gray-100 px-8">
          {(['login', 'register'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className="pb-3 mr-6 text-sm font-semibold transition-colors border-b-2 -mb-px"
              style={{
                color: view === v ? '#1a3a2a' : '#aaa',
                borderColor: view === v ? '#1a3a2a' : 'transparent',
              }}
            >
              {v === 'login' ? 'Belépés' : 'Regisztráció'}
            </button>
          ))}
        </div>

        <div className="px-8 py-6">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-4xl mb-3">📬</div>
              <div className="text-sm font-semibold text-[#1a3a2a] mb-1">Ellenőrizd az emailedet</div>
              <div className="text-xs text-gray-500">Küldtünk egy megerősítő linket a <strong>{email}</strong> címre.</div>
              <button onClick={onClose} className="mt-5 text-xs text-[#1a3a2a] font-semibold underline">
                Bezárás
              </button>
            </div>
          ) : (
            <>
              {/* OAuth buttons */}
              <div className="flex flex-col gap-2 mb-5">
                {PROVIDERS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => handleOAuth(p.id)}
                    disabled={!!oauthLoading}
                    className="flex items-center justify-center gap-2.5 w-full py-2.5 rounded-lg text-sm font-semibold border transition-opacity"
                    style={{
                      background: p.bg,
                      color: p.color,
                      borderColor: p.border,
                      opacity: oauthLoading && oauthLoading !== p.id ? 0.5 : 1,
                    }}
                  >
                    {oauthLoading === p.id ? (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                    ) : p.icon}
                    Folytatás {p.label}-lal
                  </button>
                ))}
              </div>

              {/* divider */}
              <div className="flex items-center gap-3 mb-5">
                <div className="flex-1 h-px bg-gray-100" />
                <span className="text-xs text-gray-400 font-medium">vagy email-lel</span>
                <div className="flex-1 h-px bg-gray-100" />
              </div>

              {/* email form */}
              <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                <input
                  type="email"
                  placeholder="Email cím"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className="w-full border border-[#e6e4df] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1a3a2a] transition-colors"
                />
                <input
                  type="password"
                  placeholder="Jelszó"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete={view === 'login' ? 'current-password' : 'new-password'}
                  minLength={view === 'register' ? 6 : undefined}
                  className="w-full border border-[#e6e4df] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1a3a2a] transition-colors"
                />

                {error && (
                  <div className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2">{error}</div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-full text-sm font-semibold text-white transition-opacity mt-1"
                  style={{ background: '#1a3a2a', opacity: loading ? 0.6 : 1 }}
                >
                  {loading ? '...' : view === 'login' ? 'Belépés' : 'Fiók létrehozása'}
                </button>

                <p className="text-center text-xs text-gray-400 mt-1">
                  {view === 'login' ? (
                    <>Még nincs fiókod?{' '}
                      <button type="button" onClick={() => setView('register')} className="text-[#1a3a2a] font-semibold">
                        Regisztrálj
                      </button>
                    </>
                  ) : (
                    <>Már van fiókod?{' '}
                      <button type="button" onClick={() => setView('login')} className="text-[#1a3a2a] font-semibold">
                        Lépj be
                      </button>
                    </>
                  )}
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
