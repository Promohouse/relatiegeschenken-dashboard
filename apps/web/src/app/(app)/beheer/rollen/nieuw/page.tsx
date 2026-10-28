import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { PermissionGroup } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { RolFormulier } from '@/components/rol-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweRol() {
  if (!mag(await getCurrentUser(), 'users:update')) redirect('/beheer/rollen')
  const groepen = await apiGet<PermissionGroup[]>('/api/roles/permissions')

  return (
    <div>
      <Link href="/beheer/rollen" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Rollen
      </Link>
      <h1 className="mt-3 mb-6 text-2xl font-bold tracking-tight">Nieuwe rol</h1>
      <RolFormulier groepen={groepen} />
    </div>
  )
}
