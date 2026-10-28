import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CustomerDetail } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { PrijsafspraakFormulier } from '@/components/prijsafspraak-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuwePrijsafspraak({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!mag(await getCurrentUser(), 'customers:update')) redirect(`/klanten/${id}`)

  const klant = await apiGet<CustomerDetail>(`/api/customers/${id}`)

  return (
    <div>
      <Link
        href={`/klanten/${id}`}
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        {klant.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">Nieuwe prijsafspraak</h1>
      <PrijsafspraakFormulier klantId={id} />
    </div>
  )
}
