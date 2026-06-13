'use client'

import { useState, useEffect } from 'react'
import type { User } from '@supabase/supabase-js'
import { createSupabaseBrowser } from '@/lib/supabase-browser'

interface Profile {
  name: string | null
  phone: string | null
  avatar_url: string | null
}

interface Props {
  user: User
  onClose: () => void
  onLogout: () => void
}

export default function ProfileModal({ user, onClose, onLogout }: Props) {
  const [profile, setProfile] = useState<Profile>({ name: null, phone: null, avatar_url: null })
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Profile>({ name: null, phone: null, avatar_url: null })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const supabase = createSupabaseBrowser()

  useEffect(() => {
    supabase
      .from('customers')
      .select('name, phone, avatar_url')
      .eq('auth_user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setProfile(data)
          setForm(data)
        }
      })
  }, [user.id])

  async function handleSave() {
    setSaving(true)
    await supabase
      .from('customers')
      .update({ name: form.name, phone: form.phone })
      .eq('auth_user_id', user.id)
    setProfile(prev => ({ ...prev, name: form.name, phone: form.phone }))
    setSaving(false)
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const displayName = profile.name || user.email?.split('@')[0] || 'Felhasználó'
  const initials = displayName.slice(0, 2).toUpperCase()
  const provider = user.app_metadata?.provider as string | undefined

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
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {/* header sáv */}
        <div className="h-16 w-full" style={{ background: 'linear-gradient(135deg, #1a3a2a 0%, #2d5a3d 100%)' }} />

        {/* avatar */}
        <div className="flex flex-col items-center -mt-10 pb-2 px-8">
          <div className="w-20 h-20 rounded-full border-4 border-white shadow-md overflow-hidden bg-[#1a3a2a] flex items-center justify-center">
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="avatar" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white text-2xl font-bold">{initials}</span>
            )}
          </div>

          <div className="mt-3 text-center">
            <div className="text-base font-bold text-gray-900">{displayName}</div>
            <div className="text-xs text-gray-400 mt-0.5">{user.email}</div>
            {provider && provider !== 'email' && (
              <div className="inline-flex items-center gap-1 mt-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-100 text-gray-500 uppercase tracking-wide">
                {provider === 'google' ? '🔵 Google' : provider === 'x' ? '✖ X' : provider}
              </div>
            )}
          </div>
        </div>

        {/* adatok */}
        <div className="px-8 py-5 border-t border-gray-100 mt-3">
          {editing ? (
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Teljes név</label>
                <input
                  type="text"
                  value={form.name ?? ''}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  className="w-full border border-[#e6e4df] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1a3a2a] transition-colors"
                  placeholder="Teljes neved"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 block">Telefonszám</label>
                <input
                  type="tel"
                  value={form.phone ?? ''}
                  onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                  className="w-full border border-[#e6e4df] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1a3a2a] transition-colors"
                  placeholder="+36 30 000 0000"
                />
              </div>
              <div className="flex gap-2 mt-1">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 py-2 rounded-full text-sm font-semibold text-white transition-opacity"
                  style={{ background: '#1a3a2a', opacity: saving ? 0.6 : 1 }}
                >
                  {saving ? 'Mentés...' : 'Mentés'}
                </button>
                <button
                  onClick={() => { setEditing(false); setForm(profile) }}
                  className="flex-1 py-2 rounded-full text-sm font-semibold text-gray-600 border border-[#e6e4df] hover:bg-gray-50 transition-colors"
                >
                  Mégsem
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Profil adatok</span>
                <button
                  onClick={() => setEditing(true)}
                  className="text-xs font-semibold text-[#1a3a2a] hover:underline"
                >
                  Szerkesztés
                </button>
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-400">Név</span>
                  <span className="text-sm font-medium text-gray-800">{profile.name || '—'}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-gray-100">
                  <span className="text-xs text-gray-400">Email</span>
                  <span className="text-sm font-medium text-gray-800">{user.email}</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs text-gray-400">Telefon</span>
                  <span className="text-sm font-medium text-gray-800">{profile.phone || '—'}</span>
                </div>
              </div>

              {saved && (
                <div className="text-xs text-green-700 bg-green-50 rounded-lg px-3 py-2 text-center">
                  Profil mentve ✓
                </div>
              )}
            </div>
          )}
        </div>

        {/* logout */}
        <div className="px-8 pb-6">
          <button
            onClick={onLogout}
            className="w-full py-2.5 rounded-lg text-sm font-semibold text-red-600 border border-red-100 hover:bg-red-50 transition-colors"
          >
            Kijelentkezés
          </button>
        </div>
      </div>
    </div>
  )
}
