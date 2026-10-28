'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Aanvinkveld, FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { Button } from '@/components/ui/button'

export interface AdresWaarden {
  type: 'INVOICE' | 'DELIVERY'
  label: string
  attention: string
  street: string
  houseNumber: string
  postalCode: string
  city: string
  country: string
  isDefault: boolean
}

const LEEG: AdresWaarden = {
  type: 'DELIVERY', label: '', attention: '', street: '', houseNumber: '',
  postalCode: '', city: '', country: 'NL', isDefault: false,
}

export function AdresFormulier({
  klantId, adresId, begin = LEEG,
}: {
  klantId: string
  adresId?: string
  begin?: AdresWaarden
}) {
  const router = useRouter()
  const terug = `/klanten/${klantId}`
  const { fouten, algemeen, setAlgemeen, bezig, opslaan } = useOpslaan(terug)
  const [waarden, setWaarden] = useState(begin)
  const [verwijderen, setVerwijderen] = useState(false)
  const nieuw = !adresId

  const zet =
    <K extends keyof AdresWaarden>(veld: K) =>
    (waarde: AdresWaarden[K]) =>
      setWaarden((v) => ({ ...v, [veld]: waarde }))

  async function verwijder() {
    if (!confirm('Dit adres verwijderen?')) return
    setVerwijderen(true)
    const res = await fetch(`/api/customers/${klantId}/addresses/${adresId}`, { method: 'DELETE' })
    setVerwijderen(false)
    if (res.ok) {
      router.push(terug)
      router.refresh()
      return
    }
    const fout = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    setAlgemeen(fout?.error?.message ?? 'Verwijderen lukte niet.')
  }

  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan(
          nieuw
            ? `/api/customers/${klantId}/addresses`
            : `/api/customers/${klantId}/addresses/${adresId}`,
          nieuw ? 'POST' : 'PATCH',
          waarden,
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="type" className="text-sm font-medium text-ink-soft">
            Soort adres
          </label>
          <select
            id="type"
            name="type"
            value={waarden.type}
            onChange={(e) => zet('type')(e.target.value as AdresWaarden['type'])}
            className="h-9 w-full rounded border border-rule bg-surface px-2 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="DELIVERY">Afleveradres</option>
            <option value="INVOICE">Factuuradres</option>
          </select>
        </div>
        <FormVeld naam="label" label="Omschrijving" waarde={waarden.label} fout={fouten.label} hint="Bijvoorbeeld Hoofdkantoor" onChange={zet('label')} />

        <div className="sm:col-span-2">
          <FormVeld naam="attention" label="Ter attentie van" waarde={waarden.attention} fout={fouten.attention} onChange={zet('attention')} />
        </div>

        <FormVeld naam="street" label="Straat" waarde={waarden.street} fout={fouten.street} onChange={zet('street')} />
        <FormVeld naam="houseNumber" label="Huisnummer" waarde={waarden.houseNumber} fout={fouten.houseNumber} onChange={zet('houseNumber')} />
        <FormVeld naam="postalCode" label="Postcode" waarde={waarden.postalCode} fout={fouten.postalCode} hint="Bijvoorbeeld 1234 AB" onChange={zet('postalCode')} />
        <FormVeld naam="city" label="Plaats" waarde={waarden.city} fout={fouten.city} onChange={zet('city')} />
        <FormVeld naam="country" label="Landcode" waarde={waarden.country} fout={fouten.country} hint="Twee letters, bijvoorbeeld NL of BE" onChange={zet('country')} />

        <div className="sm:col-span-2">
          <Aanvinkveld
            naam="isDefault"
            label="Standaardadres voor deze soort"
            hint="Het vorige standaardadres verliest die rol automatisch."
            aangevinkt={waarden.isDefault}
            onChange={zet('isDefault')}
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
        opslaanLabel={nieuw ? 'Adres toevoegen' : 'Wijzigingen opslaan'}
        extra={
          !nieuw && (
            <Button type="button" variant="danger" size="sm" disabled={verwijderen} onClick={verwijder}>
              {verwijderen ? 'Bezig…' : 'Verwijderen'}
            </Button>
          )
        }
      />
    </form>
  )
}
