'use client'

import { useEffect, useRef, useState } from 'react'

const STATS = [
  { value: 10, suffix: '', label: 'Év tapasztalat' },
  { value: 5000, suffix: '+', label: 'Elégedett ügyfél' },
  { value: 28, suffix: '', label: 'Ország' },
  { value: 10, suffix: '', label: 'Lakóautó a flottában' },
]

function useCountUp(target: number, duration = 1800, triggered: boolean) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!triggered) return
    let start = 0
    const step = target / (duration / 16)
    const timer = setInterval(() => {
      start += step
      if (start >= target) {
        setCount(target)
        clearInterval(timer)
      } else {
        setCount(Math.floor(start))
      }
    }, 16)
    return () => clearInterval(timer)
  }, [triggered, target, duration])

  return count
}

function StatItem({ value, suffix, label, triggered }: { value: number; suffix: string; label: string; triggered: boolean }) {
  const count = useCountUp(value, 1600, triggered)
  return (
    <div className="text-center">
      <div className="text-4xl font-extrabold text-white mb-1">
        {count.toLocaleString('hu-HU')}{suffix}
      </div>
      <div className="text-xs tracking-[0.18em] uppercase text-white/50">{label}</div>
    </div>
  )
}

export default function StatsBanner() {
  const ref = useRef<HTMLElement>(null)
  const [triggered, setTriggered] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) setTriggered(true) },
      { threshold: 0.4 }
    )
    if (ref.current) observer.observe(ref.current)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={ref} className="bg-[#1a3a2a] py-12">
      <div className="max-w-[1300px] mx-auto px-4 md:px-10 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
        {STATS.map(s => (
          <StatItem key={s.label} {...s} triggered={triggered} />
        ))}
      </div>
    </section>
  )
}
