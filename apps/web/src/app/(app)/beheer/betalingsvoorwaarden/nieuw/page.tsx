import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { BetalingsvoorwaardeFormulier } from '@/components/betalingsvoorwaarde-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweBetalingsvoorwaarde() {
  if (!mag(await getCurrentUser(), 'settings:update')) redirect('/beheer/betalingsvoorwaarden')

  return (
    <div>
      <Link
        href="/beheer/betalingsvoorwaarden"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Betalingsvoorwaarden
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">Nieuwe betalingsvoorwaarde</h1>
      <BetalingsvoorwaardeFormulier />
    </div>
  )
}
