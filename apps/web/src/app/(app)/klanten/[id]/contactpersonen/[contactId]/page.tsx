import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { CustomerDetail } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { ContactpersoonFormulier } from '@/components/contactpersoon-formulier'
import { ContactStatusKnop } from '@/components/contact-status-knop'
import { getCurrentUser, mag } from '@/lib/session'

export default async function ContactpersoonBewerken({
  params,
}: {
  params: Promise<{ id: string; contactId: string }>
}) {
  const { id, contactId } = await params
  if (!mag(await getCurrentUser(), 'customers:update')) redirect(`/klanten/${id}`)

  let klant: CustomerDetail
  try {
    klant = await apiGet<CustomerDetail>(`/api/customers/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const contact = klant.contacts.find((c) => c.id === contactId)
  if (!contact) notFound()

  return (
    <div>
      <Link href={`/klanten/${id}`} className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        {klant.name}
      </Link>
      <div className="mt-3 mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">
          {contact.firstName} {contact.lastName}
        </h1>
        <ContactStatusKnop klantId={id} contactId={contactId} isActief={contact.isActive} />
      </div>

      <ContactpersoonFormulier
        klantId={id}
        contactId={contactId}
        begin={{
          firstName: contact.firstName,
          lastName: contact.lastName,
          jobTitle: contact.jobTitle ?? '',
          email: contact.email ?? '',
          phone: contact.phone ?? '',
          isPrimary: contact.isPrimary,
        }}
      />
    </div>
  )
}
