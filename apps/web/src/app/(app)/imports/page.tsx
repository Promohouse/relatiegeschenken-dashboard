import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ConnectionSummary, ImportRunSummary } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { ImportStarten } from '@/components/import-starten'
import { getCurrentUser, mag } from '@/lib/session'

const STATUSTOON: Record<string, 'ok' | 'wait' | 'rest' | 'alarm'> = {
  SUCCESS: 'ok',
  PARTIAL: 'wait',
  RUNNING: 'wait',
  PENDING: 'rest',
  CANCELLED: 'rest',
  FAILED: 'alarm',
}

const tijdstip = (iso: string) =>
  new Date(iso).toLocaleString('nl-NL', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  })

export default async function ImportsPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'imports:view')) redirect('/')

  const [runs, koppelingen] = await Promise.all([
    apiGet<ImportRunSummary[]>('/api/imports/runs'),
    apiGet<ConnectionSummary[]>('/api/imports/connections'),
  ])

  return (
    <div className="max-w-5xl">
      <h1 className="text-2xl font-bold tracking-tight">Imports</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Leveranciersdata komt binnen in drie stappen: ophalen, vergelijken, en pas na beoordeling in
        de catalogus. Een import verwijdert nooit een product; een artikel dat uit de bron verdwijnt
        wordt voorgesteld om op inactief te zetten.
      </p>

      {mag(user, 'imports:create') && (
        <div className="mt-5">
          <ImportStarten koppelingen={koppelingen} />
        </div>
      )}

      <h2 className="mt-8 text-sm font-semibold">Koppelingen</h2>
      <div className="mt-2 overflow-hidden rounded border border-rule bg-surface">
        {koppelingen.map((k) => (
          <div key={k.key} className="border-b border-rule p-4 last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">
                  {k.supplierName}
                  <span className="ml-2 font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                    {k.key}
                  </span>
                  {!k.isActive && (
                    <Badge tone="rest" className="ml-2">
                      uit
                    </Badge>
                  )}
                  {k.isActive && !k.hasCredentials && (
                    <Badge tone="wait" className="ml-2">
                      geen credentials
                    </Badge>
                  )}
                </p>
                {k.notes && <p className="mt-1 max-w-2xl text-sm text-ink-soft">{k.notes}</p>}
              </div>
              <p className="shrink-0 text-xs text-ink-faint">
                {k.transport} · {k.environment}
                {k.lastRunAt && <> · laatst {tijdstip(k.lastRunAt)}</>}
              </p>
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              {k.capabilities.map((c) => (
                <span
                  key={c.capability}
                  title={
                    !c.hasConnector
                      ? 'Gedocumenteerd, maar er is geen code die dit uitvoert'
                      : c.isEnabled
                        ? 'Beschikbaar'
                        : 'Bewust uitgezet'
                  }
                  className={`rounded px-1.5 py-0.5 font-[family-name:var(--font-mono)] text-[11px] ${
                    c.isEnabled && c.hasConnector
                      ? 'bg-ok-bg text-ok'
                      : 'bg-rest-bg text-rest line-through'
                  }`}
                >
                  {c.capability}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 text-sm font-semibold">Laatste imports</h2>
      {runs.length === 0 ? (
        <p className="mt-2 rounded border border-rule bg-surface p-4 text-sm text-ink-faint">
          Nog geen imports gedraaid.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded border border-rule bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                {['Wanneer', 'Koppeling', 'Wat', 'Status', 'Gezien', 'Nieuw', 'Gewijzigd', 'Verdwenen'].map((k) => (
                  <th key={k} className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-b border-rule last:border-0">
                  <td className="px-4 py-2">
                    <Link href={`/imports/${r.id}`} className="hover:text-accent">
                      {tijdstip(r.startedAt)}
                    </Link>
                    {r.dryRun && (
                      <Badge tone="rest" className="ml-2">
                        proef
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2 text-ink-soft">{r.supplierName}</td>
                  <td className="px-4 py-2 font-[family-name:var(--font-mono)] text-xs">{r.capability}</td>
                  <td className="px-4 py-2">
                    <Badge tone={STATUSTOON[r.status] ?? 'rest'}>{r.status}</Badge>
                  </td>
                  <td className="px-4 py-2 tabular">{r.itemsSeen}</td>
                  <td className="px-4 py-2 tabular">{r.summary?.created ?? '—'}</td>
                  <td className="px-4 py-2 tabular">{r.summary?.updated ?? '—'}</td>
                  <td className="px-4 py-2 tabular">{r.summary?.missing ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
