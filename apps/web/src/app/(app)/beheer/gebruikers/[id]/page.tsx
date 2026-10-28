import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { RoleSummary, UserSummary } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { GebruikerFormulier } from '@/components/gebruiker-formulier'
import { GebruikerStatusKnop } from '@/components/gebruiker-status-knop'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

export default async function GebruikerBewerken({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const ik = await getCurrentUser()
  if (!mag(ik, 'users:update')) redirect('/beheer/gebruikers')

  let gebruiker: UserSummary
  try {
    gebruiker = await apiGet<UserSummary>(`/api/users/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }
  const rollen = await apiGet<RoleSummary[]>('/api/roles')

  return (
    <div>
      <Link href="/beheer/gebruikers" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Gebruikers
      </Link>

      <div className="mt-3 mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{gebruiker.name}</h1>
            {!gebruiker.isActive && <Badge tone="rest">inactief</Badge>}
            {gebruiker.id === ik?.id && <Badge tone="ok">jij</Badge>}
          </div>
          <p className="mt-1 text-sm text-ink-faint">{gebruiker.email}</p>
        </div>
        <GebruikerStatusKnop
          gebruikerId={gebruiker.id}
          isActief={gebruiker.isActive}
          isIkzelf={gebruiker.id === ik?.id}
        />
      </div>

      <GebruikerFormulier
        rollen={rollen}
        gebruikerId={gebruiker.id}
        begin={{
          name: gebruiker.name,
          email: gebruiker.email,
          roleKeys: gebruiker.roles.map((r) => r.key),
        }}
      />
    </div>
  )
}
