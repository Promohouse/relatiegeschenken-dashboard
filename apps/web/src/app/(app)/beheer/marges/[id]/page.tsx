import { redirect } from 'next/navigation'
import type { PriceRuleView } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { MargeregelFormulier } from '@/components/margeregel-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function MargeregelPagina({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:update')) redirect('/beheer/marges')

  const { id } = await params
  const regel = await apiGet<PriceRuleView>(`/api/price-rules/${id}`)

  return (
    <div className="max-w-xl">
      <h1 className="text-2xl font-bold tracking-tight">Margeregel</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Het bereik ligt vast. Wat de regel oplevert kan wel wijzigen; de wijziging komt in de
        auditlog.
      </p>
      <div className="mt-5">
        <MargeregelFormulier regel={regel} klanten={[]} terug="/beheer/marges" />
      </div>
    </div>
  )
}
