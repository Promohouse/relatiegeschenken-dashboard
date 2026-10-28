import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { PaymentTermView } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { BetalingsvoorwaardeFormulier } from '@/components/betalingsvoorwaarde-formulier'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

export default async function BetalingsvoorwaardeBewerken({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  if (!mag(await getCurrentUser(), 'settings:update')) redirect('/beheer/betalingsvoorwaarden')

  let term: PaymentTermView
  try {
    term = await apiGet<PaymentTermView>(`/api/payment-terms/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  return (
    <div>
      <Link
        href="/beheer/betalingsvoorwaarden"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Betalingsvoorwaarden
      </Link>

      <div className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{term.name}</h1>
          {term.isDefault && <Badge tone="rest">standaard</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-faint">
          {term.customerCount === 0
            ? 'Nog bij geen enkele klant ingesteld'
            : `Ingesteld bij ${term.customerCount} ${term.customerCount === 1 ? 'klant' : 'klanten'}`}
        </p>
      </div>

      <BetalingsvoorwaardeFormulier term={term} />
    </div>
  )
}
