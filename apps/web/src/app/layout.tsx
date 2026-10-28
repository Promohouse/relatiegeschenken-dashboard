import type { Metadata } from 'next'
import { Source_Sans_3, IBM_Plex_Mono } from 'next/font/google'
import './globals.css'

const sans = Source_Sans_3({ subsets: ['latin'], variable: '--font-sans', display: 'swap' })
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Relatiegeschenken Hub',
  description: 'Intern dashboard voor offertes, orders, drukproeven en inkoop',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="nl" className={`${sans.variable} ${mono.variable}`}>
      <body className="font-[family-name:var(--font-sans)] antialiased">{children}</body>
    </html>
  )
}
