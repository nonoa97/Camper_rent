'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface BookingRange {
  start: Date
  end: Date
}

const MONTHS = [
  'Január','Február','Március','Április','Május','Június',
  'Július','Augusztus','Szeptember','Október','November','December',
]
const DAYS = ['H','K','Sze','Cs','P','Szo','V']

function isBooked(date: Date, bookings: BookingRange[]): boolean {
  const t = date.getTime()
  return bookings.some(b => t >= b.start.getTime() && t < b.end.getTime())
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function isRangeStart(date: Date, bookings: BookingRange[]) {
  return bookings.some(b => sameDay(date, b.start))
}

function isRangeEnd(date: Date, bookings: BookingRange[]) {
  return bookings.some(b => {
    const lastBooked = new Date(b.end)
    lastBooked.setDate(lastBooked.getDate() - 1)
    return sameDay(date, lastBooked)
  })
}

function MonthGrid({ year, month, bookings }: { year: number; month: number; bookings: BookingRange[] }) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const firstDay = new Date(year, month, 1)
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7 // 0 = Monday

  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div>
      <p className="text-sm font-semibold text-[#111] text-center mb-4">
        {MONTHS[month]} {year}
      </p>
      <div className="grid grid-cols-7 gap-x-1.5 mb-1.5">
        {DAYS.map(d => (
          <div key={d} className="text-center text-[10px] text-[#bbb] font-semibold py-1 uppercase tracking-wide">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-x-1.5 gap-y-[10px]">
        {cells.map((day, i) => {
          if (!day) return <div key={`e${i}`} />
          const date = new Date(year, month, day)
          date.setHours(0, 0, 0, 0)
          const booked = isBooked(date, bookings)
          const past = date < today
          const isToday = sameDay(date, today)
          const rangeStart = isRangeStart(date, bookings)
          const rangeEnd = isRangeEnd(date, bookings)
          const singleDay = rangeStart && rangeEnd

          let rounding = 'rounded-[8px]'
          if (booked && !past) {
            if (singleDay) rounding = 'rounded-[8px]'
            else if (rangeStart) rounding = 'rounded-l-[8px] rounded-r-none'
            else if (rangeEnd) rounding = 'rounded-l-none rounded-r-[8px]'
            else rounding = 'rounded-none'
          }

          return (
            <div
              key={day}
              className={[
                'relative h-9 flex items-center justify-center text-sm select-none',
                rounding,
                past && !isToday ? 'text-[#d8d8d8]' : '',
                !past && booked ? 'bg-[#1a3a2a] text-white' : '',
                !past && !booked ? 'text-[#222]' : '',
                isToday ? 'font-bold' : '',
              ].join(' ')}
            >
              {isToday && (
                <span className="absolute inset-0 m-auto w-7 h-7 rounded-full ring-1 ring-[#1a3a2a] flex items-center justify-center" />
              )}
              <span className="relative z-10">{day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function AvailabilityCalendar({ camperSlug }: { camperSlug: string }) {
  const today = new Date()
  const [offset, setOffset] = useState(0)
  const [bookings, setBookings] = useState<BookingRange[]>([])

  useEffect(() => {
    async function fetchBookings() {
      const { data } = await supabase
        .from('bookings')
        .select('start_date, end_date, campers!inner(slug)')
        .eq('campers.slug', camperSlug)
        .eq('status', 'confirmed')
        .gt('end_date', today.toISOString().split('T')[0])

      if (data) {
        setBookings(data.map((b: any) => ({
          start: new Date(b.start_date),
          end:   new Date(b.end_date),
        })))
      }
    }
    fetchBookings()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camperSlug])

  const m1 = new Date(today.getFullYear(), today.getMonth() + offset, 1)
  const m2 = new Date(today.getFullYear(), today.getMonth() + offset + 1, 1)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <span className="text-[11px] tracking-[0.22em] uppercase text-[#666]">Elérhetőség</span>
        <div className="flex items-center">
          <button
            onClick={() => setOffset(o => Math.max(0, o - 1))}
            disabled={offset === 0}
            className="w-8 h-8 rounded-full border border-[#e6e4df] flex items-center justify-center text-lg text-[#555] hover:border-[#aaa] disabled:opacity-25 disabled:cursor-not-allowed transition-colors"
          >
            ‹
          </button>
          <button
            onClick={() => setOffset(o => o + 1)}
            className="w-8 h-8 rounded-full border border-[#e6e4df] flex items-center justify-center text-lg text-[#555] hover:border-[#aaa] transition-colors"
          >
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-12">
        <MonthGrid year={m1.getFullYear()} month={m1.getMonth()} bookings={bookings} />
        <div className="hidden md:block">
          <MonthGrid year={m2.getFullYear()} month={m2.getMonth()} bookings={bookings} />
        </div>
      </div>

      <div className="flex gap-6 mt-6 pt-5 border-t border-[#e6e4df]">
        <div className="flex items-center gap-2 text-xs text-[#777]">
          <span className="w-3.5 h-3.5 rounded-sm bg-white border border-[#ddd] flex-shrink-0" />
          Szabad
        </div>
        <div className="flex items-center gap-2 text-xs text-[#777]">
          <span className="w-3.5 h-3.5 rounded-sm bg-[#1a3a2a] flex-shrink-0" />
          Foglalt
        </div>
      </div>
    </div>
  )
}
