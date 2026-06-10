'use client'

import { useState } from 'react'
import { loginAction } from './actions'

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const result = await loginAction(new FormData(e.currentTarget))
    if (result?.error) {
      setError(result.error)
      setLoading(false)
    }
    // on success loginAction redirects — component unmounts
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: '#f5f5f5', fontFamily: "system-ui, -apple-system, 'Helvetica Neue', sans-serif",
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #ece9e4',
        padding: '36px 32px', width: 340, boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
      }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '0.15em', textTransform: 'uppercase', color: '#1a3a2a' }}>
            VanLife
          </div>
          <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.32em', textTransform: 'uppercase', color: '#aaa', marginTop: 2 }}>
            Europe Admin
          </div>
        </div>

        <div style={{ fontSize: 15, fontWeight: 700, color: '#111', marginBottom: 4 }}>Bejelentkezés</div>
        <div style={{ fontSize: 13, color: '#aaa', marginBottom: 22 }}>Supabase fiókkal lépj be.</div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            type="email" name="email" placeholder="Email cím"
            autoComplete="email" required
            style={{
              border: '1.5px solid #e0e0da', borderRadius: 8, padding: '10px 13px',
              fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#111',
            }}
          />
          <input
            type="password" name="password" placeholder="Jelszó"
            autoComplete="current-password" required
            style={{
              border: '1.5px solid #e0e0da', borderRadius: 8, padding: '10px 13px',
              fontSize: 14, fontFamily: 'inherit', outline: 'none', color: '#111',
            }}
          />

          {error && (
            <div style={{ fontSize: 12, color: '#b02020', background: '#fdecea', borderRadius: 6, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          <button type="submit" disabled={loading} style={{
            background: loading ? '#aaa' : '#1a3a2a', color: '#fff', border: 'none',
            borderRadius: 8, padding: '10px 0', fontSize: 14, fontWeight: 600,
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit', marginTop: 2,
          }}>
            {loading ? 'Belépés...' : 'Belépés'}
          </button>
        </form>
      </div>
    </div>
  )
}
