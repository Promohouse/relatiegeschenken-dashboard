import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CustomerDetail } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { AdresFormulier } from '@/components/adres-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function AdresBewerken({
  params,
}: {
  params: Promise<{ id: string; addressId: string }>
}) {
  const { id, addressId } = await params
  if (!mag(await getCurrentUser(), 'customers:update')) redirect(`/klanten/${id}`)

  let klant: CustomerDetail
  try {
    klant = await apiGet<CustomerDetail>(`/api/customers/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const adres = klant.addresses.find((a) => a.id === addressId)
  if (!adres) notFound()

  return (
    <div>
      <Link href={`/klanten/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        {klant.name}
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">Adres wijzigen</h1>

      <AdresFormulier
        klantId={id}
        adresId={addressId}
        begin={{
          type: adres.type,
          label: adres.label ?? '',
          attention: adres.attention ?? '',
          street: adres.street,
          houseNumber: adres.houseNumber ?? '',
          postalCode: adres.postalCode,
          city: adres.city,
          country: adres.country,
          isDefault: adres.isDefault,
        }}
      />
    </div>
  )
}
