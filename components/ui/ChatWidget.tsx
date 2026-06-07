'use client'

import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import Image from 'next/image'
import Link from 'next/link'
import { ConversationState } from '@/lib/chat/state'

interface Recommendation {
  slug: string
  text: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  capacity: string | null
}

interface AvailSlot {
  slug: string
  name: string
  image_url: string
  price_per_day: number
  type: string | null
  capacity: string | null
  from: string
  to: string
  days: number
}

interface ChatLink {
  label: string
  href: string
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  recommendations?: Recommendation[]
  availability?: AvailSlot[]
  links?: ChatLink[]
}

const INITIAL_MESSAGE: Message = {
  role: 'assistant',
  content: 'Szia! Segítek megtalálni a tökéletes lakóautót vagy útvonalat. Mire van szükséged?',
}

const Bubble = ({ children, role }: { children: React.ReactNode; role: 'user' | 'assistant' }) => (
  <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'}`}>
    <div
      className="max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed"
      style={
        role === 'user'
          ? { background: '#1a3a2a', color: '#fff', borderBottomRightRadius: '4px' }
          : { background: '#f5f5f0', color: '#222', borderBottomLeftRadius: '4px' }
      }
    >
      {children}
    </div>
  </div>
)

const MarkdownContent = ({ content }: { content: string }) => (
  <ReactMarkdown
    components={{
      a: ({ href, children }) => (
        <a href={href} className="underline font-medium" style={{ color: '#1a3a2a' }}>
          {children}
        </a>
      ),
      p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
    }}
  >
    {content}
  </ReactMarkdown>
)

const CamperCard = ({
  slug,
  name,
  image_url,
  type,
  capacity,
  price_per_day,
}: {
  slug: string
  name: string
  image_url: string
  type: string | null
  capacity: string | null
  price_per_day: number
}) => (
  <Link
    href={`/katalogus/${slug}`}
    className="group rounded-xl overflow-hidden flex flex-col"
    style={{ border: '1px solid #e8e8e4' }}
  >
    <div className="relative h-32 w-full">
      <Image
        src={image_url}
        alt={name}
        fill
        className="object-cover group-hover:scale-105 transition-transform duration-300"
        sizes="300px"
      />
    </div>
    <div className="px-3 py-2.5 bg-white flex flex-col gap-1">
      <span className="text-xs font-bold text-[#111]">{name}</span>
      <div className="flex items-center gap-2">
        {type && (
          <span className="text-[10px] uppercase tracking-wide text-[#888] bg-[#f5f5f0] px-1.5 py-0.5 rounded">
            {type}
          </span>
        )}
        {capacity && <span className="text-[10px] text-[#888]">{capacity} fő</span>}
      </div>
      <div className="flex items-center justify-between mt-0.5">
        <span className="text-xs font-bold" style={{ color: '#1a3a2a' }}>
          {price_per_day.toLocaleString('hu-HU')} Ft/nap
        </span>
        <span className="text-[10px] text-[#aaa] group-hover:text-[#1a3a2a] transition-colors">
          Megnézem →
        </span>
      </div>
    </div>
  </Link>
)

const CalendarIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="#1a3a2a"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="flex-shrink-0"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)

export default function ChatWidget() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([INITIAL_MESSAGE])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [chatState, setChatState] = useState<ConversationState>({})
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  async function handleSend() {
    const text = input.trim()
    if (!text || loading) return

    const userMsg: Message = { role: 'user', content: text }
    const history = messages.slice(1).map(({ role, content }) => ({ role, content }))
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text, history, state: chatState }),
      })
      const data = await res.json()

      if (data.updatedState) setChatState(data.updatedState)

      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.reply ?? '',
          recommendations: data.recommendations ?? [],
          availability: data.availability ?? [],
          links: data.links ?? [],
        },
      ])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Hiba történt, próbáld újra.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 flex flex-col items-end gap-3">
      {open && (
        <div
          className="w-[calc(100vw-2rem)] sm:w-[340px] h-[420px] sm:h-[560px] rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          style={{ background: '#fff', border: '1px solid #e8e8e4' }}
        >
          {/* Header */}
          <div
            className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
            style={{ background: '#1a3a2a' }}
          >
            <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center flex-shrink-0">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-white text-sm font-semibold leading-none">VanLife Asszisztens</p>
              <p className="text-white/50 text-[10px] mt-0.5 tracking-wide">Általában azonnal válaszol</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-6 h-6 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <svg
                width="10"
                height="10"
                viewBox="0 0 24 24"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" style={{ minHeight: 0 }}>
            {messages.map((msg, i) => (
              <div key={i} className="flex flex-col gap-2">
                {/* Text bubble */}
                {msg.content && (
                  <Bubble role={msg.role}>
                    {msg.role === 'assistant' ? (
                      <MarkdownContent content={msg.content} />
                    ) : (
                      msg.content
                    )}
                  </Bubble>
                )}

                {/* Availability slots */}
                {msg.availability && msg.availability.length > 0 && (
                  <div className="flex flex-col gap-3 mt-1">
                    {msg.availability.map((slot, si) => (
                      <div key={si} className="flex flex-col gap-1.5">
                        <div
                          className="flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs"
                          style={{ background: '#f0f5f2', border: '1px solid #c8ddd4' }}
                        >
                          <CalendarIcon />
                          <span className="font-semibold text-[#1a3a2a]">
                            {slot.from} – {slot.to}
                          </span>
                          <span
                            className="ml-auto text-[10px] font-medium px-1.5 py-0.5 rounded-full text-white"
                            style={{ background: '#1a3a2a' }}
                          >
                            {slot.days} nap
                          </span>
                        </div>
                        <CamperCard
                          slug={slot.slug}
                          name={slot.name}
                          image_url={slot.image_url}
                          type={slot.type}
                          capacity={slot.capacity}
                          price_per_day={slot.price_per_day}
                        />
                      </div>
                    ))}
                  </div>
                )}

                {/* Recommendations */}
                {msg.recommendations && msg.recommendations.map(rec => (
                  <div key={rec.slug} className="flex flex-col gap-2">
                    <Bubble role="assistant">
                      <MarkdownContent content={rec.text} />
                    </Bubble>
                    <CamperCard
                      slug={rec.slug}
                      name={rec.name}
                      image_url={rec.image_url}
                      type={rec.type}
                      capacity={rec.capacity}
                      price_per_day={rec.price_per_day}
                    />
                  </div>
                ))}

                {/* Links */}
                {msg.links && msg.links.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-1">
                    {msg.links.map((link, li) => (
                      <Link
                        key={li}
                        href={link.href}
                        className="text-xs px-3 py-1.5 rounded-full border transition-colors hover:bg-[#f0f5f2]"
                        style={{ borderColor: '#1a3a2a', color: '#1a3a2a' }}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div
                  className="px-3 py-2 rounded-2xl"
                  style={{ background: '#f5f5f0', borderBottomLeftRadius: '4px' }}
                >
                  <span className="flex gap-1 items-center h-4">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#999] animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#999] animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 rounded-full bg-[#999] animate-bounce" style={{ animationDelay: '300ms' }} />
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-3 py-3 border-t border-[#f0f0ec] flex-shrink-0">
            <div className="flex items-center gap-2 bg-[#f7f7f4] rounded-xl px-3 py-2">
              <input
                className="flex-1 bg-transparent text-sm text-[#222] placeholder-[#aaa] outline-none"
                placeholder="Írj üzenetet..."
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSend()}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-lg flex items-center justify-center transition-all flex-shrink-0"
                style={{ background: input.trim() && !loading ? '#1a3a2a' : '#e0e0da' }}
              >
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M22 2L11 13M22 2L15 22l-4-9-9-4 19-7z" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Float button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="w-14 h-14 rounded-full shadow-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95"
        style={{ background: '#1a3a2a' }}
        aria-label="Chat megnyitása"
      >
        {open ? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.5"
            strokeLinecap="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        )}
      </button>
    </div>
  )
}
