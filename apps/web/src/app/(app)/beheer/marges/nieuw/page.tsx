import { redirect } from 'next/navigation'
import type { PaginatedCustomers } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { MargeregelFormulier } from '@/components/margeregel-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweMargeregelPagina({
  searchParams,
}: {
  searchParams: Promise<{ klant?: string }>
}) {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:update')) redirect('/beheer/marges')

  const { klant } = await searchParams
  const klanten = await apiGet<PaginatedCustomers>(
    '/api/customers?status=active&pageSize=100&sort=name',
  )

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Nieuwe margeregel</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Een specifiekere regel gaat voor op een algemenere, en bij gelijke specificiteit wint de
        laagste voorrang.
      </p>
      <div className="mt-5">
        <MargeregelFormulier
          klanten={klanten.items.map((k) => ({ id: k.id, name: k.name }))}
          vasteKlantId={klant}
          terug={klant ? `/klanten/${klant}` : '/beheer/marges'}
        />
      </div>
    </div>
  )
}
