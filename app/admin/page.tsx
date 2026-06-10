'use client'

import { useState, useEffect, useRef } from 'react'
import Image from 'next/image'
import { createSupabaseBrowser } from '@/lib/supabase-browser'
const supabase = createSupabaseBrowser()
import {
  actionUpdatePrice,
  actionToggleAvailable,
  actionSaveCamper,
  actionCreateCamper,
  actionDeleteCamper,
  actionLogout,
} from './actions'

// ── Types ─────────────────────────────────────────────────────
interface DbType     { id: number; name: string }
interface DbCapacity { id: number; label: string }
interface DbFeature  { id: number; name: string }

interface AdminCamper {
  id: string
  slug: string
  name: string
  description: string | null
  image_url: string | null
  images: string[]
  price_per_day: number
  available: boolean
  year: number | null
  wild_camping_suitable: boolean | null
  type_id: number | null
  type_name: string | null
  capacity_id: number | null
  capacity_label: string | null
  feature_ids: number[]
}

type DrawerTab = 'alap' | 'képek' | 'árak' | 'beállítások'

interface Season {
  id: 'low' | 'pre' | 'peak'
  name: string
  priceKey: 'priceLow' | 'priceMid' | 'priceHigh'
  fromMD: string
  toMD: string
  color: string
  bg: string
}
interface LongStayTier { id: number; minDays: number; discountPct: number; active: boolean; sortOrder: number }
interface MockPricingCamper { id: number; name: string; type: string; imageUrl?: string; priceLow: number; priceMid: number; priceHigh: number }
type BookingStatus = 'megerősített' | 'függőben' | 'lezárt' | 'lemondott'
type BookingStatusDb = 'confirmed' | 'pending' | 'closed' | 'cancelled'
const STATUS_TO_HU: Record<string, BookingStatus> = { confirmed:'megerősített', pending:'függőben', closed:'lezárt', cancelled:'lemondott' }
const STATUS_TO_DB: Record<BookingStatus, BookingStatusDb> = { 'megerősített':'confirmed', 'függőben':'pending', 'lezárt':'closed', 'lemondott':'cancelled' }
interface Booking { id: string; camperId: string; camperName: string; camperType: string; camperImageUrl?: string; customerId?: string; guest: string; email: string; phone: string; from: string; to: string; pricePerDay: number; status: BookingStatus }
interface Client { id?: string; email: string; name: string; phone: string; bookings: Booking[]; totalSpent: number; lastBooking: string; bookingCount: number }

// ── Constants ──────────────────────────────────────────────────
const MONTHS_HU = ['Január','Február','Március','Április','Május','Június','Július','Augusztus','Szeptember','Október','November','December']
const DOW_HU    = ['H','K','Sz','Cs','P','Sz','V']

const INIT_SEASONS: Season[] = [
  { id: 'low',  name: 'Holtszezon', priceKey: 'priceLow',  fromMD: '10-01', toMD: '04-30', color: '#888',    bg: '#f5f5f2' },
  { id: 'pre',  name: 'Előszezon',  priceKey: 'priceMid',  fromMD: '05-01', toMD: '06-30', color: '#c07a00', bg: '#fff8e0' },
  { id: 'peak', name: 'Főszezon',   priceKey: 'priceHigh', fromMD: '07-01', toMD: '09-30', color: '#1a5a1a', bg: '#e4f0e4' },
]

const MOCK_PRICING_CAMPERS: MockPricingCamper[] = [
  { id: 1, name: 'VW Crafter Adventure', type: 'Nagyfurgon', imageUrl: '/crafter.png',   priceLow: 35000, priceMid: 45000, priceHigh: 59000 },
  { id: 2, name: 'VW Sprinter Comfort',  type: 'Nagyfurgon', imageUrl: '/sprinter.webp', priceLow: 40000, priceMid: 50000, priceHigh: 63000 },
  { id: 3, name: 'VW T1 Retro',          type: 'Retro Busz', imageUrl: '/t1.jpeg',       priceLow: 28000, priceMid: 39000, priceHigh: 48000 },
]


const BOOKING_STATUS_META: Record<BookingStatus, { bg: string; color: string; dot: string }> = {
  'megerősített': { bg: '#e4f0e4', color: '#1a5a1a', dot: '#2a7a2a' },
  'függőben':     { bg: '#fff8e0', color: '#8a5a00', dot: '#c07a00' },
  'lezárt':       { bg: '#f0f0ec', color: '#666',    dot: '#aaa'    },
  'lemondott':    { bg: '#fdecea', color: '#b02020', dot: '#d04040' },
}

const fmt = (n: number) => n.toLocaleString('hu-HU') + ' Ft'

const BLANK: AdminCamper = {
  id: '', slug: '', name: 'Új lakóautó', description: null,
  image_url: null, images: [], price_per_day: 25000,
  available: true, year: new Date().getFullYear(),
  wild_camping_suitable: null, type_id: null, type_name: null,
  capacity_id: null, capacity_label: null, feature_ids: [],
}

// ── Helpers ────────────────────────────────────────────────────
const diffDays  = (from: string, to: string) => Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000)
const fmtDate   = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString('hu-HU', { year:'numeric', month:'2-digit', day:'2-digit' })
const fmtFtFull = (v: number) => v.toLocaleString('hu-HU') + ' Ft'
const fmtMD     = (md: string) => { const [m,d] = md.split('-').map(Number); return `${MONTHS_HU[m-1]} ${d}.` }
const dateToStr = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
const strToDate = (s: string) => { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d) }
const addDays   = (s: string, n: number) => dateToStr(new Date(strToDate(s).getTime() + n*86400000))

const isDateInSeason = (mdStr: string, fromMD: string, toMD: string) => {
  const curr = parseInt(mdStr.replace('-',''))
  const from = parseInt(fromMD.replace('-',''))
  const to   = parseInt(toMD.replace('-',''))
  return from <= to ? curr >= from && curr <= to : curr >= from || curr <= to
}
const getCurrentSeason = (seasons: Season[]): Season => {
  const t = new Date()
  const md = String(t.getMonth()+1).padStart(2,'0') + '-' + String(t.getDate()).padStart(2,'0')
  return seasons.find(s => isDateInSeason(md, s.fromMD, s.toMD)) ?? seasons[0]
}

const deriveClients = (bookings: Booking[]): Client[] => {
  const map: Record<string, Client> = {}
  bookings.forEach(b => {
    if (!map[b.email]) map[b.email] = { id: b.customerId, email: b.email, name: b.guest, phone: b.phone, bookings: [], totalSpent: 0, lastBooking: '', bookingCount: 0 }
    map[b.email].bookings.push(b)
  })
  return Object.values(map).map(c => ({
    ...c,
    totalSpent: c.bookings.filter(b => b.status === 'megerősített').reduce((s,b) => s + diffDays(b.from,b.to)*b.pricePerDay, 0),
    lastBooking: c.bookings.slice().sort((a,b) => b.from.localeCompare(a.from))[0]?.from ?? '',
    bookingCount: c.bookings.length,
  }))
}

const getCamperHero = (camperId: number) => {
  const c = MOCK_PRICING_CAMPERS.find(c => c.id === camperId)
  return { url: c?.imageUrl ?? '', objPos: '50% 50%' }
}

// ── Supabase helpers ───────────────────────────────────────────
async function dbLoadCampers(): Promise<AdminCamper[]> {
  const [{ data, error }, { data: priceRows }] = await Promise.all([
    supabase
      .from('campers')
      .select(`
        id, slug, name, description, image_url,
        available, year, wild_camping_suitable,
        type_id, camper_types(name),
        capacity_id, capacities(label),
        camper_features(feature_id),
        camper_images(url, sort_order)
      `)
      .order('name'),
    supabase.from('camper_prices').select('camper_id, price').eq('season_id', 'peak'),
  ])
  if (error || !data) return []
  const peakPrices: Record<string, number> = {}
  for (const p of (priceRows ?? []) as any[]) peakPrices[p.camper_id] = p.price
  return (data as any[]).map(r => ({
    id: r.id,
    slug: r.slug ?? '',
    name: r.name,
    description: r.description ?? null,
    image_url: r.image_url ?? null,
    images: (r.camper_images ?? []).sort((a: any, b: any) => a.sort_order - b.sort_order).map((i: any) => i.url),
    price_per_day: peakPrices[r.id] ?? 0,
    available: r.available ?? true,
    year: r.year ?? null,
    wild_camping_suitable: r.wild_camping_suitable ?? null,
    type_id: r.type_id ?? null,
    type_name: r.camper_types?.name ?? null,
    capacity_id: r.capacity_id ?? null,
    capacity_label: r.capacities?.label ?? null,
    feature_ids: (r.camper_features ?? []).map((f: any) => Number(f.feature_id)),
  }))
}


async function dbLoadBookings(): Promise<Booking[]> {
  const [{ data, error }, { data: priceRows }] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, camper_id, start_date, end_date, status, campers(name, image_url, camper_types(name)), customers(id, name, email, phone)')
      .order('start_date', { ascending: false }),
    supabase.from('camper_prices').select('camper_id, price').eq('season_id', 'peak'),
  ])
  if (error || !data) return []
  const peakPrices: Record<string, number> = {}
  for (const p of (priceRows ?? []) as any[]) peakPrices[p.camper_id] = p.price
  return (data as any[]).map(r => ({
    id: r.id,
    camperId: r.camper_id,
    camperName: r.campers?.name ?? '',
    camperType: r.campers?.camper_types?.name ?? '',
    camperImageUrl: r.campers?.image_url ?? '',
    customerId: r.customers?.id ?? undefined,
    guest: r.customers?.name ?? '',
    email: r.customers?.email ?? '',
    phone: r.customers?.phone ?? '',
    from: r.start_date,
    to: r.end_date,
    pricePerDay: peakPrices[r.camper_id] ?? 0,
    status: STATUS_TO_HU[r.status] ?? 'függőben',
  }))
}

async function dbLoadCustomers(): Promise<Client[]> {
  const [{ data: customersData }, bookings] = await Promise.all([
    supabase.from('customers').select('id, name, email, phone').order('created_at', { ascending: false }),
    dbLoadBookings(),
  ])
  if (!customersData) return []
  const bookingsByCustomer: Record<string, Booking[]> = {}
  for (const b of bookings) {
    if (b.customerId) {
      if (!bookingsByCustomer[b.customerId]) bookingsByCustomer[b.customerId] = []
      bookingsByCustomer[b.customerId].push(b)
    }
  }
  return (customersData as any[]).map(c => {
    const cBookings = bookingsByCustomer[c.id] ?? []
    return {
      id: c.id,
      name: c.name ?? '',
      email: c.email ?? '',
      phone: c.phone ?? '',
      bookings: cBookings,
      totalSpent: cBookings.filter(b => b.status === 'megerősített').reduce((s, b) => s + diffDays(b.from, b.to) * b.pricePerDay, 0),
      lastBooking: cBookings.slice().sort((a, b) => b.from.localeCompare(a.from))[0]?.from ?? '',
      bookingCount: cBookings.length,
    }
  })
}

// ── Icons ──────────────────────────────────────────────────────
const I = {
  campervans: <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="5" width="14" height="8" rx="1.5"/><path d="M1 9h14M4 13v2M12 13v2"/><circle cx="4" cy="13" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="13" r="1.5" fill="currentColor" stroke="none"/><path d="M8 5V3a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v2"/></svg>,
  pricing:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5v7M6 6.5c0-.83.67-1.5 2-1.5s2 .67 2 1.5S9.33 8 8 8s-2 .67-2 1.5S7 11 8 11s2-.67 2-1.5"/></svg>,
  bookings:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><rect x="1.5" y="3" width="13" height="11" rx="1.5"/><path d="M1.5 7h13M5 1v4M11 1v4"/></svg>,
  clients:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="5" r="2.5"/><path d="M1.5 13.5c0-2.5 2-4 4.5-4s4.5 1.5 4.5 4"/><circle cx="12" cy="5.5" r="2"/><path d="M14.5 13c0-1.83-1.34-3-3-3.5"/></svg>,
  routes:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="3.5" cy="4" r="2"/><circle cx="12.5" cy="12" r="2"/><path d="M3.5 6c0 3 9 3 9 6"/></svg>,
  reviews:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="8,1.5 10,6 15,6.5 11.5,9.5 12.5,14 8,11.5 3.5,14 4.5,9.5 1,6.5 6,6"/></svg>,
  settings:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="8" r="2.5"/><path d="M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9"/></svg>,
  plus:       <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>,
  search:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M11 11l2.5 2.5"/></svg>,
  edit:       <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11.5 2.5a1.41 1.41 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5z"/></svg>,
  trash:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 4.5h11M6 4.5V3h4v1.5M5.5 4.5l.5 8M10.5 4.5l-.5 8M7.5 4.5v8M8.5 4.5v8"/></svg>,
  pencil:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M11 2a1.41 1.41 0 0 1 2 2L5.5 11.5l-2.5.5.5-2.5L11 2z"/></svg>,
  check:      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2.5 8l4 4 7-7"/></svg>,
  x:          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>,
  upload:     <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 10V3M5 6l3-3 3 3"/><path d="M3 11.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"/></svg>,
  warning:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M8 1.5L14.5 13H1.5L8 1.5z"/><path d="M8 6.5v3M8 11h.01"/></svg>,
  refresh:    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13.5 8a5.5 5.5 0 1 1-1.1-3.3"/><path d="M13.5 2v3h-3"/></svg>,
  chevleft:   <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 12L6 8l4-4"/></svg>,
  chevright:  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 12l4-4-4-4"/></svg>,
}

// ── Sidebar ────────────────────────────────────────────────────
function Sidebar({ active, onNav }: { active: string; onNav: (v: string) => void }) {
  const navItem = (id: string, icon: React.ReactNode, label: string, badge?: string, badgeNew?: boolean) => (
    <button className={`nav-item${active === id ? ' active' : ''}`} onClick={() => onNav(id)}>
      <span className="ni">{icon}</span>
      {label}
      {badge && <span className={`nav-badge${badgeNew ? ' new' : ''}`}>{badge}</span>}
    </button>
  )
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="wm-vl">VanLife</span>
        <span className="wm-eu">Europe</span>
        <span className="admin-chip">Admin</span>
      </div>
      <div className="nav-group">
        <div className="nav-group-label">Flotta</div>
        {navItem('campervans', I.campervans, 'Lakóautók')}
        {navItem('extras', I.plus, 'Extrák')}
      </div>
      <div className="nav-group">
        <div className="nav-group-label">Ügyintézés</div>
        {navItem('bookings', I.bookings, 'Foglalások')}
        {navItem('clients', I.clients, 'Ügyfelek')}
        {navItem('pricing', I.pricing, 'Árazás és szezonok')}
      </div>
      <div className="nav-group">
        <div className="nav-group-label">Tartalom</div>
        {navItem('routes', I.routes, 'Útvonalak')}
        {navItem('reviews', I.reviews, 'Vélemények')}
        {navItem('settings', I.settings, 'Beállítások')}
      </div>
      <div className="sidebar-user">
        <div className="user-avatar">N</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="user-name">Norbi</div>
          <div className="user-email">nonoa97@gmail.com</div>
        </div>
        <button
          onClick={() => actionLogout().then(() => { window.location.href = '/admin/login' })}
          title="Kijelentkezés"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.35)', padding: 4, borderRadius: 5, display: 'flex', alignItems: 'center', flexShrink: 0 }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M10 11l3-3-3-3M13 8H6"/>
          </svg>
        </button>
      </div>
    </aside>
  )
}

// ── StatusBadge ────────────────────────────────────────────────
function StatusBadge({ available, onToggle, loading }: { available: boolean; onToggle?: () => void; loading?: boolean }) {
  return (
    <span
      className={`sbadge ${available ? 'aktív' : 'szünetel'}`}
      onClick={onToggle}
      title={onToggle ? (available ? 'Kattints: Szünetel' : 'Kattints: Aktív') : undefined}
      style={onToggle ? { cursor: 'pointer', opacity: loading ? 0.5 : 1, userSelect: 'none' } : undefined}
    >
      <span className="sdot" />
      {loading ? '...' : available ? 'Aktív' : 'Szünetel'}
    </span>
  )
}

// ── PriceCell ──────────────────────────────────────────────────
function PriceCell({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const inputRef = useRef<HTMLInputElement>(null)

  const startEdit = () => { setDraft(String(value)); setEditing(true); setTimeout(() => inputRef.current?.select(), 0) }
  const commit = () => {
    const n = parseInt(draft.replace(/\D/g, ''), 10)
    if (!isNaN(n) && n > 0) onChange(n)
    setEditing(false)
  }
  const cancel = () => setEditing(false)

  if (editing) return (
    <div className="price-inline">
      <input ref={inputRef} className="price-input-quick" value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel() }}
        autoFocus />
      <button className="price-ok" onClick={commit} title="Mentés">{I.check}</button>
      <button className="price-no" onClick={cancel} title="Mégse">{I.x}</button>
    </div>
  )
  return (
    <div className="price-cell">
      <span className="price-val">{value.toLocaleString('hu-HU')}</span>
      <span className="price-unit">Ft/nap</span>
      <button className="price-edit-btn" onClick={startEdit} title="Szerkesztés">{I.pencil}</button>
    </div>
  )
}

// ── DeleteModal ────────────────────────────────────────────────
function DeleteModal({ name, onConfirm, onCancel, loading }: { name: string; onConfirm: () => void; onCancel: () => void; loading: boolean }) {
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-icon">{I.warning}</div>
        <div className="modal-title">Törlés megerősítése</div>
        <div className="modal-text">
          Biztosan törölni szeretnéd a <strong>{name}</strong> lakóautót?
          Ez a művelet nem visszavonható, minden foglalási előzmény elvész.
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={loading}>Mégse</button>
          <button className="btn-danger" onClick={onConfirm} disabled={loading}>
            {loading ? 'Törlés...' : 'Törlés'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── EditDrawer ─────────────────────────────────────────────────
function EditDrawer({
  camper, isNew, onClose, onSave,
  types, capacities, features,
}: {
  camper: AdminCamper
  isNew: boolean
  onClose: () => void
  onSave: (c: AdminCamper) => Promise<void>
  types: DbType[]
  capacities: DbCapacity[]
  features: DbFeature[]
}) {
  const [draft, setDraft] = useState<AdminCamper>({ ...camper })
  const [tab, setTab] = useState<DrawerTab>('alap')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const set = <K extends keyof AdminCamper>(k: K, v: AdminCamper[K]) => setDraft(d => ({ ...d, [k]: v }))

  const toggleFeature = (id: number) =>
    set('feature_ids', draft.feature_ids.includes(id)
      ? draft.feature_ids.filter(f => f !== id)
      : [...draft.feature_ids, id])

  const handleSave = async () => {
    setSaving(true); setErr(null)
    try { await onSave(draft); onClose() }
    catch (e: any) { setErr(e.message ?? 'Hiba történt') }
    finally { setSaving(false) }
  }

  const tabs: DrawerTab[] = ['alap', 'képek', 'árak', 'beállítások']
  const tabLabels: Record<DrawerTab, string> = { alap: 'Alapadatok', képek: 'Képek', árak: 'Ár', beállítások: 'Beállítások' }

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <div>
            <div className="drawer-title">{isNew ? 'Új lakóautó' : draft.name}</div>
            <div className="drawer-subtitle">{isNew ? 'Töltsd ki az alapadatokat' : draft.slug}</div>
          </div>
          <button className="drawer-close" onClick={onClose}>{I.x}</button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid #f0f0ec', flexShrink: 0, overflowX: 'auto' }}>
          {tabs.map(t => (
            <button key={t} className={`drawer-tab${tab === t ? ' active' : ''}`} onClick={() => setTab(t)}>
              {tabLabels[t]}
            </button>
          ))}
        </div>

        <div className="drawer-body">
          {tab === 'alap' && (
            <>
              <div className="section-sep">Azonosítás</div>
              <div className="fg"><label className="fl">Név</label>
                <input className="fi" value={draft.name} onChange={e => set('name', e.target.value)} />
              </div>
              <div className="fg"><label className="fl">Slug (URL)</label>
                <input className="fi" value={draft.slug} onChange={e => set('slug', e.target.value)}
                  placeholder="auto-generált ha üres" />
              </div>
              <div className="form-row2">
                <div className="fg"><label className="fl">Típus</label>
                  <select className="fs" value={draft.type_id ?? ''} onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : null
                    const name = types.find(t => t.id === id)?.name ?? null
                    setDraft(d => ({ ...d, type_id: id, type_name: name }))
                  }}>
                    <option value="">— válassz —</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="fg"><label className="fl">Férőhely</label>
                  <select className="fs" value={draft.capacity_id ?? ''} onChange={e => {
                    const id = e.target.value ? Number(e.target.value) : null
                    const label = capacities.find(c => c.id === id)?.label ?? null
                    setDraft(d => ({ ...d, capacity_id: id, capacity_label: label }))
                  }}>
                    <option value="">— válassz —</option>
                    {capacities.map(c => <option key={c.id} value={c.id}>{c.label} fő</option>)}
                  </select>
                </div>
              </div>
              <div className="fg"><label className="fl">Évjárat</label>
                <input className="fi" type="number" value={draft.year ?? ''} min={1970} max={2030}
                  onChange={e => set('year', e.target.value ? Number(e.target.value) : null)} />
              </div>
              <div className="fg"><label className="fl">Leírás</label>
                <textarea className="fta" value={draft.description ?? ''} rows={4}
                  onChange={e => set('description', e.target.value || null)} />
              </div>

              <div className="section-sep">Felszereltség</div>
              <div className="feat-grid">
                {features.map(f => (
                  <button key={f.id}
                    className={`feat-chip${draft.feature_ids.includes(f.id) ? ' on' : ''}`}
                    onClick={() => toggleFeature(f.id)}>
                    {f.name}
                  </button>
                ))}
              </div>
            </>
          )}

          {tab === 'képek' && (
            <>
              <div className="section-sep">Meglévő képek</div>
              {draft.images.length > 0 ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {draft.images.map((url, i) => (
                    <div key={i} style={{ position: 'relative', aspectRatio: '4/3', borderRadius: 7, overflow: 'hidden', background: '#f0f0ec' }}>
                      <Image src={url} alt={`Kép ${i + 1}`} fill style={{ objectFit: 'cover' }} sizes="240px" />
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '20px 0' }}>
                  Nincs feltöltött kép
                </div>
              )}
              <div className="section-sep" style={{ marginTop: 8 }}>Feltöltés</div>
              <div className="drop-zone">
                <div style={{ width: 36, height: 36, color: '#ccc' }}>{I.upload}</div>
                <div style={{ fontSize: 13, color: '#aaa', textAlign: 'center' }}>
                  Húzd ide a képeket, vagy kattints a feltöltéshez
                </div>
                <div style={{ fontSize: 11, color: '#ccc' }}>JPG, PNG, WEBP · max 10 MB</div>
              </div>
            </>
          )}

          {tab === 'árak' && (
            <>
              <div className="section-sep">Bérleti díj</div>
              <div style={{ background: '#f8f8f6', border: '1px solid #ece9e4', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#888', lineHeight: 1.6 }}>
                Az árazás az <strong>Árazás és szezonok</strong> panelben kezelhető szezononként.
              </div>
            </>
          )}

          {tab === 'beállítások' && (
            <>
              <div className="section-sep">Láthatóság</div>
              <div className="fg"><label className="fl">Státusz</label>
                <select className="fs" value={draft.available ? 'true' : 'false'}
                  onChange={e => set('available', e.target.value === 'true')}>
                  <option value="true">Aktív — megjelenik a weboldalon</option>
                  <option value="false">Szünetel — rejtett, nem foglalható</option>
                </select>
              </div>
              <div className="fg"><label className="fl">Vad táborozásra alkalmas</label>
                <select className="fs"
                  value={draft.wild_camping_suitable === null ? '' : String(draft.wild_camping_suitable)}
                  onChange={e => set('wild_camping_suitable', e.target.value === '' ? null : e.target.value === 'true')}>
                  <option value="">Nincs megadva</option>
                  <option value="true">Igen</option>
                  <option value="false">Nem</option>
                </select>
              </div>
              {!isNew && (
                <div style={{ background: '#fdecea', border: '1px solid #f0bfbd', borderRadius: 8, padding: '12px 14px', fontSize: 12, color: '#b02020', lineHeight: 1.6, marginTop: 8 }}>
                  <strong>Veszélyzóna:</strong> A lakóautó törlése végleges. Használd a táblázatban lévő törlés gombot.
                </div>
              )}
            </>
          )}
        </div>

        {err && (
          <div style={{ padding: '8px 22px', background: '#fdecea', color: '#b02020', fontSize: 12, borderTop: '1px solid #f0bfbd' }}>
            Hiba: {err}
          </div>
        )}

        <div className="drawer-foot">
          <button className="btn-ghost" onClick={onClose} disabled={saving}>Mégse</button>
          <button className="btn-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Mentés...' : isNew ? 'Hozzáadás' : 'Mentés'}
          </button>
        </div>
      </div>
    </>
  )
}

// ── Toggle ─────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <div onClick={onChange} style={{width:40,height:22,borderRadius:11,background:on?'#1a3a2a':'#e0e0da',cursor:'pointer',position:'relative',transition:'background 200ms',flexShrink:0}}>
      <div style={{position:'absolute',top:3,left:on?20:3,width:16,height:16,borderRadius:'50%',background:'#fff',transition:'left 200ms',boxShadow:'0 1px 3px rgba(0,0,0,0.2)'}}/>
    </div>
  )
}

// ── BookingBadge ───────────────────────────────────────────────
function BookingBadge({ status }: { status: BookingStatus }) {
  const m = BOOKING_STATUS_META[status] ?? BOOKING_STATUS_META['függőben']
  return (
    <span style={{display:'inline-flex',alignItems:'center',gap:5,fontSize:11,fontWeight:600,padding:'3px 9px',borderRadius:9999,background:m.bg,color:m.color,whiteSpace:'nowrap'}}>
      <span style={{width:5,height:5,borderRadius:'50%',background:m.dot,flexShrink:0}}/>
      {status.charAt(0).toUpperCase()+status.slice(1)}
    </span>
  )
}

// ── PlaceholderView ────────────────────────────────────────────
function PlaceholderView({ title, icon }: { title: string; icon: React.ReactNode }) {
  return (
    <>
      <div className="topbar"><span className="topbar-title">{title}</span></div>
      <div className="content" style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <div className="placeholder-view">
          <div style={{ width: 48, height: 48, opacity: 0.25 }}>{icon}</div>
          <div className="ph-title">{title}</div>
          <div className="ph-sub">Ez a modul hamarosan elérhető lesz.</div>
        </div>
      </div>
    </>
  )
}

// ── NewBookingDrawer ───────────────────────────────────────────
interface DrawerCamper { id: string; name: string; type: string; imageUrl: string; prices: Record<string,number> }

function NewBookingDrawer({ onSave, onClose, bookings }: { onSave: (b: Omit<Booking,'id'>) => void; onClose: () => void; bookings: Booking[] }) {
  const [drawerCampers, setDrawerCampers] = useState<DrawerCamper[]>([])
  const [form, setForm] = useState<{ camperId:string; guest:string; email:string; phone:string; from:string; to:string; pricePerDay:number; status:BookingStatus }>({
    camperId: '', guest:'', email:'', phone:'', from:'', to:'', pricePerDay: 0, status:'megerősített',
  })
  const [errors, setErrors] = useState<Record<string,string>>({})
  const [emailSuggestions, setEmailSuggestions] = useState<Client[]>([])
  const [showSugg, setShowSugg] = useState(false)
  const clients = deriveClients(bookings)
  const set = <K extends keyof typeof form>(k:K, v:typeof form[K]) => setForm(f=>({...f,[k]:v}))

  useEffect(() => {
    Promise.all([
      supabase.from('campers').select('id, name, image_url, camper_types(name)').eq('available', true).order('name'),
      supabase.from('camper_prices').select('camper_id, season_id, price'),
    ]).then(([{ data: cData }, { data: pData }]) => {
      if (!cData) return
      const pricesByCamper: Record<string, Record<string,number>> = {}
      for (const p of (pData ?? []) as any[]) {
        if (!pricesByCamper[p.camper_id]) pricesByCamper[p.camper_id] = {}
        pricesByCamper[p.camper_id][p.season_id] = p.price
      }
      const list: DrawerCamper[] = (cData as any[]).map(c => ({
        id: c.id, name: c.name, type: c.camper_types?.name ?? '', imageUrl: c.image_url ?? '',
        prices: pricesByCamper[c.id] ?? {},
      }))
      setDrawerCampers(list)
      if (list.length > 0) setForm(f => ({ ...f, camperId: list[0].id, pricePerDay: list[0].prices['peak'] ?? 0 }))
    })
  }, [])

  const handleEmailChange = (val:string) => {
    set('email',val)
    if (val.length >= 2) {
      const q = val.toLowerCase()
      const matches = clients.filter(c => c.email.toLowerCase().includes(q) || c.name.toLowerCase().includes(q))
      setEmailSuggestions(matches.slice(0,5)); setShowSugg(matches.length>0)
    } else setShowSugg(false)
  }
  const selectClient = (c:Client) => { setForm(f=>({...f,email:c.email,guest:c.name,phone:c.phone})); setShowSugg(false) }

  const days  = form.from && form.to ? Math.max(0,diffDays(form.from,form.to)) : 0
  const total = days * form.pricePerDay

  const validate = () => {
    const e: Record<string,string> = {}
    if (!form.guest.trim()) e.guest = 'Kötelező'
    if (!form.email.trim()) e.email = 'Kötelező'
    if (!form.from) e.from = 'Kötelező'
    if (!form.to)   e.to   = 'Kötelező'
    if (form.from && form.to && form.from >= form.to) e.to = 'Végdátum korábbi mint a kezdet'
    if (!form.pricePerDay || form.pricePerDay <= 0) e.pricePerDay = 'Add meg az árat'
    setErrors(e); return Object.keys(e).length === 0
  }
  const submit = () => {
    if (!validate()) return
    const camper = drawerCampers.find(c => c.id === form.camperId)
    onSave({...form, camperName: camper?.name ?? '', camperType: camper?.type ?? '', camperImageUrl: camper?.imageUrl})
  }
  const errStyle = (k:string): React.CSSProperties => errors[k] ? {borderColor:'#e05050'} : {}
  const selectedCamper = drawerCampers.find(c => c.id === form.camperId)

  return (
    <>
      <div className="drawer-overlay" onClick={onClose}/>
      <div className="drawer" style={{width:480}}>
        <div className="drawer-head">
          <div><div className="drawer-title">Új foglalás rögzítése</div><span className="drawer-subtitle">Manuális foglalás hozzáadása</span></div>
          <button className="drawer-close" onClick={onClose}><span style={{width:14,height:14}}>{I.x}</span></button>
        </div>
        <div className="drawer-body">
          <div className="fg"><label className="fl">Lakóautó</label>
            <select className="fs" value={form.camperId} onChange={e=>{ const c=drawerCampers.find(x=>x.id===e.target.value); setForm(f=>({...f,camperId:e.target.value,pricePerDay:c?.prices['peak']??f.pricePerDay})) }}>
              {drawerCampers.map(c=><option key={c.id} value={c.id}>{c.name}{c.type ? ` — ${c.type}` : ''}</option>)}
            </select>
          </div>
          <div>
            <div className="section-sep">Időszak</div>
            <div className="form-row2" style={{marginTop:12}}>
              <div className="fg"><label className="fl">Érkezés</label>
                <input className="fi" type="date" value={form.from} style={errStyle('from')} onChange={e=>set('from',e.target.value)}/>
                {errors.from && <div style={{fontSize:10,color:'#c0392b',marginTop:2}}>{errors.from}</div>}
              </div>
              <div className="fg"><label className="fl">Távozás</label>
                <input className="fi" type="date" value={form.to} min={form.from} style={errStyle('to')} onChange={e=>set('to',e.target.value)}/>
                {errors.to && <div style={{fontSize:10,color:'#c0392b',marginTop:2}}>{errors.to}</div>}
              </div>
            </div>
            {days > 0 && (
              <div style={{marginTop:8,padding:'9px 13px',background:'#f5faf5',border:'1px solid #c8ddc8',borderRadius:8,fontSize:12,color:'#444',display:'flex',gap:18,alignItems:'center'}}>
                <span>⏱ <strong>{days} nap</strong></span>
                {total > 0 && <span>💰 <strong style={{color:'#1a5a1a'}}>{fmtFtFull(total)}</strong></span>}
              </div>
            )}
          </div>
          <div className="fg">
            <label className="fl">Napi ár</label>
            <div style={{position:'relative'}}>
              <input className="fi" type="number" min="0" value={form.pricePerDay} style={{paddingRight:30,...errStyle('pricePerDay')}} onChange={e=>set('pricePerDay',+e.target.value)}/>
              <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:11,fontWeight:700,color:'#bbb',pointerEvents:'none'}}>Ft</span>
            </div>
            {errors.pricePerDay && <div style={{fontSize:10,color:'#c0392b',marginTop:2}}>{errors.pricePerDay}</div>}
            {selectedCamper && Object.keys(selectedCamper.prices).length > 0 && (
              <div style={{display:'flex',gap:6,marginTop:7,flexWrap:'wrap'}}>
                {([['low','Holtszezon'],['pre','Előszezon'],['peak','Főszezon']] as [string,string][]).map(([seasonId,label])=>{
                  const price = selectedCamper.prices[seasonId]
                  if (!price) return null
                  const active = form.pricePerDay === price
                  return <button key={seasonId} type="button" onClick={()=>set('pricePerDay',price)} style={{fontSize:11,fontWeight:600,padding:'4px 11px',border:`1.5px solid ${active?'#1a3a2a':'#e0e0da'}`,borderRadius:9999,cursor:'pointer',fontFamily:'inherit',background:active?'#1a3a2a':'transparent',color:active?'#fff':'#888'}}>{label}: {fmtFtFull(price)}</button>
                })}
              </div>
            )}
          </div>
          <div>
            <div className="section-sep">Vendég adatai</div>
            <div style={{display:'flex',flexDirection:'column',gap:13,marginTop:12}}>
              <div className="fg">
                <label className="fl">E-mail</label>
                <div style={{position:'relative'}}>
                  <input className="fi" type="email" value={form.email} style={errStyle('email')} onChange={e=>handleEmailChange(e.target.value)} onFocus={()=>form.email.length>=2&&setShowSugg(emailSuggestions.length>0)} onBlur={()=>setTimeout(()=>setShowSugg(false),180)} placeholder="kovacs@email.hu"/>
                  {showSugg && (
                    <div style={{position:'absolute',top:'100%',left:0,right:0,background:'#fff',border:'1.5px solid #1a3a2a',borderRadius:8,boxShadow:'0 6px 20px rgba(0,0,0,0.1)',zIndex:50,marginTop:3,overflow:'hidden'}}>
                      {emailSuggestions.map(c=>(
                        <div key={c.email} onMouseDown={()=>selectClient(c)} style={{padding:'9px 13px',cursor:'pointer',borderBottom:'1px solid #f5f5f2',display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13,background:'#fff'}} onMouseEnter={e=>(e.currentTarget.style.background='#f5faf5')} onMouseLeave={e=>(e.currentTarget.style.background='#fff')}>
                          <div><div style={{fontWeight:600,color:'#111'}}>{c.name}</div><div style={{fontSize:11,color:'#aaa'}}>{c.email}</div></div>
                          <div style={{fontSize:11,color:'#888',textAlign:'right'}}><div>{c.bookingCount} fogl.</div><div style={{color:'#1a5a1a',fontWeight:600}}>{fmtFtFull(c.totalSpent)}</div></div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {errors.email && <div style={{fontSize:10,color:'#c0392b',marginTop:2}}>{errors.email}</div>}
              </div>
              <div className="fg"><label className="fl">Teljes név</label>
                <input className="fi" value={form.guest} style={errStyle('guest')} onChange={e=>set('guest',e.target.value)} placeholder="pl. Kovács Péter"/>
                {errors.guest && <div style={{fontSize:10,color:'#c0392b',marginTop:2}}>{errors.guest}</div>}
              </div>
              <div className="fg"><label className="fl">Telefon</label>
                <input className="fi" type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+36 30 ..."/>
              </div>
            </div>
          </div>
          <div className="fg"><label className="fl">Állapot</label>
            <select className="fs" value={form.status} onChange={e=>set('status',e.target.value as BookingStatus)}>
              <option value="megerősített">Megerősített</option>
              <option value="függőben">Függőben</option>
            </select>
          </div>
        </div>
        <div className="drawer-foot">
          <button className="btn-ghost" onClick={onClose}>Mégsem</button>
          <button className="btn-save" onClick={submit}>Foglalás rögzítése</button>
        </div>
      </div>
    </>
  )
}

// ── BookingsView ───────────────────────────────────────────────
function BookingsView() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loadingBookings, setLoadingBookings] = useState(true)
  const [filterStatus, setFilterStatus] = useState<'mind'|BookingStatus>('mind')
  const [search, setSearch]     = useState('')
  const [sortKey, setSortKey]   = useState('from')
  const [sortDir, setSortDir]   = useState<'asc'|'desc'>('asc')
  const [detail, setDetail]     = useState<Booking|null>(null)
  const [addingNew, setAddingNew] = useState(false)
  const [detailEdit, setDetailEdit] = useState(false)
  const [detailForm, setDetailForm] = useState({ from: '', to: '' })

  useEffect(() => {
    dbLoadBookings().then(data => { setBookings(data); setLoadingBookings(false) })
  }, [])
  const now = new Date()
  const [viewYear,  setViewYear]  = useState(now.getFullYear())
  const [viewMonth, setViewMonth] = useState(now.getMonth())
  const today = now.toISOString().slice(0,10)

  const prevMonth = () => { if(viewMonth===0){setViewYear(y=>y-1);setViewMonth(11);}else setViewMonth(m=>m-1) }
  const nextMonth = () => { if(viewMonth===11){setViewYear(y=>y+1);setViewMonth(0);}else setViewMonth(m=>m+1) }

  const monthStart = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-01`
  const monthEnd   = `${viewYear}-${String(viewMonth+1).padStart(2,'0')}-${new Date(viewYear,viewMonth+1,0).getDate()}`

  const filtered = bookings.filter(b => {
    if (b.from > monthEnd || b.to < monthStart) return false
    if (filterStatus !== 'mind' && b.status !== filterStatus) return false
    const q = search.toLowerCase()
    return !q || b.guest.toLowerCase().includes(q) || b.camperName.toLowerCase().includes(q)
  }).sort((a,b) => {
    let av: string|number = (a as any)[sortKey]
    let bv: string|number = (b as any)[sortKey]
    if (sortKey==='total') { av=diffDays(a.from,a.to)*a.pricePerDay; bv=diffDays(b.from,b.to)*b.pricePerDay }
    if (sortKey==='days')  { av=diffDays(a.from,a.to); bv=diffDays(b.from,b.to) }
    if (av<bv) return sortDir==='asc'?-1:1
    if (av>bv) return sortDir==='asc'?1:-1
    return 0
  })

  const setSort = (key:string) => { if(sortKey===key) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortKey(key);setSortDir('asc')} }
  const SortArrow = ({k}:{k:string}) => sortKey!==k ? null : <span style={{fontSize:9,marginLeft:3,opacity:0.7}}>{sortDir==='asc'?'▲':'▼'}</span>


  const updateStatus = async (id: string, status: BookingStatus) => {
    setBookings(bs => bs.map(b => b.id === id ? {...b, status} : b))
    if (detail?.id === id) setDetail(d => d ? {...d, status} : null)
    await supabase.from('bookings').update({ status: STATUS_TO_DB[status] }).eq('id', id)
  }

  const saveDetailEdit = async () => {
    if (!detail) return
    await supabase.from('bookings').update({ start_date: detailForm.from, end_date: detailForm.to }).eq('id', detail.id)
    const updated = { ...detail, from: detailForm.from, to: detailForm.to }
    setBookings(bs => bs.map(b => b.id === detail.id ? updated : b))
    setDetail(updated)
    setDetailEdit(false)
  }

  const deleteBooking = async (id: string) => {
    if (!window.confirm('Biztosan törlöd ezt a foglalást? Ez nem visszavonható.')) return
    await supabase.from('bookings').delete().eq('id', id)
    setBookings(bs => bs.filter(b => b.id !== id))
    setDetail(null)
  }
  const saveNewBooking = async (form: Omit<Booking,'id'>) => {
    const { data: existing } = await supabase.from('customers').select('id').eq('email', form.email).maybeSingle()
    let customerId: string
    if (existing) {
      customerId = (existing as any).id
      await supabase.from('customers').update({ name: form.guest, phone: form.phone }).eq('id', customerId)
    } else {
      const { data: newC } = await supabase.from('customers').insert({ name: form.guest, email: form.email, phone: form.phone }).select('id').single()
      customerId = (newC as any).id
    }
    const { data: newB } = await supabase.from('bookings').insert({
      camper_id: form.camperId, start_date: form.from, end_date: form.to,
      status: STATUS_TO_DB[form.status], customer_id: customerId,
    }).select('id').single()
    if (newB) setBookings(bs => [{...form, id: (newB as any).id}, ...bs])
    setAddingNew(false)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Foglalások</span>
        <div style={{display:'flex',alignItems:'center',gap:6,marginLeft:16,background:'#f5f5f2',borderRadius:8,padding:'4px 6px'}}>
          <button onClick={prevMonth} style={{width:26,height:26,border:'none',background:'transparent',cursor:'pointer',borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',color:'#666'}}>
            <span style={{width:13,height:13}}>{I.chevleft}</span>
          </button>
          <div style={{fontSize:13,fontWeight:700,color:'#111',minWidth:130,textAlign:'center'}}>{MONTHS_HU[viewMonth]} {viewYear}</div>
          <button onClick={nextMonth} style={{width:26,height:26,border:'none',background:'transparent',cursor:'pointer',borderRadius:5,display:'flex',alignItems:'center',justifyContent:'center',color:'#666'}}>
            <span style={{width:13,height:13}}>{I.chevright}</span>
          </button>
          {(viewMonth!==now.getMonth()||viewYear!==now.getFullYear()) && (
            <button onClick={()=>{setViewMonth(now.getMonth());setViewYear(now.getFullYear())}} style={{fontSize:10,fontWeight:600,color:'#1a3a2a',background:'#e4f0e4',border:'none',borderRadius:5,padding:'2px 8px',cursor:'pointer',fontFamily:'inherit',marginLeft:2}}>Ma</button>
          )}
        </div>
        <div className="topbar-right">
          <div className="search-wrap">
            <span className="search-icon">{I.search}</span>
            <input className="search-input" placeholder="Vendég, autó neve..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button className="btn-primary" onClick={()=>setAddingNew(true)}>
            <span style={{width:14,height:14,display:'inline-flex'}}>{I.plus}</span> Új foglalás
          </button>
        </div>
      </div>
      <div className="content">
        <div className="table-card scrollable">
          <div className="table-toolbar">
            {(['mind','megerősített','függőben','lezárt','lemondott'] as const).map(f=>(
              <button key={f} className={`filter-chip${filterStatus===f?' on':''}`} onClick={()=>setFilterStatus(f)}>
                {f==='mind'?'Mind':f.charAt(0).toUpperCase()+f.slice(1)}
              </button>
            ))}
            <span className="toolbar-count">{filtered.length} találat</span>
          </div>
          <div style={{overflowX:'auto'}}>
            <table className="admin-table" style={{minWidth:800}}>
              <thead><tr>
                <th>Lakóautó</th>
                <th>Vendég</th>
                <th style={{cursor:'pointer'}} onClick={()=>setSort('from')}>Időszak <SortArrow k="from"/></th>
                <th style={{cursor:'pointer',width:70}} onClick={()=>setSort('days')}>Napok <SortArrow k="days"/></th>
                <th style={{width:110}}>Napi ár</th>
                <th style={{cursor:'pointer',width:120}} onClick={()=>setSort('total')}>Összesen <SortArrow k="total"/></th>
                <th style={{width:130}}>Állapot</th>
                <th style={{width:46}}></th>
              </tr></thead>
              <tbody>
                {filtered.map(b => {
                  const days  = diffDays(b.from,b.to)
                  const total = days*b.pricePerDay
                  const hero  = { url: b.camperImageUrl ?? '', objPos: '50% 50%' }
                  return (
                    <tr key={b.id} style={{opacity:b.status==='lemondott'?0.55:1}}>
                      <td>
                        <div style={{display:'flex',alignItems:'center',gap:10}}>
                          {hero.url ? (
                            <div style={{width:46,height:34,borderRadius:6,overflow:'hidden',flexShrink:0,background:'#f0f0ec'}}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={hero.url} alt="" style={{width:'100%',height:'100%',objectFit:'cover',objectPosition:hero.objPos}} onError={e=>{(e.target as HTMLImageElement).style.opacity='0'}}/>
                            </div>
                          ) : (
                            <div style={{width:46,height:34,borderRadius:6,background:'#f0f0ec',flexShrink:0}}/>
                          )}
                          <div>
                            <div style={{fontSize:13,fontWeight:600,color:'#111'}}>{b.camperName}</div>
                            <div style={{fontSize:11,color:'#aaa'}}>{b.camperType}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div style={{fontSize:13,fontWeight:500,color:'#111'}}>{b.guest}</div>
                        <div style={{fontSize:11,color:'#bbb'}}>{b.email}</div>
                      </td>
                      <td>
                        <div style={{fontSize:13,fontWeight:600,color:'#111',whiteSpace:'nowrap'}}>{fmtDate(b.from)} – {fmtDate(b.to)}</div>
                        {b.to<today && <div style={{fontSize:10,color:'#bbb',marginTop:1}}>lezárt időszak</div>}
                      </td>
                      <td><div style={{fontSize:14,fontWeight:700,color:'#333',textAlign:'center'}}>{days}</div><div style={{fontSize:10,color:'#bbb',textAlign:'center'}}>nap</div></td>
                      <td><div style={{fontSize:13,fontWeight:600,color:'#555'}}>{fmtFtFull(b.pricePerDay)}</div><div style={{fontSize:10,color:'#bbb'}}>/ nap</div></td>
                      <td><div style={{fontSize:14,fontWeight:800,color:'#111'}}>{fmtFtFull(total)}</div></td>
                      <td><BookingBadge status={b.status}/></td>
                      <td>
                        <button className="act-btn edit" onClick={()=>setDetail(b)} title="Részletek">
                          <span style={{width:14,height:14}}>{I.edit}</span>
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {filtered.length===0 && <div style={{padding:'36px 20px',textAlign:'center',color:'#bbb',fontSize:14}}>Nincs találat.</div>}
          </div>
          {filtered.length>0 && (
            <div style={{padding:'11px 14px',borderTop:'1px solid #f0f0ec',display:'flex',justifyContent:'flex-end',gap:24,background:'#fafaf8'}}>
              <span style={{fontSize:12,color:'#aaa'}}>Napok összesen: <strong style={{color:'#555'}}>{filtered.reduce((s,b)=>s+diffDays(b.from,b.to),0)} nap</strong></span>
              <span style={{fontSize:12,color:'#aaa'}}>Szűrt bevétel: <strong style={{color:'#1a5a1a'}}>{fmtFtFull(filtered.filter(b=>b.status==='megerősített').reduce((s,b)=>s+diffDays(b.from,b.to)*b.pricePerDay,0))}</strong></span>
            </div>
          )}
        </div>
      </div>

      {addingNew && <NewBookingDrawer onSave={b=>{void saveNewBooking(b)}} onClose={()=>setAddingNew(false)} bookings={bookings}/>}

      {detail && (
        <>
          <div className="drawer-overlay" onClick={()=>{setDetail(null);setDetailEdit(false)}}/>
          <div className="drawer" style={{width:400}}>
            <div className="drawer-head">
              <div><div className="drawer-title">{detail.camperName}</div><span className="drawer-subtitle">{detail.guest}</span></div>
              <button className="drawer-close" onClick={()=>{setDetail(null);setDetailEdit(false)}}><span style={{width:14,height:14}}>{I.x}</span></button>
            </div>
            <div className="drawer-body">
              <div style={{background:'#fafaf8',border:'1px solid #f0f0ec',borderRadius:10,padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <BookingBadge status={detail.status}/>
                <select className="fs" style={{width:'auto',fontSize:12}} value={detail.status} onChange={e=>{void updateStatus(detail.id,e.target.value as BookingStatus)}}>
                  <option value="megerősített">Megerősített</option>
                  <option value="függőben">Függőben</option>
                  <option value="lezárt">Lezárt</option>
                  <option value="lemondott">Lemondott</option>
                </select>
              </div>
              <div><div className="section-sep">Lakóautó</div>
                <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
                  {[['Jármű',detail.camperName],['Típus',detail.camperType]].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:'#888'}}>{l}</span><span style={{fontWeight:600,color:'#111'}}>{v}</span></div>
                  ))}
                </div>
              </div>
              <div><div className="section-sep">Vendég adatai</div>
                <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
                  {[['Név',detail.guest],['Email',detail.email],['Telefon',detail.phone]].map(([l,v])=>(
                    <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:'#888'}}>{l}</span><span style={{fontWeight:500,color:'#333'}}>{v}</span></div>
                  ))}
                </div>
              </div>
              <div><div className="section-sep">Időszak & Számla</div>
                {detailEdit ? (
                  <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:10}}>
                    <div className="fg"><label className="fl">Kezdet</label>
                      <input className="fi" type="date" value={detailForm.from} onChange={e=>setDetailForm(f=>({...f,from:e.target.value}))}/>
                    </div>
                    <div className="fg"><label className="fl">Vég</label>
                      <input className="fi" type="date" value={detailForm.to} onChange={e=>setDetailForm(f=>({...f,to:e.target.value}))}/>
                    </div>
                    {detailForm.from && detailForm.to && (
                      <div style={{fontSize:12,color:'#888',textAlign:'right'}}>{diffDays(detailForm.from,detailForm.to)} nap · {fmtFtFull(diffDays(detailForm.from,detailForm.to)*detail.pricePerDay)}</div>
                    )}
                  </div>
                ) : (
                  <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:6}}>
                    {[['Kezdet',fmtDate(detail.from)],['Vég',fmtDate(detail.to)],['Napok',diffDays(detail.from,detail.to)+' nap'],['Napi ár',fmtFtFull(detail.pricePerDay)+' / nap']].map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:'#888'}}>{l}</span><span style={{fontWeight:500,color:'#333'}}>{v}</span></div>
                    ))}
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:15,fontWeight:800,borderTop:'1px solid #f0f0ec',paddingTop:10,marginTop:4}}>
                      <span style={{color:'#444'}}>Végösszeg</span>
                      <span style={{color:'#1a5a1a'}}>{fmtFtFull(diffDays(detail.from,detail.to)*detail.pricePerDay)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="drawer-foot" style={{gap:8}}>
              <button className="btn-ghost" style={{color:'#c0392b',borderColor:'#fde',flex:'none'}} onClick={()=>void deleteBooking(detail.id)}>Törlés</button>
              <div style={{flex:1}}/>
              {detailEdit ? (
                <>
                  <button className="btn-ghost" onClick={()=>setDetailEdit(false)}>Mégsem</button>
                  <button className="btn-save" onClick={()=>void saveDetailEdit()}>Mentés</button>
                </>
              ) : (
                <>
                  <button className="btn-ghost" onClick={()=>{setDetailForm({from:detail.from,to:detail.to});setDetailEdit(true)}}>Szerkesztés</button>
                  <button className="btn-ghost" onClick={()=>setDetail(null)}>Bezárás</button>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── SeasonCard ─────────────────────────────────────────────────
function SeasonCard({ season, isActive, avgPrice, onSave }: { season:Season; isActive:boolean; avgPrice:number; onSave:(d:Partial<Season>)=>void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ name:season.name, fromMD:season.fromMD, toMD:season.toMD })
  const setD = (k:string,v:string) => setDraft(d=>({...d,[k]:v}))

  const MDSelect = ({value,onChange}:{value:string;onChange:(v:string)=>void}) => {
    const parts = value.split('-').map(Number)
    const m = parts[0], day = parts[1]
    return (
      <div style={{display:'flex',gap:6,alignItems:'center'}}>
        <select className="fs" style={{flex:1,fontSize:12}} value={m} onChange={e=>onChange(String(e.target.value).padStart(2,'0')+'-'+String(day).padStart(2,'0'))}>
          {MONTHS_HU.map((name,i)=><option key={i+1} value={i+1}>{name}</option>)}
        </select>
        <input type="number" className="fi" min="1" max="31" value={day} style={{width:58,fontSize:12,textAlign:'center'}} onChange={e=>onChange(String(m).padStart(2,'0')+'-'+String(+e.target.value).padStart(2,'0'))}/>
        <span style={{fontSize:11,color:'#bbb'}}>.</span>
      </div>
    )
  }

  return (
    <div style={{background:'#fff',border:`2px solid ${isActive?season.color:'#ece9e4'}`,borderRadius:12,padding:'18px 20px',position:'relative',display:'flex',flexDirection:'column',gap:14}}>
      {isActive&&!editing&&<div style={{position:'absolute',top:12,right:12,fontSize:9,fontWeight:700,color:season.color,background:season.bg,padding:'2px 9px',borderRadius:9999,letterSpacing:'0.09em'}}>AKTÍV</div>}
      <div>
        <div style={{fontSize:10,color:'#aaa',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:6}}>Szezon neve</div>
        {editing ? <input className="fi" value={draft.name} onChange={e=>setD('name',e.target.value)} style={{fontSize:14,fontWeight:700,color:season.color}}/> : <div style={{fontSize:16,fontWeight:700,color:season.color}}>{season.name}</div>}
      </div>
      <div>
        <div style={{fontSize:10,color:'#aaa',fontWeight:600,letterSpacing:'0.1em',textTransform:'uppercase',marginBottom:8}}>Időszak</div>
        {editing ? (
          <div style={{display:'flex',flexDirection:'column',gap:10}}>
            <div><div style={{fontSize:10,color:'#bbb',marginBottom:4,fontWeight:600}}>KEZDETE</div><MDSelect value={draft.fromMD} onChange={v=>setD('fromMD',v)}/></div>
            <div><div style={{fontSize:10,color:'#bbb',marginBottom:4,fontWeight:600}}>VÉGE</div><MDSelect value={draft.toMD} onChange={v=>setD('toMD',v)}/></div>
          </div>
        ) : (
          <div style={{display:'flex',flexDirection:'column',gap:5}}>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}><span style={{fontSize:10,color:'#bbb',fontWeight:600,minWidth:44}}>KEZDETE</span><span style={{fontSize:14,fontWeight:600,color:'#333'}}>{fmtMD(season.fromMD)}</span></div>
            <div style={{display:'flex',alignItems:'baseline',gap:8}}><span style={{fontSize:10,color:'#bbb',fontWeight:600,minWidth:44}}>VÉGE</span><span style={{fontSize:14,fontWeight:600,color:'#333'}}>{fmtMD(season.toMD)}</span></div>
          </div>
        )}
      </div>
      {!editing && (
        <div style={{background:season.bg,borderRadius:8,padding:'9px 12px'}}>
          <div style={{fontSize:10,color:'#aaa',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em'}}>Flotta átlagár</div>
          <div style={{fontSize:17,fontWeight:700,color:season.color,marginTop:2}}>{fmtFtFull(avgPrice)}</div>
        </div>
      )}
      {editing ? (
        <div style={{display:'flex',gap:6,marginTop:'auto'}}>
          <button className="btn-ghost" style={{flex:1,padding:'7px 0',fontSize:12}} onClick={()=>setEditing(false)}>Mégsem</button>
          <button className="btn-save" style={{flex:2,padding:'7px 0',fontSize:12}} onClick={()=>{onSave(draft);setEditing(false)}}>Mentés</button>
        </div>
      ) : (
        <button onClick={()=>{setDraft({name:season.name,fromMD:season.fromMD,toMD:season.toMD});setEditing(true)}} style={{background:'transparent',border:'1px solid #e0e0da',borderRadius:7,padding:'7px 0',fontSize:12,fontWeight:500,color:'#666',cursor:'pointer',fontFamily:'inherit',marginTop:'auto'}} onMouseEnter={e=>{e.currentTarget.style.borderColor='#1a3a2a';e.currentTarget.style.color='#1a3a2a'}} onMouseLeave={e=>{e.currentTarget.style.borderColor='#e0e0da';e.currentTarget.style.color='#666'}}>Szerkesztés</button>
      )}
    </div>
  )
}

interface PricingCamper { id: string; name: string; type: string; imageUrl: string; prices: Record<string, number> }

// ── SeasonPricingView ──────────────────────────────────────────
function SeasonPricingView() {
  const [seasons, setSeasons]   = useState<Season[]>(INIT_SEASONS)
  const [longStayEnabled, setLongStayEnabled] = useState(true)
  const [tiers, setTiers]       = useState<LongStayTier[]>([])
  const [editingTier, setEditingTier] = useState<LongStayTier|null>(null)
  const [campervans,  setCampervans]  = useState<PricingCamper[]>([])
  const curSeason = getCurrentSeason(seasons)

  useEffect(() => {
    Promise.all([
      supabase.from('campers').select('id, name, image_url, camper_types(name)').eq('available', true).order('name'),
      supabase.from('camper_prices').select('camper_id, season_id, price'),
      supabase.from('long_stay_tiers').select('*').order('sort_order'),
      supabase.from('app_settings').select('value').eq('key', 'long_stay_enabled').single(),
    ]).then(([{ data: cData }, { data: pData }, { data: tData }, { data: sData }]) => {
      if (!cData) return
      const byId: Record<string, Record<string, number>> = {}
      for (const p of (pData ?? []) as any[]) {
        if (!byId[p.camper_id]) byId[p.camper_id] = {}
        byId[p.camper_id][p.season_id] = p.price
      }
      setCampervans((cData as any[]).map(c => ({
        id: c.id, name: c.name, type: (c.camper_types as any)?.name ?? '',
        imageUrl: c.image_url ?? '', prices: byId[c.id] ?? {},
      })))
      if (tData) setTiers((tData as any[]).map(t => ({ id: t.id, minDays: t.min_days, discountPct: t.discount_pct, active: t.active, sortOrder: t.sort_order })))
      if (sData) setLongStayEnabled((sData as any).value === 'true')
    })
  }, [])

  const saveSeason = (id: string, draft: Partial<Season>) => setSeasons(ss => ss.map(s => s.id === id ? {...s, ...draft} : s))
  const updVehicle = async (vid: string, seasonId: string, val: number) => {
    setCampervans(cs => cs.map(c => c.id === vid ? {...c, prices: {...c.prices, [seasonId]: val}} : c))
    await supabase.from('camper_prices').upsert({ camper_id: vid, season_id: seasonId, price: val }, { onConflict: 'camper_id,season_id' })
  }

  const toggleLongStay = async () => {
    const next = !longStayEnabled
    setLongStayEnabled(next)
    await supabase.from('app_settings').update({ value: String(next) }).eq('key', 'long_stay_enabled')
  }

  const addTier = async () => {
    const maxOrder = tiers.length ? Math.max(...tiers.map(t => t.sortOrder)) : 0
    const maxDays  = tiers.length ? Math.max(...tiers.map(t => t.minDays))  : 0
    const { data } = await supabase.from('long_stay_tiers')
      .insert({ min_days: maxDays + 7, discount_pct: 5, active: true, sort_order: maxOrder + 1 })
      .select('*').single()
    if (!data) return
    const newTier: LongStayTier = { id: (data as any).id, minDays: (data as any).min_days, discountPct: (data as any).discount_pct, active: (data as any).active, sortOrder: (data as any).sort_order }
    setTiers(ts => [...ts, newTier])
    setEditingTier(newTier)
  }

  const delTier = async (id: number) => {
    await supabase.from('long_stay_tiers').delete().eq('id', id)
    setTiers(ts => ts.filter(t => t.id !== id))
    if (editingTier?.id === id) setEditingTier(null)
  }

  const togTier = async (id: number) => {
    const tier = tiers.find(t => t.id === id)
    if (!tier) return
    const next = !tier.active
    setTiers(ts => ts.map(t => t.id === id ? {...t, active: next} : t))
    await supabase.from('long_stay_tiers').update({ active: next }).eq('id', id)
  }

  const saveTier = async () => {
    if (!editingTier) return
    await supabase.from('long_stay_tiers').update({ min_days: editingTier.minDays, discount_pct: editingTier.discountPct }).eq('id', editingTier.id)
    setTiers(ts => ts.map(t => t.id === editingTier.id ? {...t, ...editingTier} : t))
    setEditingTier(null)
  }

  const sortedTiers = [...tiers].sort((a,b)=>a.minDays-b.minDays)

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Árazás és szezonok</span>
        <span className="topbar-count">Aktív: <strong style={{color:curSeason.color}}>{curSeason.name}</strong></span>
      </div>
      <div className="content">
        <div className="table-card" style={{marginBottom:18}}>
          <div className="table-toolbar">
            <span style={{fontSize:12,fontWeight:600,color:'#555'}}>Jármű árak szezononként</span>
            <span className="toolbar-count">{campervans.length} jármű</span>
          </div>
          <table className="admin-table">
            <thead><tr>
              <th style={{width:46}}>Fotó</th>
              <th>Jármű</th>
              {seasons.map(s=>(
                <th key={s.id} style={{color:s.color,whiteSpace:'nowrap'}}>
                  {s.name}
                  {s.id===curSeason.id&&<span style={{fontSize:9,marginLeft:5,background:s.bg,color:s.color,padding:'1px 5px',borderRadius:9999,fontWeight:700}}>AKTÍV</span>}
                </th>
              ))}
            </tr></thead>
            <tbody>
              {campervans.map(c=>(
                <tr key={c.id}>
                  <td>
                    {c.imageUrl ? (
                      <div style={{width:46,height:34,borderRadius:6,overflow:'hidden',background:'#f0f0ec'}}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={c.imageUrl} alt="" style={{width:'100%',height:'100%',objectFit:'cover'}} onError={e=>{(e.target as HTMLImageElement).style.opacity='0'}}/>
                      </div>
                    ) : <div style={{width:46,height:34,borderRadius:6,background:'#f0f0ec'}}/>}
                  </td>
                  <td>
                    <div style={{fontSize:13,fontWeight:600,color:'#111'}}>{c.name}</div>
                    <div style={{fontSize:11,color:'#aaa'}}>{c.type}</div>
                  </td>
                  {seasons.map(s=>(
                    <td key={s.id}>
                      <PriceCell value={c.prices[s.id] ?? 0} onChange={v=>{void updVehicle(c.id, s.id, v)}}/>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{background:'#fff',border:'1px solid #ece9e4',borderRadius:12,padding:'20px 22px',marginBottom:18}}>
          <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:longStayEnabled?20:0}}>
            <div>
              <div style={{fontSize:14,fontWeight:700,color:'#111'}}>Hosszú tartózkodás kedvezmények</div>
              <div style={{fontSize:11,color:'#aaa',marginTop:2}}>Napszám szerint lépcsőzött árengedmények</div>
            </div>
            <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:8}}>
              <span style={{fontSize:12,color:'#888'}}>{longStayEnabled?'Bekapcsolva':'Kikapcsolva'}</span>
              <Toggle on={longStayEnabled} onChange={()=>void toggleLongStay()}/>
            </div>
          </div>
          {longStayEnabled && (
            <div style={{display:'flex',flexDirection:'column',gap:6}}>
              {sortedTiers.map(t=>{
                const isEditing = editingTier?.id===t.id
                return (
                  <div key={t.id} style={{border:`1.5px solid ${isEditing?'#1a3a2a':t.active?'#c8ddc8':'#e8e8e4'}`,borderRadius:10,overflow:'hidden'}}>
                    <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px',background:isEditing?'#f5faf5':t.active?'#f8fbf8':'#fafaf8'}}>
                      <Toggle on={t.active} onChange={()=>void togTier(t.id)}/>
                      {isEditing ? (
                        <span style={{fontSize:13,color:'#888',fontStyle:'italic'}}>Szerkesztés alatt…</span>
                      ) : (
                        <span style={{fontSize:13,fontWeight:600,color:t.active?'#111':'#aaa'}}>
                          <strong style={{color:t.active?'#1a3a2a':'#aaa'}}>{t.minDays}+ nap</strong>
                          <span style={{color:'#bbb',margin:'0 8px'}}>→</span>
                          <strong style={{color:t.active?'#1a5a1a':'#aaa'}}>{t.discountPct}% kedvezmény</strong>
                        </span>
                      )}
                      {!t.active&&!isEditing&&<span style={{fontSize:10,color:'#bbb',fontWeight:600,background:'#f0f0ec',padding:'2px 7px',borderRadius:9999,marginLeft:2}}>INAKTÍV</span>}
                      <div style={{marginLeft:'auto',display:'flex',gap:4}}>
                        {!isEditing&&<button className="act-btn edit" onClick={()=>setEditingTier({...t})} title="Szerkesztés"><span style={{width:13,height:13}}>{I.edit}</span></button>}
                        <button className="act-btn del" onClick={()=>void delTier(t.id)} title="Törlés"><span style={{width:13,height:13}}>{I.trash}</span></button>
                      </div>
                    </div>
                    {isEditing && editingTier && (
                      <div style={{padding:'14px 16px',borderTop:'1px solid #e8f0e8',background:'#fff',display:'flex',gap:12,alignItems:'flex-end',flexWrap:'wrap'}}>
                        <div className="fg" style={{flex:'1 1 120px'}}>
                          <label className="fl">Minimum napok</label>
                          <div style={{position:'relative'}}>
                            <input className="fi" type="number" min="1" value={editingTier.minDays} onChange={e=>setEditingTier(d=>d?{...d,minDays:+e.target.value}:d)} style={{paddingRight:40}}/>
                            <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:11,fontWeight:700,color:'#bbb',pointerEvents:'none'}}>nap+</span>
                          </div>
                        </div>
                        <div className="fg" style={{flex:'1 1 120px'}}>
                          <label className="fl">Kedvezmény mértéke</label>
                          <div style={{position:'relative'}}>
                            <input className="fi" type="number" min="0" max="100" value={editingTier.discountPct} onChange={e=>setEditingTier(d=>d?{...d,discountPct:+e.target.value}:d)} style={{paddingRight:24}}/>
                            <span style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',fontSize:11,fontWeight:700,color:'#bbb',pointerEvents:'none'}}>%</span>
                          </div>
                        </div>
                        <div style={{display:'flex',gap:6,flexShrink:0}}>
                          <button className="btn-ghost" style={{padding:'8px 14px',fontSize:12}} onClick={()=>setEditingTier(null)}>Mégsem</button>
                          <button className="btn-save" style={{padding:'8px 18px',fontSize:12}} onClick={()=>void saveTier()}>Mentés</button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
              <button onClick={()=>void addTier()} style={{display:'flex',alignItems:'center',gap:6,background:'transparent',border:'1.5px dashed #c8ddc8',borderRadius:10,padding:'10px 16px',fontSize:12,fontWeight:600,color:'#1a5a1a',cursor:'pointer',fontFamily:'inherit',marginTop:2}} onMouseEnter={e=>e.currentTarget.style.background='#f5faf5'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <span style={{width:13,height:13,display:'inline-flex'}}>{I.plus}</span> Új kedvezménysáv
              </button>
            </div>
          )}
        </div>

        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:14}}>
          {seasons.map(s=>(
            <SeasonCard key={s.id} season={s} isActive={s.id===curSeason.id}
              avgPrice={campervans.length ? Math.round(campervans.reduce((sum,c)=>sum+(c.prices[s.id]??0),0)/campervans.length) : 0}
              onSave={draft=>saveSeason(s.id,draft)}/>
          ))}
        </div>
      </div>
    </>
  )
}

// ── ClientsView ────────────────────────────────────────────────
function ClientsView() {
  const [search, setSearch]   = useState('')
  const [detail, setDetail]   = useState<Client|null>(null)
  const [sortKey, setSortKey] = useState('lastBooking')
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc')
  const [clients, setClients] = useState<Client[]>([])
  const [clientEdit, setClientEdit] = useState(false)
  const [clientForm, setClientForm] = useState({ name: '', phone: '' })
  const [addingNew, setAddingNew] = useState(false)
  const [newForm, setNewForm] = useState({ name: '', email: '', phone: '' })
  const [newErr, setNewErr] = useState<string|null>(null)
  useEffect(() => { dbLoadCustomers().then(setClients) }, [])

  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q) || (c.phone||'').includes(q)
  }).sort((a,b) => {
    const av = (a as any)[sortKey], bv = (b as any)[sortKey]
    if (av<bv) return sortDir==='asc'?-1:1
    if (av>bv) return sortDir==='asc'?1:-1
    return 0
  })

  const setSort = (k:string) => { if(sortKey===k) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortKey(k);setSortDir('desc')} }
  const SA = ({k}:{k:string}) => sortKey!==k ? null : <span style={{fontSize:9,marginLeft:3,opacity:0.7}}>{sortDir==='asc'?'▲':'▼'}</span>
  const initials = (n:string) => n.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase()

  const saveClientEdit = async () => {
    if (!detail?.id) return
    await supabase.from('customers').update({ name: clientForm.name, phone: clientForm.phone }).eq('id', detail.id)
    setClients(cs => cs.map(c => c.id === detail.id ? {...c, name: clientForm.name, phone: clientForm.phone} : c))
    setDetail(d => d ? {...d, name: clientForm.name, phone: clientForm.phone} : null)
    setClientEdit(false)
  }

  const deleteClient = async (id: string) => {
    if (!window.confirm('Biztosan törlöd ezt az ügyfelet? A hozzátartozó foglalások megmaradnak, de elveszítik az ügyfél hivatkozást.')) return
    await supabase.from('customers').delete().eq('id', id)
    setClients(cs => cs.filter(c => c.id !== id))
    setDetail(null)
    setClientEdit(false)
  }

  const saveNewClient = async () => {
    if (!newForm.name.trim()) { setNewErr('A név kötelező.'); return }
    if (!newForm.email.trim()) { setNewErr('Az email kötelező.'); return }
    setNewErr(null)
    const { data, error } = await supabase.from('customers').insert({ name: newForm.name.trim(), email: newForm.email.trim(), phone: newForm.phone.trim() || null }).select('id').single()
    if (error) { setNewErr(error.message); return }
    const newClient: Client = { id: (data as any).id, name: newForm.name.trim(), email: newForm.email.trim(), phone: newForm.phone.trim(), bookings: [], totalSpent: 0, lastBooking: '', bookingCount: 0 }
    setClients(cs => [newClient, ...cs])
    setNewForm({ name: '', email: '', phone: '' })
    setAddingNew(false)
  }

  return (
    <>
      <div className="topbar">
        <span className="topbar-title">Ügyfelek</span>
        <span className="topbar-count">{clients.length} ügyfél</span>
        <div className="topbar-right">
          <div className="search-wrap">
            <span className="search-icon">{I.search}</span>
            <input className="search-input" placeholder="Név, email, telefon..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
          <button className="btn-primary" onClick={()=>{setNewForm({name:'',email:'',phone:''});setNewErr(null);setAddingNew(true)}}>
            <span style={{width:14,height:14,marginRight:6}}>{I.plus}</span>Új ügyfél
          </button>
        </div>
      </div>
      <div className="content">
        <div className="table-card">
          <div className="table-toolbar"><span className="toolbar-count">{filtered.length} ügyfél</span></div>
          <div style={{overflowX:'auto'}}>
            <table className="admin-table" style={{minWidth:640}}>
              <thead><tr>
                <th>Név</th>
                <th>Email</th>
                <th style={{width:130}}>Telefon</th>
                <th style={{cursor:'pointer',width:80}} onClick={()=>setSort('bookingCount')}>Foglalás <SA k="bookingCount"/></th>
                <th style={{cursor:'pointer',width:130}} onClick={()=>setSort('lastBooking')}>Utolsó foglalás <SA k="lastBooking"/></th>
                <th style={{cursor:'pointer',width:140}} onClick={()=>setSort('totalSpent')}>Elköltött <SA k="totalSpent"/></th>
                <th style={{width:40}}></th>
              </tr></thead>
              <tbody>
                {filtered.map(c=>(
                  <tr key={c.email}>
                    <td>
                      <div style={{display:'flex',alignItems:'center',gap:10}}>
                        <div style={{width:30,height:30,borderRadius:'50%',background:'#e8f0e8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,color:'#1a5a2a',flexShrink:0}}>{initials(c.name)}</div>
                        <div>
                          <div style={{fontSize:13,fontWeight:600,color:'#111'}}>{c.name}</div>
                          {c.bookingCount>1&&<div style={{fontSize:10,color:'#1a5a2a',fontWeight:600}}>Visszatérő</div>}
                        </div>
                      </div>
                    </td>
                    <td style={{fontSize:13,color:'#555'}}>{c.email}</td>
                    <td style={{fontSize:13,color:'#888'}}>{c.phone||'—'}</td>
                    <td><div style={{fontSize:14,fontWeight:700,color:'#333',textAlign:'center'}}>{c.bookingCount}</div><div style={{fontSize:10,color:'#bbb',textAlign:'center'}}>db</div></td>
                    <td style={{fontSize:13,color:'#555',whiteSpace:'nowrap'}}>{c.lastBooking?fmtDate(c.lastBooking):'—'}</td>
                    <td><div style={{fontSize:13,fontWeight:700,color:c.totalSpent>0?'#1a5a1a':'#bbb'}}>{c.totalSpent>0?fmtFtFull(c.totalSpent):'—'}</div></td>
                    <td><button className="act-btn edit" onClick={()=>setDetail(c)} title="Részletek"><span style={{width:14,height:14}}>{I.edit}</span></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length===0&&<div style={{padding:'36px 20px',textAlign:'center',color:'#bbb',fontSize:14}}>Nincs találat.</div>}
        </div>
      </div>

      {detail && (
        <>
          <div className="drawer-overlay" onClick={()=>{setDetail(null);setClientEdit(false)}}/>
          <div className="drawer" style={{width:420}}>
            <div className="drawer-head">
              <div style={{display:'flex',alignItems:'center',gap:10,width:'100%'}}>
                <div style={{width:34,height:34,borderRadius:'50%',background:'#e8f0e8',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'#1a5a2a',flexShrink:0}}>{initials(detail.name)}</div>
                <div><div className="drawer-title">{detail.name}</div><span className="drawer-subtitle">{detail.email}</span></div>
                <button className="drawer-close" style={{marginLeft:'auto'}} onClick={()=>{setDetail(null);setClientEdit(false)}}><span style={{width:14,height:14}}>{I.x}</span></button>
              </div>
            </div>
            <div className="drawer-body">
              <div><div className="section-sep">Kapcsolati adatok</div>
                {clientEdit ? (
                  <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:10}}>
                    <div className="fg"><label className="fl">Név</label>
                      <input className="fi" value={clientForm.name} onChange={e=>setClientForm(f=>({...f,name:e.target.value}))} placeholder="Teljes név"/>
                    </div>
                    <div className="fg"><label className="fl">Telefon</label>
                      <input className="fi" type="tel" value={clientForm.phone} onChange={e=>setClientForm(f=>({...f,phone:e.target.value}))} placeholder="+36 30 ..."/>
                    </div>
                    <div className="fg"><label className="fl">Email</label>
                      <input className="fi" value={detail.email} disabled style={{opacity:0.5,cursor:'not-allowed'}}/>
                    </div>
                  </div>
                ) : (
                  <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:7}}>
                    {[['Név',detail.name],['Email',detail.email],['Telefon',detail.phone||'—']].map(([l,v])=>(
                      <div key={l} style={{display:'flex',justifyContent:'space-between',fontSize:13}}><span style={{color:'#888'}}>{l}</span><span style={{fontWeight:500,color:'#333'}}>{v}</span></div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{display:'flex',gap:10}}>
                {[['Foglalások',detail.bookingCount+' db'],['Elköltött',fmtFtFull(detail.totalSpent)]].map(([l,v])=>(
                  <div key={l} style={{flex:1,background:'#fafaf8',border:'1px solid #f0f0ec',borderRadius:8,padding:'12px 14px'}}>
                    <div style={{fontSize:10,color:'#aaa',fontWeight:600,textTransform:'uppercase',letterSpacing:'0.08em',marginBottom:4}}>{l}</div>
                    <div style={{fontSize:16,fontWeight:700,color:'#111'}}>{v}</div>
                  </div>
                ))}
              </div>
              <div><div className="section-sep">Foglalás előzmények</div>
                <div style={{marginTop:10,display:'flex',flexDirection:'column',gap:8}}>
                  {detail.bookings.slice().sort((a,b)=>b.from.localeCompare(a.from)).map(b=>{
                    const d = diffDays(b.from,b.to)
                    return (
                      <div key={b.id} style={{border:'1px solid #f0f0ec',borderRadius:8,padding:'10px 13px',background:'#fafaf8'}}>
                        <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                          <div><div style={{fontSize:12,fontWeight:600,color:'#111'}}>{b.camperName}</div><div style={{fontSize:11,color:'#aaa',marginTop:2}}>{fmtDate(b.from)} – {fmtDate(b.to)} · {d} nap</div></div>
                          <div style={{textAlign:'right'}}><BookingBadge status={b.status}/><div style={{fontSize:12,fontWeight:700,color:'#1a5a1a',marginTop:4}}>{fmtFtFull(d*b.pricePerDay)}</div></div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
            <div className="drawer-foot" style={{gap:8}}>
              {detail.id && <button className="btn-ghost" style={{color:'#c0392b',borderColor:'#fde',flex:'none'}} onClick={()=>void deleteClient(detail.id!)}>Törlés</button>}
              <div style={{flex:1}}/>
              {clientEdit ? (
                <>
                  <button className="btn-ghost" onClick={()=>setClientEdit(false)}>Mégsem</button>
                  <button className="btn-save" onClick={()=>void saveClientEdit()}>Mentés</button>
                </>
              ) : (
                <>
                  {detail.id && <button className="btn-ghost" onClick={()=>{setClientForm({name:detail.name,phone:detail.phone||''});setClientEdit(true)}}>Szerkesztés</button>}
                  <button className="btn-ghost" onClick={()=>setDetail(null)}>Bezárás</button>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {addingNew && (
        <>
          <div className="drawer-overlay" onClick={()=>setAddingNew(false)}/>
          <div className="drawer" style={{width:380}}>
            <div className="drawer-head">
              <div><div className="drawer-title">Új ügyfél</div><span className="drawer-subtitle">Vendég regisztráció nélkül</span></div>
              <button className="drawer-close" onClick={()=>setAddingNew(false)}><span style={{width:14,height:14}}>{I.x}</span></button>
            </div>
            <div className="drawer-body">
              <div className="fg"><label className="fl">Teljes név *</label>
                <input className="fi" value={newForm.name} onChange={e=>setNewForm(f=>({...f,name:e.target.value}))} placeholder="pl. Kovács Péter"/>
              </div>
              <div className="fg"><label className="fl">Email *</label>
                <input className="fi" type="email" value={newForm.email} onChange={e=>setNewForm(f=>({...f,email:e.target.value}))} placeholder="email@example.com"/>
              </div>
              <div className="fg"><label className="fl">Telefon</label>
                <input className="fi" type="tel" value={newForm.phone} onChange={e=>setNewForm(f=>({...f,phone:e.target.value}))} placeholder="+36 30 ..."/>
              </div>
              {newErr && <div style={{fontSize:12,color:'#c0392b',background:'#fdecea',borderRadius:7,padding:'8px 12px'}}>{newErr}</div>}
            </div>
            <div className="drawer-foot">
              <button className="btn-ghost" onClick={()=>setAddingNew(false)}>Mégsem</button>
              <button className="btn-save" onClick={()=>void saveNewClient()}>Létrehozás</button>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ── CampervansView ─────────────────────────────────────────────
function CampervansView() {
  const [campers, setCampers]         = useState<AdminCamper[]>([])
  const [types, setTypes]             = useState<DbType[]>([])
  const [capacities, setCapacities]   = useState<DbCapacity[]>([])
  const [features, setFeatures]       = useState<DbFeature[]>([])
  const [upcomingBookings, setUpcomingBookings] = useState<number>(0)

  const [loading, setLoading]         = useState(true)
  const [filter, setFilter]           = useState<'all' | 'active' | 'inactive'>('all')
  const [search, setSearch]           = useState('')
  const [editing, setEditing]         = useState<AdminCamper | null>(null)
  const [creating, setCreating]       = useState(false)
  const [deleting, setDeleting]       = useState<AdminCamper | null>(null)
  const [deleteLoading, setDeleteLoading] = useState(false)

  // Load everything on mount
  useEffect(() => {
    Promise.all([
      dbLoadCampers(),
      supabase.from('camper_types').select('id, name').order('sort_order').then(r => r.data ?? []),
      supabase.from('capacities').select('id, label').order('sort_order').then(r => r.data ?? []),
      supabase.from('features').select('id, name').order('id').then(r => r.data ?? []),
      supabase.from('bookings').select('id', { count: 'exact', head: true })
        .gte('start_date', new Date().toISOString().split('T')[0])
        .then(r => r.count ?? 0),
    ]).then(([cs, ts, caps, feats, bCount]) => {
      setCampers(cs)
      setTypes(ts as DbType[])
      setCapacities(caps as DbCapacity[])
      setFeatures(feats as DbFeature[])
      setUpcomingBookings(bCount as number)
      setLoading(false)
    })
  }, [])

  const filtered = campers.filter(c => {
    if (filter === 'active'   && !c.available) return false
    if (filter === 'inactive' &&  c.available) return false
    return c.name.toLowerCase().includes(search.toLowerCase()) ||
           (c.type_name ?? '').toLowerCase().includes(search.toLowerCase())
  })

  const [togglingId, setTogglingId]   = useState<string | null>(null)

  // ── CRUD — minden mutáció Server Action-on megy, service role kulccsal ──
  const handleUpdatePrice = async (id: string, price: number) => {
    setCampers(cs => cs.map(c => c.id === id ? { ...c, price_per_day: price } : c))
    await actionUpdatePrice(id, price)
  }

  const handleToggleAvailable = async (id: string, current: boolean) => {
    setTogglingId(id)
    const next = !current
    setCampers(cs => cs.map(c => c.id === id ? { ...c, available: next } : c))
    await actionToggleAvailable(id, next)
    setTogglingId(null)
  }

  const handleSave = async (draft: AdminCamper) => {
    const { error } = await actionSaveCamper(draft.id, {
      name: draft.name, slug: draft.slug, description: draft.description,
      available: draft.available, year: draft.year,
      wild_camping_suitable: draft.wild_camping_suitable,
      type_id: draft.type_id, capacity_id: draft.capacity_id,
      feature_ids: draft.feature_ids,
    })
    if (error) throw new Error(error)
    setCampers(cs => cs.map(c => c.id === draft.id ? draft : c))
  }

  const handleCreate = async (draft: AdminCamper) => {
    const { id, error } = await actionCreateCamper({
      name: draft.name, slug: draft.slug, description: draft.description,
      available: draft.available, year: draft.year,
      wild_camping_suitable: draft.wild_camping_suitable,
      type_id: draft.type_id, capacity_id: draft.capacity_id,
      feature_ids: draft.feature_ids,
    })
    if (error || !id) throw new Error(error ?? 'Nem sikerült létrehozni')
    setCampers(cs => [...cs, { ...draft, id }])
  }

  const handleDelete = async () => {
    if (!deleting) return
    setDeleteLoading(true)
    const { error } = await actionDeleteCamper(deleting.id)
    if (!error) setCampers(cs => cs.filter(c => c.id !== deleting.id))
    setDeleteLoading(false)
    setDeleting(null)
  }

  // ── Stats ──────────────────────────────────────────────────────
  const activeCnt   = campers.filter(c => c.available).length
  const inactiveCnt = campers.filter(c => !c.available).length
  const avgPrice    = campers.length ? Math.round(campers.reduce((s, c) => s + c.price_per_day, 0) / campers.length) : 0

  return (
    <>
      {/* Topbar */}
      <div className="topbar">
        <div>
          <span className="topbar-title">Lakóautók</span>
          <span className="topbar-count">({campers.length} jármű)</span>
        </div>
        <div className="topbar-right">
          <div className="search-wrap">
            <span className="search-icon">{I.search}</span>
            <input className="search-input" placeholder="Keresés..." value={search}
              onChange={e => setSearch(e.target.value)} />
          </div>
          <button className="btn-primary" onClick={() => setCreating(true)}>
            <span style={{ width: 14, height: 14, display: 'inline-flex' }}>{I.plus}</span>
            Új lakóautó
          </button>
        </div>
      </div>

      <div className="content">
        {/* Stats */}
        <div className="stats-row">
          <div className="stat-card">
            <div className="stat-label">Összes jármű</div>
            <div className="stat-value">{loading ? '–' : campers.length}</div>
            <div className="stat-sub">a flottában</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Aktív</div>
            <div className="stat-value stat-green">{loading ? '–' : activeCnt}</div>
            <div className="stat-sub">bérelhető jelenleg</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Közelgő foglalás</div>
            <div className="stat-value">{loading ? '–' : upcomingBookings}</div>
            <div className="stat-sub">mai naptól számítva</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Átlag napi ár</div>
            <div className="stat-value">{loading ? '–' : avgPrice.toLocaleString('hu-HU')}</div>
            <div className="stat-sub">Ft / nap</div>
          </div>
        </div>

        {/* Table */}
        <div className="table-card">
          <div className="table-toolbar">
            {(['all', 'active', 'inactive'] as const).map(f => (
              <button key={f} className={`filter-chip${filter === f ? ' on' : ''}`} onClick={() => setFilter(f)}>
                {f === 'all' ? 'Összes' : f === 'active' ? 'Aktív' : 'Szünetel'}
              </button>
            ))}
            <span className="toolbar-count">{filtered.length} találat</span>
          </div>

          {loading ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: '#bbb', fontSize: 13 }}>
              Betöltés...
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Lakóautó</th>
                  <th>Típus</th>
                  <th>Férőhely</th>
                  <th>Státusz</th>
                  <th>Napi ár</th>
                  <th style={{ width: 80 }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                        {c.image_url ? (
                          <div style={{ position: 'relative', width: 54, height: 38, flexShrink: 0, borderRadius: 6, overflow: 'hidden', background: '#f0f0ec' }}>
                            <Image src={c.image_url} alt={c.name} fill
                              style={{ objectFit: 'cover' }} sizes="54px" />
                          </div>
                        ) : (
                          <div style={{ width: 54, height: 38, borderRadius: 6, background: '#f0f0ec', flexShrink: 0 }} />
                        )}
                        <div>
                          <div className="camper-name">{c.name}</div>
                          <div className="camper-meta">{c.year ?? '–'} · {c.slug}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 13, color: '#555' }}>{c.type_name ?? '–'}</td>
                    <td style={{ fontSize: 13, color: '#555' }}>{c.capacity_label ? `${c.capacity_label} fő` : '–'}</td>
                    <td>
                      <StatusBadge
                        available={c.available}
                        onToggle={() => handleToggleAvailable(c.id, c.available)}
                        loading={togglingId === c.id}
                      />
                    </td>
                    <td>
                      <PriceCell value={c.price_per_day}
                        onChange={price => handleUpdatePrice(c.id, price)} />
                    </td>
                    <td>
                      <div className="action-cell">
                        <button className="act-btn edit" onClick={() => setEditing(c)} title="Szerkesztés">
                          <span style={{ width: 14, height: 14 }}>{I.edit}</span>
                        </button>
                        <button className="act-btn del" onClick={() => setDeleting(c)} title="Törlés">
                          <span style={{ width: 14, height: 14 }}>{I.trash}</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', color: '#bbb', padding: '32px 0', fontSize: 13 }}>
                      Nincs találat
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {creating && (
        <EditDrawer camper={BLANK} isNew onClose={() => setCreating(false)}
          onSave={handleCreate} types={types} capacities={capacities} features={features} />
      )}

      {editing && (
        <EditDrawer camper={editing} isNew={false} onClose={() => setEditing(null)}
          onSave={handleSave} types={types} capacities={capacities} features={features} />
      )}

      {deleting && (
        <DeleteModal name={deleting.name} loading={deleteLoading}
          onConfirm={handleDelete} onCancel={() => setDeleting(null)} />
      )}

    </>
  )
}

// ── App ────────────────────────────────────────────────────────
export default function AdminPage() {
  const [nav, setNav] = useState('campervans')

  const views: Record<string, React.ReactNode> = {
    campervans: <CampervansView />,
    extras:     <PlaceholderView title="Extrák"          icon={I.plus} />,
    bookings:   <BookingsView />,
    clients:    <ClientsView />,
    routes:     <PlaceholderView title="Útvonalak"       icon={I.routes} />,
    pricing:    <SeasonPricingView />,
    reviews:    <PlaceholderView title="Vélemények"      icon={I.reviews} />,
    settings:   <PlaceholderView title="Beállítások"     icon={I.settings} />,
  }

  return (
    <div className="admin-layout">
      <Sidebar active={nav} onNav={setNav} />
      <div className="admin-main">{views[nav]}</div>
    </div>
  )
}
