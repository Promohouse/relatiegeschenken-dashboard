import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { PaginatedUsers, RoleSummary } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { getCurrentUser, mag } from '@/lib/session'

export default async function GebruikersPagina({
  searchParams,
}: {
  searchParams: Promise<{ search?: string; status?: string }>
}) {
  const user = await getCurrentUser()
  if (!mag(user, 'users:view')) redirect('/')

  const params = await searchParams
  const query = new URLSearchParams({
    ...(params.search ? { search: params.search } : {}),
    status: params.status ?? 'all',
    pageSize: '50',
  })

  const [data, rollen] = await Promise.all([
    apiGet<PaginatedUsers>(`/api/users?${query}`),
    apiGet<RoleSummary[]>('/api/roles'),
  ])

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Gebruikers</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {data.total} {data.total === 1 ? 'gebruiker' : 'gebruikers'} · {rollen.length} rollen
          </p>
        </div>

        <div className="flex items-end gap-2">
          {mag(user, 'users:create') && (
            <Link
              href="/beheer/gebruikers/nieuw"
              className="inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
            >
              Nieuwe gebruiker
            </Link>
          )}
          <form action="/beheer/gebruikers" className="flex items-end gap-2">
            <Input
              name="search"
              defaultValue={params.search ?? ''}
              placeholder="Naam of e-mailadres"
              aria-label="Gebruikers zoeken"
              className="w-60"
            />
            <Button type="submit" variant="secondary">
              Zoeken
            </Button>
          </form>
        </div>
      </div>

      <div className="mt-5 overflow-x-auto rounded border border-rule bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-rule">
            <tr>
              {['Naam', 'E-mailadres', 'Rollen', 'Tweefactor', 'Laatst ingelogd'].map((k) => (
                <th key={k} scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                  {k}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((g) => (
              <tr key={g.id} className="border-b border-rule last:border-0 hover:bg-sunk/60">
                <td className="px-4 py-2.5">
                  {mag(user, 'users:update') ? (
                    <Link href={`/beheer/gebruikers/${g.id}`} className="font-medium hover:text-accent">
                      {g.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{g.name}</span>
                  )}
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {!g.isActive && <Badge tone="rest">inactief</Badge>}
                    {g.isDemo && <Badge tone="wait">demo</Badge>}
                    {g.customerId && <Badge tone="rest">klantgebruiker</Badge>}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{g.email}</td>
                <td className="px-4 py-2.5">
                  {g.roles.length === 0 ? (
                    <span className="text-ink-faint">geen rol</span>
                  ) : (
                    <span className="flex flex-wrap gap-1">
                      {g.roles.map((r) => (
                        <Badge key={r.key} tone="ok">
                          {r.name}
                        </Badge>
                      ))}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-ink-soft">{g.twoFactorEnabled ? 'aan' : 'uit'}</td>
                <td className="px-4 py-2.5 text-ink-soft">
                  {g.lastLoginAt ? new Date(g.lastLoginAt).toLocaleDateString('nl-NL') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-sm text-ink-soft">
        {rollen.length} rollen ingesteld.{' '}
        <Link href="/beheer/rollen" className="font-medium text-accent hover:underline">
          Rollen en rechten beheren
        </Link>
      </p>
    </div>
  )
}
