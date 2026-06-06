import type { Metadata } from 'next'
import './globals.css'
import Footer from '@/components/layout/Footer'

export const metadata: Metadata = {
  title: 'Camper Rent',
  description: 'Prémium lakóautó bérlés Magyarországon',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" className="h-full antialiased overflow-x-hidden">
      <body className="min-h-full flex flex-col overflow-x-hidden w-full">
        <main className="flex-1">{children}</main>
        <Footer />
      </body>
    </html>
  )
}
