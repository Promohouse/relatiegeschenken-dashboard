import Image from 'next/image'
import { redirect } from 'next/navigation'
import type { CompanySettings } from '@rgh/contracts'
import { apiGet } from '@/lib/api'
import { BedrijfsgegevensFormulier } from '@/components/bedrijfsgegevens-formulier'
import { getCurrentUser, mag } from '@/lib/session'

export default async function InstellingenPagina() {
  const user = await getCurrentUser()
  if (!mag(user, 'settings:view')) redirect('/')

  const bedrijf = await apiGet<CompanySettings>('/api/settings/company')
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
    </div>
  )
}
