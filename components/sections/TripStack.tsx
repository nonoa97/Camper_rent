'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'

interface Trip {
  id: string
  name: string
  days: number
  image: string
}

const CLIP   = 'polygon(38px 0, 100% 0, calc(100% - 38px) 100%, 0 100%)'
const SPRING = { type: 'spring' as const, stiffness: 360, damping: 32, mass: 0.95 }

// For far background cards that would otherwise cross the entire stack:
// fade out at old position → instant x jump → fade in at new position.
const WRAP_T = {
  duration: 0.5,
  times:    [0, 0.38, 0.39, 1] as number[],
  ease:     'easeInOut' as const,
}

interface Layout {
  desktop:   boolean
  cardW:     string
  cardL:     string
  cardH:     number
  wrapH:     number
  peekNear:  number
  peekFar:   number
  dragMax:   number
  threshold: number
}

function getLayout(cw: number): Layout {
  const desktop = cw >= 700
  return {
    desktop,
    cardW:    desktop ? '40%' : '66%',
    cardL:    desktop ? '30%' : '17%',
    cardH:    desktop ? 400   : 280,
    wrapH:    desktop ? 460   : 320,
    peekNear: desktop ? 185   : 72,
    peekFar:  desktop ? 310   : 72,
    dragMax:  desktop ? 225   : 120,
    threshold:desktop ? 78    : 55,
  }
}

interface Pos {
  x:       number
  scale:   number
  opacity: number
  rotate:  number
  zIndex:  number
}

function slotPos(slot: number, n: number, L: Layout): Pos {
  const { peekNear, peekFar, dragMax, desktop } = L

  if (slot === 0)   return { x: 0,        scale: 1,    opacity: 1,    rotate: 0,   zIndex: 40 }
  if (slot === 1)   return { x: peekNear, scale: 0.82, opacity: 0.72, rotate: 5,   zIndex: 30 }
  if (slot === n-1) return { x:-peekNear, scale: 0.82, opacity: 0.72, rotate: -5,  zIndex: 20 }

  if (desktop && n >= 5) {
    if (slot === 2)   return { x: peekFar,  scale: 0.60, opacity: 0.46, rotate: 10,  zIndex: 25 }
    if (slot === n-2) return { x:-peekFar,  scale: 0.60, opacity: 0.46, rotate: -10, zIndex: 10 }
  }

  // Off-stack: invisible, parked just outside the visible area on the correct side
  const right = slot > 0 && slot <= Math.floor(n / 2)
  const hx    = right ? peekNear + dragMax * 0.6 : -(peekNear + dragMax * 0.6)
  return { x: hx, scale: 0.55, opacity: 0, rotate: right ? 10 : -10, zIndex: 5 }
}

// A "wrap-around" is when a far background card crosses from one far side to the other.
// This only applies to desktop where far cards are visible.
function isFarRight(slot: number, n: number) { return slot >= 2 && slot <= Math.floor(n / 2) }
function isFarLeft (slot: number, n: number) { return slot >  Math.floor(n / 2) && slot <= n - 2 }

function isWrapAround(prev: number, next: number, n: number): boolean {
  if (prev === next) return false
  return (isFarRight(prev, n) && isFarLeft(next, n)) ||
         (isFarLeft(prev, n)  && isFarRight(next, n))
}

export default function TripStack({ trips }: { trips: Trip[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const [cw, setCw]  = useState(375)
  const n = trips.length

  // Tracks each card's slot from the previous render so we can detect wrap-around jumps
  const prevSlots = useRef<Map<string, number>>(new Map())

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    setCw(el.offsetWidth)
    const ro = new ResizeObserver(() => setCw(el.offsetWidth))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Run AFTER each render so prevSlots reflects the state before the NEXT activeIdx change
  useEffect(() => {
    trips.forEach((trip, tripIdx) => {
      prevSlots.current.set(trip.id, (tripIdx - activeIdx + n) % n)
    })
  }, [activeIdx, trips, n])

  const L = getLayout(cw)

  function go(dir: 'left' | 'right') {
    setActiveIdx(i => dir === 'left' ? (i + 1) % n : (i - 1 + n) % n)
  }

  const base = {
    position: 'absolute' as const,
    width:    L.cardW,
    height:   `${L.cardH}px`,
    left:     L.cardL,
    top:      '20px',
    clipPath: CLIP,
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full overflow-hidden select-none"
      style={{ height: `${L.wrapH}px` }}
    >
      {trips.map((trip, tripIdx) => {
        const slot     = (tripIdx - activeIdx + n) % n
        const pos      = slotPos(slot, n, L)
        const prevSlot = prevSlots.current.get(trip.id) ?? slot   // first render: same slot → no animation
        const prevPos  = slotPos(prevSlot, n, L)
        const wrapping = isWrapAround(prevSlot, slot, n) && L.desktop

        const isActive    = slot === 0
        const isNearRight = slot === 1
        const isNearLeft  = slot === n - 1

        // Wrap-around cards use a 4-keyframe sequence so they never travel across the stack:
        //   [current] → [fade to 0] → [invisible at new x] → [fade to target opacity]
        // All other cards use a single spring.
        const animateProps = wrapping
          ? {
              opacity: [prevPos.opacity, 0,          0,        pos.opacity],
              x:       [prevPos.x,       prevPos.x,  pos.x,    pos.x      ],
              scale:   [prevPos.scale,   prevPos.scale, pos.scale, pos.scale],
              rotate:  [prevPos.rotate,  prevPos.rotate, pos.rotate, pos.rotate],
            }
          : { x: pos.x, scale: pos.scale, opacity: pos.opacity, rotate: pos.rotate }

        return (
          <motion.div
            key={trip.id}                        // stable identity — this card IS this trip
            animate={animateProps as any}        // 'as any' needed for the union of scalar vs array shapes
            initial={false}
            transition={wrapping ? WRAP_T : SPRING}
            style={{
              ...base,
              zIndex: pos.zIndex,
              cursor: isActive ? 'grab' : (L.desktop && (isNearRight || isNearLeft) ? 'pointer' : 'default'),
            }}
            drag={isActive ? 'x' : false}
            dragConstraints={{ left: -L.dragMax, right: L.dragMax }}
            dragElastic={0.08}
            dragMomentum={false}
            dragSnapToOrigin
            whileDrag={{ cursor: 'grabbing' }}
            onClick={
              L.desktop && !isActive && (isNearRight || isNearLeft)
                ? () => go(isNearRight ? 'left' : 'right')
                : undefined
            }
            onDragEnd={
              isActive
                ? (_, info) => {
                    if      (info.offset.x < -L.threshold) go('left')
                    else if (info.offset.x >  L.threshold) go('right')
                  }
                : undefined
            }
          >
            <Image
              src={trip.image}
              alt={trip.name}
              fill
              sizes={L.desktop ? '40vw' : '66vw'}
              className="object-cover"
              priority={isActive}
              draggable={false}
            />

            {isActive ? (
              <>
                {/* Cinematic gradient — strong at bottom, dissolves toward sky */}
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.90) 0%, rgba(0,0,0,0.52) 38%, rgba(0,0,0,0.12) 65%, transparent 100%)' }}
                />

                <Link href="/utazasok" className="absolute inset-0" onClick={e => e.stopPropagation()} />

                {/* Text block — elevated above the very bottom for breathing room */}
                <div
                  className="absolute bottom-0 left-0 right-0 pointer-events-none"
                  style={{
                    padding: L.desktop
                      ? '0 52px 38px 30px'
                      : '0 44px 26px 22px',
                  }}
                >
                  {/* Category label */}
                  <p
                    className="text-white/45 font-medium uppercase tracking-[0.32em] mb-2"
                    style={{ fontSize: L.desktop ? '9px' : '7.5px' }}
                  >
                    Road Trip
                  </p>

                  {/* Hero title */}
                  <h3
                    className="text-white font-black uppercase leading-[0.96] tracking-tight mb-3"
                    style={{ fontSize: L.desktop ? '34px' : '21px' }}
                  >
                    {trip.name}
                  </h3>

                  {/* Duration */}
                  <p
                    className="text-white/50 font-medium uppercase tracking-[0.24em] mb-3"
                    style={{ fontSize: L.desktop ? '9px' : '7.5px' }}
                  >
                    ● {trip.days} nap
                  </p>

                  {/* Subtle CTA */}
                  <p
                    className="text-white/35 font-medium uppercase tracking-[0.2em]"
                    style={{ fontSize: L.desktop ? '8px' : '7px' }}
                  >
                    → Fedezd fel
                  </p>
                </div>
              </>
            ) : (
              /* Preview cards: subtle cinematic tint, not flat black */
              <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.50) 0%, rgba(0,0,0,0.15) 55%, transparent 100%)' }}
              />
            )}
          </motion.div>
        )
      })}

      {L.desktop && (
        <>
          <button onClick={() => go('right')}
            className="absolute top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-white/90 hover:bg-white border border-[#e6e4df] shadow-md flex items-center justify-center text-[#333] text-xl transition-all hover:shadow-lg"
            style={{ left: `max(8px, calc(${L.cardL} - ${L.peekFar}px))` }}>
            ‹
          </button>
          <button onClick={() => go('left')}
            className="absolute top-1/2 -translate-y-1/2 z-50 w-11 h-11 rounded-full bg-white/90 hover:bg-white border border-[#e6e4df] shadow-md flex items-center justify-center text-[#333] text-xl transition-all hover:shadow-lg"
            style={{ right: `max(8px, calc(${L.cardL} - ${L.peekFar}px))` }}>
            ›
          </button>
        </>
      )}


    </div>
  )
}
