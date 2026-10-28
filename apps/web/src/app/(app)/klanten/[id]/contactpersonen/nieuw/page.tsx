import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CustomerDetail } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { ContactpersoonFormulier } from '@/components/contactpersoon-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweContactpersoon({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!mag(await getCurrentUser(), 'customers:update')) redirect(`/klanten/${id}`)

  let klant: CustomerDetail
  try {
    klant = await apiGet<CustomerDetail>(`/api/customers/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  return (
    <div>
      <Link href={`/klanten/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        {klant.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">Contactpersoon toevoegen</h1>
      <ContactpersoonFormulier klantId={id} />
    </div>
  )
}
