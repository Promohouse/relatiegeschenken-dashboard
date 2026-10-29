import { redirect } from 'next/navigation'
import type { PaginatedCustomers } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { OfferteFormulier } from '@/components/offerte-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweOffertePagina({
  searchParams,
}: {
  searchParams: Promise<{ klant?: string }>
}) {
  const user = await getCurrentUser()
  if (!mag(user, 'quotes:create')) redirect('/offertes')

  const { klant } = await searchParams
  const klanten = await apiGet<PaginatedCustomers>(
    '/api/customers?status=active&pageSize=100&sort=name',
  )

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Nieuwe offerte</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Het nummer wordt automatisch uitgegeven. Regels voeg je daarna toe; de offerte blijft tot
        die tijd een concept.
      </p>
      <div className="mt-5">
        <OfferteFormulier
          klanten={klanten.items.map((k) => ({ id: k.id, name: k.name }))}
          vasteKlantId={klant}
        />
      </div>
    </div>
  )
}
