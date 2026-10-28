'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { describePaymentTerm, type PaymentTermView } from '@rgh/contracts'
import { Aanvinkveld, FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { Button } from '@/components/ui/button'

export function BetalingsvoorwaardeFormulier({ term }: { term?: PaymentTermView }) {
  const router = useRouter()
  const terug = '/beheer/betalingsvoorwaarden'
  const { fouten, algemeen, setAlgemeen, bezig, opslaan } = useOpslaan(terug)
  const nieuw = !term

  const [key, setKey] = useState(term?.key ?? '')
  const [name, setName] = useState(term?.name ?? '')
  const [days, setDays] = useState(String(term?.days ?? 30))
  const [endOfMonth, setEndOfMonth] = useState(term?.endOfMonth ?? false)
  const [prepaymentPercent, setPrepayment] = useState(term?.prepaymentPercent ?? '')
  const [invoiceText, setInvoiceText] = useState(term?.invoiceText ?? '')
  const [isDefault, setIsDefault] = useState(term?.isDefault ?? false)
  const [isActive, setIsActive] = useState(term?.isActive ?? true)
  const [sort, setSort] = useState(String(term?.sort ?? 100))
  const [verwijderen, setVerwijderen] = useState(false)

  /**
   * Dezelfde functie die de factuur straks gebruikt, zodat het voorbeeld in
   * het scherm niet iets anders zegt dan het document (harde regel 11).
   */
  const voorbeeld = describePaymentTerm({
    days: Number(days) || 0,
    endOfMonth,
    prepaymentPercent: prepaymentPercent === '' ? null : prepaymentPercent,
    invoiceText: invoiceText || null,
  })

  async function verwijder() {
    if (!confirm(`De betalingsvoorwaarde "${term?.name}" verwijderen?`)) return
    setVerwijderen(true)
    const res = await fetch(`/api/payment-terms/${term?.id}`, { method: 'DELETE' })
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
      className="max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        const velden = {
          name, days, endOfMonth, prepaymentPercent, invoiceText, isDefault, isActive, sort,
        }
        void opslaan(
          nieuw ? '/api/payment-terms' : `/api/payment-terms/${term.id}`,
          nieuw ? 'POST' : 'PATCH',
          nieuw ? { key, ...velden } : velden,
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <FormVeld naam="name" label="Naam" waarde={name} fout={fouten.name} onChange={setName} />
        {nieuw ? (
          <FormVeld
            naam="key"
            label="Sleutel"
            waarde={key}
            fout={fouten.key}
            hint="Kleine letters en liggende streepjes, bijvoorbeeld net_30. Wijzigt later niet."
            onChange={setKey}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Sleutel</span>
            <p className="flex h-9 items-center font-[family-name:var(--font-mono)] text-sm text-ink-faint">
              {term.key}
            </p>
          </div>
        )}

        <FormVeld
          naam="days"
          label="Aantal dagen"
          type="number"
          waarde={days}
          fout={fouten.days}
          onChange={setDays}
        />
        <FormVeld
          naam="prepaymentPercent"
          label="Vooruitbetaling in procenten"
          waarde={prepaymentPercent}
          fout={fouten.prepaymentPercent}
          hint="Leeg laten als er niets vooruit betaald hoeft te worden."
          onChange={setPrepayment}
        />

        <div className="sm:col-span-2">
          <Aanvinkveld
            naam="endOfMonth"
            label="Rekenen vanaf einde maand"
            hint="Dan vervalt de factuur zoveel dagen na de laatste dag van de factuurmaand."
            aangevinkt={endOfMonth}
            onChange={setEndOfMonth}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="invoiceText" className="text-sm font-medium text-ink-soft">
            Tekst op de factuur
          </label>
          <textarea
            id="invoiceText"
            name="invoiceText"
            rows={2}
            value={invoiceText}
            onChange={(e) => setInvoiceText(e.target.value)}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          {fouten.invoiceText ? (
            <p className="text-xs text-alarm">{fouten.invoiceText}</p>
          ) : (
            <p className="text-xs text-ink-faint">
              Leeg laten is goed: dan wordt de tekst opgebouwd uit de velden hierboven.
            </p>
          )}
        </div>

        <div className="rounded border border-rule bg-ground px-3 py-2 text-sm sm:col-span-2">
          <span className="text-ink-faint">Komt op het document als: </span>
          <span className="font-medium">{voorbeeld}</span>
        </div>

        <FormVeld
          naam="sort"
          label="Plaats in de lijst"
          type="number"
          waarde={sort}
          fout={fouten.sort}
          hint="Lager staat hoger in de keuzelijst."
          onChange={setSort}
        />

        <div className="flex flex-col gap-2.5">
          <Aanvinkveld
            naam="isDefault"
            label="Standaard voor nieuwe klanten"
            hint="Er is er precies één. Deze aanzetten haalt hem bij de vorige weg."
            aangevinkt={isDefault}
            onChange={setIsDefault}
          />
          <Aanvinkveld
            naam="isActive"
            label="Te kiezen bij een klant"
            hint="Uitzetten kan alleen als geen enkele klant deze voorwaarde heeft."
            aangevinkt={isActive}
            onChange={setIsActive}
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
        opslaanLabel={nieuw ? 'Voorwaarde aanmaken' : 'Wijzigingen opslaan'}
        extra={
          term ? (
            <Button type="button" variant="danger" size="sm" disabled={verwijderen} onClick={verwijder}>
              {verwijderen ? 'Bezig…' : 'Verwijderen'}
            </Button>
          ) : undefined
        }
      />
    </form>
  )
}
