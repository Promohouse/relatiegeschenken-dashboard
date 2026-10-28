import Link from 'next/link'
import { Search } from 'lucide-react'
import type { PaginatedCustomers } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

type Zoekparams = {
  search?: string
  status?: string
  sort?: string
  direction?: string
  page?: string
}

/** Kolomkop die op zichzelf de sorteervolgorde omdraait. */
function Kop({
  veld, label, params, uitlijnen = 'left',
}: {
  veld: string
  label: string
  params: Zoekparams
  uitlijnen?: 'left' | 'right'
}) {
  const actief = (params.sort ?? 'name') === veld
  const nieuweRichting = actief && (params.direction ?? 'asc') === 'asc' ? 'desc' : 'asc'
  const query = new URLSearchParams({
    ...(params.search ? { search: params.search } : {}),
    ...(params.status && params.status !== 'all' ? { status: params.status } : {}),
    sort: veld,
    direction: nieuweRichting,
  })

  return (
    <th
      scope="col"
      className={`px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint ${
        uitlijnen === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      <Link href={`/klanten?${query}`} className="hover:text-ink">
        {label}
        {actief && <span aria-hidden> {(params.direction ?? 'asc') === 'asc' ? '↑' : '↓'}</span>}
      </Link>
    </th>
  )
}

export default async function KlantenPagina({
  searchParams,
}: {
  searchParams: Promise<Zoekparams>
}) {
  const params = await searchParams
  const query = new URLSearchParams({
    ...(params.search ? { search: params.search } : {}),
    status: params.status ?? 'all',
    sort: params.sort ?? 'name',
    direction: params.direction ?? 'asc',
    page: params.page ?? '1',
    pageSize: '25',
  })

  const data = await apiGet<PaginatedCustomers>(`/api/customers?${query}`)
  const statusNu = params.status ?? 'all'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Klanten</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {data.total} {data.total === 1 ? 'klant' : 'klanten'}
            {params.search && <> gevonden voor “{params.search}”</>}
          </p>
        </div>

        <form action="/klanten" className="flex items-end gap-2">
          <input type="hidden" name="status" value={statusNu} />
          <div className="relative">
            <Search
              size={15}
              aria-hidden
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-faint"
            />
            <Input
              name="search"
              defaultValue={params.search ?? ''}
              placeholder="Naam, klantnummer, e-mail of btw-nummer"
              aria-label="Klanten zoeken"
              className="w-72 pl-8"
            />
          </div>
          <Button type="submit" variant="secondary">
            Zoeken
          </Button>
        </form>
      </div>

      <div className="mt-5 flex gap-1">
        {(
          [
            ['all', 'Alle'],
            ['active', 'Actief'],
            ['inactive', 'Inactief'],
          ] as const
        ).map(([waarde, label]) => {
          const q = new URLSearchParams({
            ...(params.search ? { search: params.search } : {}),
            ...(waarde !== 'all' ? { status: waarde } : {}),
          })
          return (
            <Link
              key={waarde}
              href={`/klanten?${q}`}
              className={`rounded px-2.5 py-1 text-sm transition-colors ${
                statusNu === waarde
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-ink-soft hover:bg-sunk'
              }`}
            >
              {label}
            </Link>
          )
        })}
      </div>

      <div className="mt-3 overflow-x-auto rounded border border-rule bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b border-rule">
            <tr>
              <Kop veld="number" label="Nummer" params={params} />
              <Kop veld="name" label="Naam" params={params} />
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                Plaats
              </th>
              <th scope="col" className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wide text-ink-faint">
                Contact
              </th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-ink-faint">
                Offertes
              </th>
              <th scope="col" className="px-4 py-2 text-right text-xs font-medium uppercase tracking-wide text-ink-faint">
                Orders
              </th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((klant) => (
              <tr key={klant.id} className="border-b border-rule last:border-0 hover:bg-sunk/60">
                <td className="whitespace-nowrap px-4 py-2.5 font-[family-name:var(--font-mono)] text-xs text-ink-soft tabular">
                  {klant.number}
                </td>
                <td className="px-4 py-2.5">
                  <Link href={`/klanten/${klant.id}`} className="font-medium hover:text-accent">
                    {klant.name}
                  </Link>
                  <span className="ml-2 inline-flex gap-1 align-middle">
                    {!klant.isActive && <Badge tone="rest">inactief</Badge>}
                    {klant.isDemo && <Badge tone="wait">demo</Badge>}
                  </span>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-ink-soft">{klant.city ?? '—'}</td>
                <td className="px-4 py-2.5 text-ink-soft">{klant.email ?? klant.phone ?? '—'}</td>
                <td className="px-4 py-2.5 text-right tabular">
                  {klant.openQuotes > 0 ? klant.openQuotes : <span className="text-ink-faint">—</span>}
                </td>
                <td className="px-4 py-2.5 text-right tabular">
                  {klant.activeOrders > 0 ? klant.activeOrders : <span className="text-ink-faint">—</span>}
                </td>
              </tr>
            ))}

            {data.items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-ink-soft">
                  Geen klanten gevonden
                  {params.search && <> voor “{params.search}”</>}.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {data.pageCount > 1 && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <p className="text-ink-faint">
            Pagina {data.page} van {data.pageCount}
          </p>
          <div className="flex gap-2">
            {data.page > 1 && (
              <Link
                href={`/klanten?${new URLSearchParams({ ...params, page: String(data.page - 1) } as Record<string, string>)}`}
                className="rounded border border-rule bg-surface px-3 py-1.5 hover:bg-sunk"
              >
                Vorige
              </Link>
            )}
            {data.page < data.pageCount && (
              <Link
                href={`/klanten?${new URLSearchParams({ ...params, page: String(data.page + 1) } as Record<string, string>)}`}
                className="rounded border border-rule bg-surface px-3 py-1.5 hover:bg-sunk"
              >
                Volgende
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
