import type { Metadata } from 'next'
import './globals.css'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Camper Rent',
  description: 'Prémium lakóautó bérlés Magyarországon',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" className="antialiased">
      <body className="min-h-screen flex flex-col w-full" style={{ overflowX: 'clip' }}>
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
