import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import type { RoleSummary } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { GebruikerFormulier } from '@/components/gebruiker-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function NieuweGebruiker() {
  if (!mag(await getCurrentUser(), 'users:create')) redirect('/beheer/gebruikers')
  const rollen = await apiGet<RoleSummary[]>('/api/roles')

  return (
    <div>
      <Link href="/beheer/gebruikers" className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={14} aria-hidden />
        Gebruikers
      </Link>
      <h1 className="mt-3 text-2xl font-bold tracking-tight">Nieuwe gebruiker</h1>
      <p className="mt-1 mb-6 max-w-xl text-sm text-ink-soft">
        Zelf een account aanmaken kan niet; dit is de enige weg. Het beginwachtwoord stel je hier
        in en geef je veilig door.
      </p>
      <GebruikerFormulier rollen={rollen} />
    </div>
  )
}
