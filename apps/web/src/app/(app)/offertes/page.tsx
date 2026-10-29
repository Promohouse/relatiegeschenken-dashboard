import Link from 'next/link'
import { redirect } from 'next/navigation'
import { formatEuro, type QuoteSummary } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

/** Hoe een offertestatus in het scherm heet, en met welke kleur. */
const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'rest' | 'alarm' }> = {
  DRAFT: { label: 'concept', tone: 'rest' },
  READY_TO_SEND: { label: 'klaar voor verzending', tone: 'wait' },
  SENT: { label: 'verzonden', tone: 'wait' },
  AWAITING_CUSTOMER: { label: 'wacht op klant', tone: 'wait' },
  CHANGES_REQUESTED: { label: 'wijziging gevraagd', tone: 'alarm' },
  ACCEPTED: { label: 'geaccepteerd', tone: 'ok' },
  REJECTED: { label: 'afgewezen', tone: 'alarm' },
  EXPIRED: { label: 'verlopen', tone: 'rest' },
}

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

export default async function OffertesPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'quotes:view')) redirect('/')

  const offertes = await apiGet<QuoteSummary[]>('/api/quotes')

  return (
    <div className="max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Offertes</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Een offerteregel is een bewaarde calculatie. Wat er eenmaal in staat verandert niet
            meer mee met een latere prijswijziging op het product.
          </p>
        </div>
        {mag(user, 'quotes:create') && (
          <Link
            href="/offertes/nieuw"
            className="inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Nieuwe offerte
          </Link>
        )}
      </div>

      {offertes.length === 0 ? (
        <p className="mt-6 rounded border border-rule bg-surface p-5 text-sm text-ink-faint">
          Nog geen offertes. Maak er een aan bij een klant; het nummer wordt automatisch
          uitgegeven.
        </p>
      ) : (
        <div className="mt-5 overflow-x-auto rounded border border-rule bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                {['Nummer', 'Klant', 'Referentie', 'Regels', 'Totaal', 'Geldig tot', 'Status'].map(
                  (k, i) => (
                    <th
                      key={k}
                      className={`px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint ${
                        i === 3 || i === 4 ? 'text-right' : ''
                      }`}
                    >
                      {k}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {offertes.map((o) => {
                const status = STATUS[o.status] ?? { label: o.status, tone: 'rest' as const }
                return (
                  <tr key={o.id} className="border-b border-rule last:border-0">
                    <td className="px-4 py-2.5">
                      <Link
                        href={`/offertes/${o.id}`}
                        className="font-[family-name:var(--font-mono)] text-xs font-medium hover:text-accent"
                      >
                        {o.number}
                      </Link>
                      {o.versionNumber > 1 && (
                        <span className="ml-2 text-xs text-ink-faint">versie {o.versionNumber}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">{o.customerName}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{o.reference ?? '—'}</td>
                    <td className="px-4 py-2.5 text-right tabular">{o.lineCount}</td>
                    <td className="px-4 py-2.5 text-right tabular">{formatEuro(o.totalInclVat)}</td>
                    <td className="px-4 py-2.5 text-ink-soft">{datum(o.validUntil)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
