import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { PaymentTermView } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

export default async function BetalingsvoorwaardenPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:view')) redirect('/')

  const termen = await apiGet<PaymentTermView[]>('/api/payment-terms')
  const magWijzigen = mag(user, 'settings:update')

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Betalingsvoorwaarden</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Wanneer een factuur vervalt, en of er vooraf betaald moet worden. Eén lijst voor alle
            klanten, zodat er geen vijftien varianten van &ldquo;30 dagen&rdquo; ontstaan.
          </p>
        </div>
        {magWijzigen && (
          <Link
            href="/beheer/betalingsvoorwaarden/nieuw"
            className="inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Nieuwe voorwaarde
          </Link>
        )}
      </div>

      <div className="mt-5 overflow-hidden rounded border border-rule bg-surface">
        {termen.map((term) => (
          <div
            key={term.key}
            className="flex items-start justify-between gap-4 border-b border-rule p-4 last:border-0"
          >
            <div className="min-w-0">
              <p className="font-medium">
                {magWijzigen ? (
                  <Link href={`/beheer/betalingsvoorwaarden/${term.id}`} className="hover:text-accent">
                    {term.name}
                  </Link>
                ) : (
                  term.name
                )}
                {term.isDefault && (
                  <Badge tone="rest" className="ml-2">
                    standaard
                  </Badge>
                )}
                {!term.isActive && (
                  <Badge tone="rest" className="ml-2">
                    niet te kiezen
                  </Badge>
                )}
              </p>
              <p className="font-[family-name:var(--font-mono)] text-xs text-ink-faint">{term.key}</p>
              <p className="mt-1 text-sm text-ink-soft">{term.description}</p>
            </div>
            <p className="shrink-0 text-sm text-ink-soft tabular">
              {term.customerCount} {term.customerCount === 1 ? 'klant' : 'klanten'}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        De vervaldatum wordt uit deze gegevens berekend, niet per factuur ingevoerd. Zo rekenen het
        scherm, de factuur en straks de boekhouding met dezelfde datum.
      </p>
    </div>
  )
}
