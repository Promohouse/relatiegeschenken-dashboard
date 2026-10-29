'use client'

import type { CompanySettings } from '@rgh/contracts'
import { FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { useState } from 'react'

/**
 * Bedrijfsgegevens zoals ze op offertes, orderbevestigingen en facturen komen.
 *
 * Deze staan in de database en niet in de code: een verhuizing, een nieuw
 * rekeningnummer of een andere handelsnaam hoort geen nieuwe versie van de
 * software te vragen.
 */
export function BedrijfsgegevensFormulier({ gegevens }: { gegevens: CompanySettings }) {
  const { fouten, algemeen, bezig, opslaan } = useOpslaan('/beheer/instellingen')
  const [waarden, setWaarden] = useState<CompanySettings>(gegevens)

  const zet = (veld: keyof CompanySettings) => (waarde: string) =>
    setWaarden((v) => ({ ...v, [veld]: waarde }))

  return (
    <form
      className="max-w-3xl"
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan('/api/settings/company', 'PATCH', waarden)
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <FormVeld naam="name" label="Bedrijfsnaam" waarde={waarden.name} fout={fouten.name} onChange={zet('name')} />
        </div>

        <div className="sm:col-span-2">
          <FormVeld naam="street" label="Straat en huisnummer" waarde={waarden.street} fout={fouten.street} onChange={zet('street')} />
        </div>
        <FormVeld naam="postalCode" label="Postcode" waarde={waarden.postalCode} fout={fouten.postalCode} onChange={zet('postalCode')} />
        <FormVeld naam="city" label="Plaats" waarde={waarden.city} fout={fouten.city} onChange={zet('city')} />
        <FormVeld naam="country" label="Land" waarde={waarden.country} fout={fouten.country} onChange={zet('country')} />
        <FormVeld naam="phone" label="Telefoon" waarde={waarden.phone} fout={fouten.phone} onChange={zet('phone')} />
        <FormVeld naam="email" label="E-mailadres" waarde={waarden.email} fout={fouten.email} onChange={zet('email')} />
        <FormVeld naam="website" label="Website" waarde={waarden.website} fout={fouten.website} onChange={zet('website')} />
      </div>

      <div className="mt-4 grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Zakelijke identificatie</h2>
        <FormVeld
          naam="chamberOfCommerce"
          label="KvK-nummer"
          waarde={waarden.chamberOfCommerce}
          fout={fouten.chamberOfCommerce}
          onChange={zet('chamberOfCommerce')}
        />
        <FormVeld
          naam="vatNumber"
          label="Btw-nummer"
          waarde={waarden.vatNumber}
          fout={fouten.vatNumber}
          hint="Zonder spaties, bijvoorbeeld NL123456789B01"
          onChange={zet('vatNumber')}
        />
        <div className="sm:col-span-2">
          <FormVeld
            naam="iban"
            label="IBAN"
            waarde={waarden.iban}
            fout={fouten.iban}
            hint="Spaties mogen; die worden weggehaald zodat een betaalbestand hem kan gebruiken."
            onChange={zet('iban')}
          />
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <h2 className="text-sm font-semibold sm:col-span-2">Op documenten en in het scherm</h2>
        <div className="sm:col-span-2">
          <FormVeld naam="slogan" label="Slogan" waarde={waarden.slogan} fout={fouten.slogan} onChange={zet('slogan')} />
        </div>
        <FormVeld
          naam="logoLight"
          label="Logo voor lichte ondergrond"
          waarde={waarden.logoLight}
          fout={fouten.logoLight}
          hint="Pad of adres van het bestand."
          onChange={zet('logoLight')}
        />
        <FormVeld
          naam="logoDark"
          label="Logo voor donkere ondergrond"
          waarde={waarden.logoDark}
          fout={fouten.logoDark}
          onChange={zet('logoDark')}
        />
      </div>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <FormVoet terug="/" bezig={bezig} opslaanLabel="Wijzigingen opslaan" />
    </form>
  )
}
