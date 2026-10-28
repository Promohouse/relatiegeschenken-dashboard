import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { PaymentTermView } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { KlantFormulier } from '@/components/klant-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweKlant() {
  const user = await getCurrentUser()
  if (!mag(user, 'customers:create')) redirect('/klanten')

  const termen = await apiGet<PaymentTermView[]>('/api/payment-terms/selectable')

  return (
    <div>
      <Link href="/klanten" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Klanten
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Nieuwe klant</h1>
      <p className="mt-1 mb-6 text-sm text-ink-soft">
        Contactpersonen en adressen voeg je toe zodra de klant bestaat.
      </p>
      <KlantFormulier betaaltermijnen={termen} />
    </div>
  )
}
