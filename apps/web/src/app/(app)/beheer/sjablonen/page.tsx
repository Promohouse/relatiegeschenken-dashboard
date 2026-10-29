import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { TemplateView } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

const SOORT: Record<string, string> = {
  QUOTE_INTRO: 'offerte',
  QUOTE_TERMS: 'offerte',
  QUOTE_LINE: 'offerteregel',
  QUOTE_EMAIL: 'e-mail',
}

export default async function SjablonenPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:view')) redirect('/')

  const sjablonen = await apiGet<TemplateView[]>('/api/templates')
  const magWijzigen = mag(user, 'settings:update')

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold tracking-tight">Tekstsjablonen</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        De teksten op offertes en in e-mails. Ze staan in de database en niet in de code, dus je
        kunt ze zelf aanpassen. Tussen dubbele accolades staan velden die automatisch worden
        ingevuld, zoals het offertenummer of de naam van de contactpersoon.
      </p>

      <div className="mt-5 overflow-hidden rounded border border-rule bg-surface">
        {sjablonen.map((sjabloon) => (
          <div key={sjabloon.key} className="border-b border-rule p-4 last:border-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">
                  {magWijzigen ? (
                    <Link href={`/beheer/sjablonen/${sjabloon.key}`} className="hover:text-accent">
                      {sjabloon.name}
                    </Link>
                  ) : (
                    sjabloon.name
                  )}
                  <Badge tone="rest" className="ml-2">
                    {SOORT[sjabloon.kind] ?? sjabloon.kind}
                  </Badge>
                  {!sjabloon.isActive && (
                    <Badge tone="wait" className="ml-2">
                      uit
                    </Badge>
                  )}
                </p>
                {sjabloon.description && (
                  <p className="mt-1 text-sm text-ink-soft">{sjabloon.description}</p>
                )}
              </div>
              <p className="shrink-0 font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                {sjabloon.key}
              </p>
            </div>

            <p className="mt-2 line-clamp-2 whitespace-pre-line text-xs text-ink-faint">
              {sjabloon.preview.body}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 text-xs text-ink-faint">
        Een veld dat niet bestaat wordt bij het opslaan geweigerd. Dat is met opzet: een typefout
        hoort opgemerkt te worden door wie de tekst schrijft, niet door de klant die hem krijgt.
      </p>
    </div>
  )
}
