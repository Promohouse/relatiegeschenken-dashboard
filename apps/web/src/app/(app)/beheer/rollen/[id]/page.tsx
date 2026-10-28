import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { PermissionGroup, RoleDetail } from '@rgh/contracts'
import { ApiError, apiGet } from '@/lib/api'
import { RolFormulier } from '@/components/rol-formulier'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

export default async function RolBewerken({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!mag(await getCurrentUser(), 'users:update')) redirect('/beheer/rollen')

  let rol: RoleDetail
  try {
    rol = await apiGet<RoleDetail>(`/api/roles/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }
  const groepen = await apiGet<PermissionGroup[]>('/api/roles/permissions')

  return (
    <div>
      <Link href="/beheer/rollen" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Rollen
      </Link>

      <div className="mt-3 mb-6">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{rol.name}</h1>
          {rol.isSystem && <Badge tone="rest">systeemrol</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-faint">
          {rol.userCount === 0
            ? 'Nog aan niemand toegekend'
            : `Toegekend aan ${rol.userCount} ${rol.userCount === 1 ? 'gebruiker' : 'gebruikers'}`}
        </p>
      </div>

      <RolFormulier groepen={groepen} rol={rol} />
    </div>
  )
}
