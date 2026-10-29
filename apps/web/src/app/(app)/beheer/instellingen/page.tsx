import Image from 'next/image'
import { redirect } from 'next/navigation'
import { formatEuro, type CompanySettings, type ShippingMethod } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { BedrijfsgegevensFormulier } from '@/components/bedrijfsgegevens-formulier'
import { VerzendwijzenFormulier } from '@/components/verzendwijzen-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function InstellingenPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:view')) redirect('/')

  const [bedrijf, verzendwijzen] = await Promise.all([
    apiGet<CompanySettings>('/api/settings/company'),
    apiGet<ShippingMethod[]>('/api/settings/shipping-methods'),
  ])
  const magWijzigen = mag(user, 'settings:update')

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold tracking-tight">Bedrijfsgegevens</h1>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        Deze gegevens komen op offertes, orderbevestigingen en facturen. Ze staan in de database en
        niet in de code, zodat een verhuizing of een nieuw rekeningnummer geen nieuwe versie van de
        software vraagt. Elke wijziging komt in het auditlog.
      </p>

      <div className="mt-5 flex flex-wrap items-center gap-6 rounded border border-rule bg-surface p-5">
        <Image
          src={bedrijf.logoLight}
          alt={bedrijf.name}
          width={538}
          height={323}
          className="logo-op-licht h-14 w-auto"
        />
        <Image
          src={bedrijf.logoDark}
          alt=""
          aria-hidden
          width={538}
          height={323}
          className="logo-op-donker h-14 w-auto"
        />
        <div className="text-sm text-ink-soft">
          <p className="font-medium text-ink">{bedrijf.name}</p>
          <p>
            {bedrijf.street} · {bedrijf.postalCode} {bedrijf.city}
          </p>
          <p>
            KvK {bedrijf.chamberOfCommerce} · btw {bedrijf.vatNumber}
          </p>
          <p>{bedrijf.iban}</p>
        </div>
      </div>

      {magWijzigen ? (
        <div className="mt-5">
          <BedrijfsgegevensFormulier gegevens={bedrijf} />
        </div>
      ) : (
        <p className="mt-5 text-sm text-ink-faint">
          Je mag deze gegevens bekijken maar niet wijzigen. Daarvoor is het recht
          settings:update nodig.
        </p>
      )}

      <h2 className="mt-10 text-xl font-bold tracking-tight">Verzendwijzen</h2>
      <p className="mt-1 max-w-2xl text-sm text-ink-soft">
        De keuzelijst bij <strong>Bijdrage verzendkosten</strong> in de calculator. Wat een
        verzending ons kost drukt op de marge ook als er niets voor gerekend wordt; wat de klant
        bijdraagt komt als bedrag op de offerte. Beide staan hier, zodat een tariefwijziging van
        de vervoerder geen nieuwe versie van de software vraagt.
      </p>

      {magWijzigen ? (
        <div className="mt-5">
          <VerzendwijzenFormulier wijzen={verzendwijzen} />
        </div>
      ) : (
        <div className="mt-5 overflow-hidden rounded border border-rule bg-surface">
          {verzendwijzen.length === 0 ? (
            <p className="p-4 text-sm text-ink-faint">Nog geen verzendwijzen ingesteld.</p>
          ) : (
            verzendwijzen.map((w) => (
              <div
                key={w.name}
                className="flex items-baseline justify-between gap-4 border-b border-rule p-4 text-sm last:border-0"
              >
                <span className="font-medium">{w.name}</span>
                <span className="tabular text-ink-soft">
                  kost {formatEuro(w.cost)} · klant betaalt {formatEuro(w.contribution)}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
