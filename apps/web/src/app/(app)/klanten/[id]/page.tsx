import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, MapPin, Phone, User } from 'lucide-react'
import type { CustomerDetail } from '@rgh/contracts'
import { apiGet, ApiError } from '@/lib/api'
import { Badge } from '@/components/ui/badge'

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

  let klant: CustomerDetail
  try {
    klant = await apiGet<CustomerDetail>(`/api/customers/${id}`)
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) notFound()
    throw error
  }

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
          </dl>
        </section>

        <section className="rounded border border-rule bg-surface p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <User size={14} aria-hidden className="text-ink-faint" />
            Contactpersonen
          </h2>
          <ul className="mt-3 grid gap-3">
            {klant.contacts.map((c) => (
              <li key={c.id}>
                <p className="text-sm font-medium">
                  {c.firstName} {c.lastName}
                  {c.isPrimary && (
                    <Badge tone="ok" className="ml-2">
                      hoofdcontact
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
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <MapPin size={14} aria-hidden className="text-ink-faint" />
            Adressen
          </h2>
          <ul className="mt-3 grid gap-3">
            {klant.addresses.map((a) => (
              <li key={a.id}>
                <p className="text-xs uppercase tracking-wide text-ink-faint">
                  {ADRESSOORT[a.type] ?? a.type}
                  {a.isDefault && ' · standaard'}
                </p>
                <p className="text-sm">
                  {a.street} {a.houseNumber}
                  <br />
                  {a.postalCode} {a.city}
                  {a.country !== 'NL' && <> ({a.country})</>}
                </p>
              </li>
            ))}
            {klant.addresses.length === 0 && (
              <li className="text-sm text-ink-faint">Nog geen adressen.</li>
            )}
          </ul>
        </section>
      </div>

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
