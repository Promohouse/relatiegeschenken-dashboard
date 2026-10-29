import Link from 'next/link'
import { redirect } from 'next/navigation'
import { SCOPE_LABELS, type PriceRuleView } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { getCurrentUser, mag } from '@/lib/session'

/** Eén regel in de tabel. De omrekening komt uit de api, niet uit dit scherm. */
function Regel({ regel, magWijzigen }: { regel: PriceRuleView; magWijzigen: boolean }) {
  const naam = regel.targetName ?? 'Alles zonder eigen regel'

  return (
    <tr className="border-b border-rule last:border-0">
      <td className="py-2.5 pr-4">
        {magWijzigen ? (
          <Link href={`/beheer/marges/${regel.id}`} className="font-medium hover:text-accent">
            {naam}
          </Link>
        ) : (
          <span className="font-medium">{naam}</span>
        )}
        <span className="block text-xs text-ink-faint">
          {SCOPE_LABELS[regel.scope]}
          {regel.minQuantity > 1 && ` · vanaf ${regel.minQuantity} stuks`}
        </span>
        {regel.note && <span className="block text-xs text-ink-faint">{regel.note}</span>}
      </td>
      <td className="py-2.5 pr-4 text-right tabular">
        {regel.saleMarginPercent}%
        <span className="block text-xs text-ink-faint">
          {regel.marginBasis === 'COST' ? `${regel.marginPercent}% opslag` : 'ingevoerd'}
        </span>
      </td>
      <td className="py-2.5 pr-4 text-right tabular">
        {regel.printSaleMarginPercent ? (
          `${regel.printSaleMarginPercent}%`
        ) : (
          <span className="text-ink-faint">volgt artikel</span>
        )}
      </td>
      <td className="py-2.5 pr-4 text-right tabular text-ink-soft">{regel.priority}</td>
      <td className="py-2.5 text-right">
        {regel.appliesToday ? (
          <Badge tone="ok">geldt</Badge>
        ) : regel.isActive ? (
          <Badge tone="wait">buiten de datums</Badge>
        ) : (
          <Badge tone="rest">uit</Badge>
        )}
      </td>
    </tr>
  )
}

export default async function MargesPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:view')) redirect('/')

  const regels = await apiGet<PriceRuleView[]>('/api/price-rules')
  const magWijzigen = mag(user, 'settings:update')
  const standaard = regels.filter((r) => r.scope === 'GLOBAL')
  const rest = regels.filter((r) => r.scope !== 'GLOBAL')

  return (
    <div className="max-w-4xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Marges</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Wat er op de inkoopprijs komt, voor het artikel én voor de bedrukking. De calculator,
            de offerte en straks de webshop rekenen allemaal met deze regels.
          </p>
        </div>
        {magWijzigen && (
          <Link
            href="/beheer/marges/nieuw"
            className="inline-flex h-9 items-center rounded bg-accent px-4 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            Nieuwe regel
          </Link>
        )}
      </div>

      <h2 className="mt-6 text-sm font-semibold">Standaardmarge</h2>
      {standaard.length === 0 ? (
        <p className="mt-2 rounded border border-wait/30 bg-wait-bg px-3 py-2 text-sm text-wait">
          Er is geen standaardmarge ingesteld. Zonder regel wordt er geen prijs bepaald — de
          calculator weigert dan te rekenen in plaats van zonder marge te verkopen.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded border border-rule bg-surface px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                {['Geldt voor', 'Artikel', 'Bedrukking', 'Voorrang', ''].map((k, i) => (
                  <th
                    key={k || i}
                    className={`py-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-faint ${
                      i > 0 ? 'text-right' : ''
                    }`}
                  >
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standaard.map((r) => (
                <Regel key={r.id} regel={r} magWijzigen={magWijzigen} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-6 text-sm font-semibold">Afwijkende regels</h2>
      {rest.length === 0 ? (
        <p className="mt-2 text-sm text-ink-faint">
          Nog geen afwijkende regels. Een regel voor één klant of één product gaat voor op de
          standaard.
        </p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded border border-rule bg-surface px-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                {['Geldt voor', 'Artikel', 'Bedrukking', 'Voorrang', ''].map((k, i) => (
                  <th
                    key={k || i}
                    className={`py-2 pr-4 text-xs font-medium uppercase tracking-wide text-ink-faint ${
                      i > 0 ? 'text-right' : ''
                    }`}
                  >
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rest.map((r) => (
                <Regel key={r.id} regel={r} magWijzigen={magWijzigen} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-ink-faint">
        De marge staat als deel van de verkoopprijs in de kolommen, ook als hij als opslag op de
        inkoop is ingevoerd — dat verschil is waar in deze handel het vaakst geld mee verloren
        gaat. Een klantprijsafspraak gaat nog vóór al deze regels.
      </p>
    </div>
  )
}
