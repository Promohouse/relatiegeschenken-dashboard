import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { RoleSummary } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

export default async function RollenPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'users:view')) redirect('/')

  const rollen = await apiGet<RoleSummary[]>('/api/roles')
  const magWijzigen = mag(user, 'users:update')

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Rollen</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Rechten horen bij een rol. Ze staan als{' '}
            <code className="font-[family-name:var(--font-mono)] text-xs">module:actie</code> in de
            database, dus aanpassen hoeft geen nieuwe versie van de software.
          </p>
        </div>
        {magWijzigen && (
          <Link
            href="/beheer/rollen/nieuw"
            className="inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Nieuwe rol
          </Link>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded border border-rule bg-surface">
        {rollen.map((rol) => (
          <div key={rol.key} className="flex items-start justify-between gap-4 border-b border-rule p-4 last:border-0">
            <div className="min-w-0">
              <p className="font-medium">
                {magWijzigen ? (
                  <Link href={`/beheer/rollen/${rol.id}`} className="hover:text-accent">
                    {rol.name}
                  </Link>
                ) : (
                  rol.name
                )}
                {rol.isSystem && (
                  <Badge tone="rest" className="ml-2">
                    systeemrol
                  </Badge>
                )}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-xs text-ink-faint">{rol.key}</p>
              {rol.description && <p className="mt-1 text-sm text-ink-soft">{rol.description}</p>}
            </div>
            <p className="shrink-0 text-sm text-ink-soft tabular">
              {rol.permissions.length} {rol.permissions.length === 1 ? 'recht' : 'rechten'}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
