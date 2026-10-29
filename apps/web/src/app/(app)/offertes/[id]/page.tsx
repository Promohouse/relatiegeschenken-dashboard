import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, FileDown, Lock } from 'lucide-react'
import { formatEuro, type QuoteView, type ShippingMethod } from '@rgh/contracts'
import { apiGet, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { OfferteregelDialoog } from '@/components/offerteregel-dialoog'
import { OfferteregelVerwijderen } from '@/components/offerteregel-verwijderen'
import { getCurrentUser, mag } from '@/lib/session'

const datum = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'

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

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

function Bedrag({ label, waarde, groot = false }: {
  label: string
  waarde: string
  groot?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={groot ? 'text-sm font-semibold' : 'text-sm text-ink-soft'}>{label}</span>
      <span className={`tabular ${groot ? 'text-lg font-bold' : 'text-sm'}`}>
        {formatEuro(waarde)}
      </span>
    </div>
  )
}

export default async function OffertePagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()

  let offerte: QuoteView
  try {
    offerte = await apiGet<QuoteView>(`/api/quotes/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const [verzendwijzen, staffelaantallen] = await Promise.all([
    apiGet<ShippingMethod[]>('/api/settings/shipping-methods'),
    apiGet<number[]>('/api/settings/quote-tiers'),
  ])
  const versie = offerte.currentVersion
  const vast = versie.lockedAt !== null
  const magWijzigen = mag(user, 'quotes:update') && !vast
  const status = STATUS[offerte.status] ?? { label: offerte.status, tone: 'rest' as const }

  return (
    <div className="max-w-5xl">
      <Link
        href="/offertes"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Offertes
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-mono)] text-2xl font-bold tracking-tight">
            {offerte.number}
          </h1>
          <p className="mt-1 text-sm text-ink-soft">
            {offerte.customerName}
            {offerte.contactPersonName && ` · ${offerte.contactPersonName}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/quotes/${offerte.id}/pdf`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-9 items-center gap-2 rounded border border-rule-strong bg-surface px-3 text-sm font-medium text-ink transition-colors hover:bg-sunk"
          >
            <FileDown size={15} aria-hidden />
            PDF
          </a>
          {vast && (
            <Badge tone="rest">
              <Lock size={11} aria-hidden className="mr-1 inline" />
              vastgezet
            </Badge>
          )}
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
      </div>

      <dl className="mt-5 grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-4">
        <Veld label="Versie">{versie.versionNumber}</Veld>
        <Veld label="Geldig tot">{datum(versie.validUntil)}</Veld>
        <Veld label="Referentie">{offerte.reference ?? '—'}</Veld>
        <Veld label="Gewenste levering">{datum(offerte.requestedDeliveryDate)}</Veld>
      </dl>

      {vast && (
        <p className="mt-3 rounded border border-rule bg-ground px-3 py-2 text-xs text-ink-soft">
          Deze versie is vastgezet en wijzigt niet meer. Dat wordt door de database afgedwongen,
          niet door het scherm: een vastgezette offerte is het bewijs van wat er is aangeboden.
        </p>
      )}

      <h2 className="mt-6 text-sm font-semibold">Regels</h2>
      {versie.lines.length === 0 ? (
        <p className="mt-2 rounded border border-rule bg-surface p-5 text-sm text-ink-faint">
          Nog geen regels. Reken er hieronder een door; dat gebeurt met dezelfde calculator als
          op het calculatorscherm.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded border border-rule bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                {['#', 'Product', 'Aantal', 'Per stuk', 'Instelkosten', 'Totaal', 'Marge', ''].map(
                  (k, i) => (
                    <th
                      key={k || i}
                      className={`px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint ${
                        i >= 2 && i <= 6 ? 'text-right' : ''
                      }`}
                    >
                      {k}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {versie.lines.map((regel) => (
                <tr key={regel.id} className="border-b border-rule last:border-0 align-top">
                  <td className="px-4 py-2.5 tabular text-ink-faint">{regel.lineNumber}</td>
                  <td className="px-4 py-2.5">
                    <span className="font-medium">{regel.description ?? regel.productName}</span>
                    {regel.productArticleNumber && (
                      <span className="block font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                        {regel.productArticleNumber}
                      </span>
                    )}
                    {regel.printJobs.map((druk, i) => (
                      <span key={i} className="block text-xs text-ink-soft">
                        {druk.printMethodName} op {druk.position}, {druk.colors}{' '}
                        {druk.colors === 1 ? 'kleur' : 'kleuren'}
                      </span>
                    ))}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{regel.quantity}</td>
                  <td className="px-4 py-2.5 text-right tabular">
                    {formatEuro(regel.unitSalePrice)}
                    {Number(regel.discountPercent) > 0 && (
                      <span className="block text-xs text-ink-faint">
                        −{regel.discountPercent}%
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular">{formatEuro(regel.setupCost)}</td>
                  <td className="px-4 py-2.5 text-right tabular font-medium">
                    {formatEuro(regel.lineSubtotalExclVat)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular text-ink-soft">
                    {formatEuro(regel.lineMarginAmount)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {magWijzigen && (
                      <OfferteregelVerwijderen quoteId={offerte.id} lineId={regel.id} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="border-t border-rule px-4 py-3">
            <div className="ml-auto max-w-xs">
              <Bedrag label="Subtotaal" waarde={versie.subtotalExclVat} />
              <Bedrag label="Btw" waarde={versie.vatAmount} />
              <Bedrag label="Totaal inclusief btw" waarde={versie.totalInclVat} groot />
              <p className="mt-2 border-t border-rule pt-2 text-right text-xs text-ink-faint">
                Inkoopwaarde {formatEuro(versie.purchaseTotal)} · marge{' '}
                {formatEuro(versie.marginAmount)} ({versie.marginPercent}%)
              </p>
            </div>
          </div>
        </div>
      )}

      {magWijzigen && (
        <div className="mt-5">
          <OfferteregelDialoog
            quoteId={offerte.id}
            klant={{ id: offerte.customerId, name: offerte.customerName }}
            staffelaantallen={staffelaantallen}
            verzendwijzen={verzendwijzen}
          />
          <p className="mt-2 text-xs text-ink-faint">
            De calculator opent in een venster. Je ziet de prijs, de marge en eventuele
            waarschuwingen vóór de regel op de offerte komt.
          </p>
        </div>
      )}

      {versie.customerNotes && (
        <section className="mt-5 rounded border border-rule bg-surface p-5">
          <h2 className="text-sm font-semibold">Tekst voor de klant</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{versie.customerNotes}</p>
        </section>
      )}

      {offerte.notes && (
        <section className="mt-5 rounded border border-rule bg-surface p-5">
          <h2 className="text-sm font-semibold">Interne opmerkingen</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{offerte.notes}</p>
          <p className="mt-2 text-xs text-ink-faint">Nooit zichtbaar voor de klant.</p>
        </section>
      )}
    </div>
  )
}
