import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, MapPin, Phone, Tag, User } from 'lucide-react'
import type { CustomerDetail, PriceAgreementView } from '@rgh/contracts'
import { formatEuro } from '@rgh/contracts'
import { apiGet, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { KlantStatusKnop } from '@/components/klant-status-knop'
import { getCurrentUser, mag } from '@/lib/session'

/** Een datum zoals een Nederlander hem leest. */
const datum = (iso: string) =>
  new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })

const ADRESSOORT: Record<string, string> = {
  INVOICE: 'Factuuradres',
  DELIVERY: 'Afleveradres',
}

function Veld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-ink-faint">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

export default async function KlantPagina({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const user = await getCurrentUser()

  let klant: CustomerDetail
  try {
    klant = await apiGet<CustomerDetail>(`/api/customers/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

  const afspraken = await apiGet<PriceAgreementView[]>(`/api/customers/${id}/prices`)

  return (
    <div className="max-w-5xl">
      <Link
        href="/klanten"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden />
        Klanten
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{klant.name}</h1>
            {!klant.isActive && <Badge tone="rest">inactief</Badge>}
            {klant.isDemo && <Badge tone="wait">demodata</Badge>}
          </div>
          <p className="mt-1 font-[family-name:var(--font-mono)] text-sm text-ink-faint">
            Klantnummer {klant.number}
          </p>
        </div>

        <div className="flex items-center gap-6">
          {mag(user, 'customers:update') && (
            <div className="flex gap-2">
              <Link
                href={`/klanten/${klant.id}/bewerken`}
                className="inline-flex h-8 items-center rounded border border-rule-strong bg-surface px-3 text-sm font-medium transition-colors hover:bg-sunk"
              >
                Bewerken
              </Link>
              <KlantStatusKnop klantId={klant.id} isActief={klant.isActive} />
            </div>
          )}

          <div className="flex gap-6 text-right">
          <div>
            <p className="text-2xl font-bold tabular">{klant.openQuotes}</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Open offertes</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular">{klant.activeOrders}</p>
            <p className="text-xs uppercase tracking-wide text-ink-faint">Actieve orders</p>
          </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-3">
        <section className="rounded border border-rule bg-surface p-5">
          <h2 className="text-sm font-semibold">Gegevens</h2>
          <dl className="mt-3 grid gap-3">
            <Veld label="Btw-nummer">
              <span className="font-[family-name:var(--font-mono)]">{klant.vatNumber ?? '—'}</span>
            </Veld>
            <Veld label="E-mail">
              {klant.email ? (
                <a href={`mailto:${klant.email}`} className="hover:text-accent">
                  {klant.email}
                </a>
              ) : (
                '—'
              )}
            </Veld>
            <Veld label="Telefoon">{klant.phone ?? '—'}</Veld>
            <Veld label="Website">{klant.website ?? '—'}</Veld>
            <Veld label="Betalingsvoorwaarde">
              {klant.paymentTermName ? (
                <>
                  {klant.paymentTermName}
                  {klant.paymentTermIsDefault && (
                    <span className="text-ink-faint"> (standaard)</span>
                  )}
                  <span className="block text-xs text-ink-faint">{klant.paymentTermDescription}</span>
                </>
              ) : (
                <span className="text-alarm">Nog geen standaard ingesteld</span>
              )}
            </Veld>
          </dl>
        </section>

        <section className="rounded border border-rule bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <User size={14} aria-hidden className="text-ink-faint" />
              Contactpersonen
            </h2>
            {mag(user, 'customers:update') && (
              <Link
                href={`/klanten/${klant.id}/contactpersonen/nieuw`}
                className="text-xs font-medium text-accent hover:underline"
              >
                Toevoegen
              </Link>
            )}
          </div>
          <ul className="mt-3 grid gap-3">
            {klant.contacts.map((c) => (
              <li key={c.id}>
                <p className="text-sm font-medium">
                  {mag(user, 'customers:update') ? (
                    <Link
                      href={`/klanten/${klant.id}/contactpersonen/${c.id}`}
                      className="hover:text-accent"
                    >
                      {c.firstName} {c.lastName}
                    </Link>
                  ) : (
                    <>
                      {c.firstName} {c.lastName}
                    </>
                  )}
                  {c.isPrimary && (
                    <Badge tone="ok" className="ml-2">
                      hoofdcontact
                    </Badge>
                  )}
                  {!c.isActive && (
                    <Badge tone="rest" className="ml-2">
                      inactief
                    </Badge>
                  )}
                </p>
                {c.jobTitle && <p className="text-xs text-ink-faint">{c.jobTitle}</p>}
                <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-soft">
                  {c.email && (
                    <span className="inline-flex items-center gap-1">
                      <Mail size={11} aria-hidden /> {c.email}
                    </span>
                  )}
                  {c.phone && (
                    <span className="inline-flex items-center gap-1">
                      <Phone size={11} aria-hidden /> {c.phone}
                    </span>
                  )}
                </div>
              </li>
            ))}
            {klant.contacts.length === 0 && (
              <li className="text-sm text-ink-faint">Nog geen contactpersonen.</li>
            )}
          </ul>
        </section>

        <section className="rounded border border-rule bg-surface p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin size={14} aria-hidden className="text-ink-faint" />
              Adressen
            </h2>
            {mag(user, 'customers:update') && (
              <Link
                href={`/klanten/${klant.id}/adressen/nieuw`}
                className="text-xs font-medium text-accent hover:underline"
              >
                Toevoegen
              </Link>
            )}
          </div>
          <ul className="mt-3 grid gap-3">
            {klant.addresses.map((a) => (
              <li key={a.id}>
                <p className="text-xs uppercase tracking-wide text-ink-faint">
                  {ADRESSOORT[a.type] ?? a.type}
                  {a.isDefault && ' · standaard'}
                </p>
                {mag(user, 'customers:update') ? (
                  <Link href={`/klanten/${klant.id}/adressen/${a.id}`} className="block text-sm hover:text-accent">
                    {a.street} {a.houseNumber}
                    <br />
                    {a.postalCode} {a.city}
                    {a.country !== 'NL' && <> ({a.country})</>}
                  </Link>
                ) : (
                  <p className="text-sm">
                    {a.street} {a.houseNumber}
                    <br />
                    {a.postalCode} {a.city}
                    {a.country !== 'NL' && <> ({a.country})</>}
                  </p>
                )}
              </li>
            ))}
            {klant.addresses.length === 0 && (
              <li className="text-sm text-ink-faint">Nog geen adressen.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-5 rounded border border-rule bg-surface p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Tag size={14} aria-hidden className="text-ink-faint" />
            Prijsafspraken
          </h2>
          {mag(user, 'customers:update') && (
            <Link
              href={`/klanten/${klant.id}/prijsafspraken/nieuw`}
              className="text-xs font-medium text-accent hover:underline"
            >
              Toevoegen
            </Link>
          )}
        </div>

        {afspraken.length === 0 ? (
          <p className="mt-3 text-sm text-ink-faint">
            Geen prijsafspraken. De calculatie gebruikt dan de algemene prijsregels.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-rule text-left">
                  {['Product', 'Vanaf', 'Prijs per stuk', 'Geldig', 'Status'].map((k) => (
                    <th key={k} className="pb-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-faint">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {afspraken.map((a) => (
                  <tr key={a.id} className="border-b border-rule last:border-0">
                    <td className="py-2 pr-4">
                      {mag(user, 'customers:update') ? (
                        <Link
                          href={`/klanten/${klant.id}/prijsafspraken/${a.id}`}
                          className="hover:text-accent"
                        >
                          {a.productName}
                        </Link>
                      ) : (
                        a.productName
                      )}
                      <span className="block font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                        {a.productArticleNumber}
                      </span>
                    </td>
                    <td className="py-2 pr-4 tabular">{a.minQuantity}</td>
                    <td className="py-2 pr-4 tabular">{formatEuro(a.unitPrice)}</td>
                    <td className="py-2 pr-4 text-xs text-ink-soft">
                      {a.validFrom || a.validTo ? (
                        <>
                          {a.validFrom ? datum(a.validFrom) : 'altijd'}
                          {' – '}
                          {a.validTo ? datum(a.validTo) : 'open'}
                        </>
                      ) : (
                        'onbeperkt'
                      )}
                    </td>
                    <td className="py-2">
                      {a.appliesToday ? (
                        <Badge tone="ok">geldt nu</Badge>
                      ) : a.isActive ? (
                        <Badge tone="wait">buiten de periode</Badge>
                      ) : (
                        <Badge tone="rest">uitgezet</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-ink-faint">
          Een afspraak gaat vóór op elke algemene prijsregel. Bij meerdere drempels geldt de hoogste
          die het aantal haalt.
        </p>
      </section>

      {klant.notes && (
        <section className="mt-5 rounded border border-rule bg-surface p-5">
          <h2 className="text-sm font-semibold">Interne opmerkingen</h2>
          <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">{klant.notes}</p>
          <p className="mt-3 text-xs text-ink-faint">
            Deze tekst is nooit zichtbaar in het klantportaal.
          </p>
        </section>
      )}

      <p className="mt-6 text-xs text-ink-faint">
        Offertes, orders, drukproeven en documenten van deze klant komen hier zodra die modules er
        zijn.
      </p>
    </div>
  )
}
