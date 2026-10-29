import type { Metadata } from 'next'
import { Source_Sans_3, IBM_Plex_Mono } from 'next/font/google'
import { getCurrentUser } from '@/lib/session'
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // De voorkeur komt van de server, niet uit de browser: dan staat het scherm
  // meteen goed in plaats van eerst even in de verkeerde kleur.
  const user = await getCurrentUser()
  const thema =
    user?.themePreference === 'DARK' ? 'dark'
    : user?.themePreference === 'LIGHT' ? 'light'
    : undefined

  return (
    <html lang="nl" data-theme={thema} className={`${sans.variable} ${mono.variable}`}>
      <body className="font-[family-name:var(--font-sans)] antialiased">{children}</body>
    </html>
  )
}
