import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CustomerDetail, PriceAgreementView } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { PrijsafspraakFormulier } from '@/components/prijsafspraak-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function PrijsafspraakBewerken({
  params,
}: {
  params: Promise<{ id: string; afspraakId: string }>
}) {
  const { id, afspraakId } = await params
  if (!mag(await getCurrentUser(), 'customers:update')) redirect(`/klanten/${id}`)

  let klant: CustomerDetail
  let afspraken: PriceAgreementView[]
  try {
    ;[klant, afspraken] = await Promise.all([
      apiGet<CustomerDetail>(`/api/customers/${id}`),
      apiGet<PriceAgreementView[]>(`/api/customers/${id}/prices`),
    ])
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const afspraak = afspraken.find((a) => a.id === afspraakId)
  if (!afspraak) notFound()

  return (
    <div>
      <Link
        href={`/klanten/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        {klant.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">Prijsafspraak wijzigen</h1>
      <PrijsafspraakFormulier klantId={id} afspraak={afspraak} />
    </div>
  )
}
