import type { Metadata } from 'next'
import './globals.css'
import PublicChrome from '@/components/layout/PublicChrome'
import PageHeader from '@/components/layout/PageHeader'

export const metadata: Metadata = {
  title: 'Camper Rent',
  description: 'Prémium lakóautó bérlés Magyarországon',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" className="antialiased">
      <body className="min-h-screen flex flex-col w-full" style={{ overflowX: 'clip' }}>
        <PageHeader />
        <main className="flex-1">{children}</main>
        <PublicChrome />
      </body>
    </html>
  )
}
