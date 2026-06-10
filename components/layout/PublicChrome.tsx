'use client'

import { usePathname } from 'next/navigation'
import Footer from './Footer'
import ChatWidget from '@/components/ui/ChatWidget'

export default function PublicChrome() {
  const pathname = usePathname()
  if (pathname?.startsWith('/admin')) return null
  return (
    <>
      <Footer />
      <ChatWidget />
    </>
  )
}
