'use client'

import { useState } from 'react'
import { Aanvinkveld, FormVeld, FormVoet, useOpslaan } from './deelformulier'

export interface ContactWaarden {
  firstName: string
  lastName: string
  jobTitle: string
  email: string
  phone: string
  isPrimary: boolean
}

const LEEG: ContactWaarden = {
  firstName: '', lastName: '', jobTitle: '', email: '', phone: '', isPrimary: false,
}

export function ContactpersoonFormulier({
  klantId, contactId, begin = LEEG,
}: {
  klantId: string
  contactId?: string
  begin?: ContactWaarden
}) {
  const terug = `/klanten/${klantId}`
  const { fouten, algemeen, bezig, opslaan } = useOpslaan(terug)
  const [waarden, setWaarden] = useState(begin)
  const nieuw = !contactId

  const zet =
    <K extends keyof ContactWaarden>(veld: K) =>
    (waarde: ContactWaarden[K]) =>
      setWaarden((v) => ({ ...v, [veld]: waarde }))

  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan(
          nieuw
            ? `/api/customers/${klantId}/contacts`
            : `/api/customers/${klantId}/contacts/${contactId}`,
          nieuw ? 'POST' : 'PATCH',
          waarden,
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <FormVeld naam="firstName" label="Voornaam" waarde={waarden.firstName} fout={fouten.firstName} onChange={zet('firstName')} />
        <FormVeld naam="lastName" label="Achternaam" waarde={waarden.lastName} fout={fouten.lastName} onChange={zet('lastName')} />
        <div className="sm:col-span-2">
          <FormVeld naam="jobTitle" label="Functie" waarde={waarden.jobTitle} fout={fouten.jobTitle} onChange={zet('jobTitle')} />
        </div>
        <FormVeld naam="email" label="E-mailadres" type="email" waarde={waarden.email} fout={fouten.email} onChange={zet('email')} />
        <FormVeld naam="phone" label="Telefoon" waarde={waarden.phone} fout={fouten.phone} onChange={zet('phone')} />
        <div className="sm:col-span-2">
          <Aanvinkveld
            naam="isPrimary"
            label="Hoofdcontact voor deze klant"
            hint="Een vorig hoofdcontact verliest die rol automatisch."
            aangevinkt={waarden.isPrimary}
            onChange={zet('isPrimary')}
          />
        </div>
      </div>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <FormVoet
        terug={terug}
        bezig={bezig}
        opslaanLabel={nieuw ? 'Contactpersoon toevoegen' : 'Wijzigingen opslaan'}
      />
    </form>
  )
}
