'use client'

import { useState } from 'react'
import {
  BASIS_LABELS, toCostMarkupPercent, toPriceFactor, toSaleMarginPercent,
  type PriceRuleView, type ProductPickerItem,
} from '@rgh/contracts'
import { Aanvinkveld, FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { ProductKiezer } from './product-kiezer'

/** De bereiken waarvoor een kiezer bestaat. Zie de toelichting in het scherm. */
const BEREIKEN = [
  { waarde: 'GLOBAL', label: 'Standaard — geldt voor alles' },
  { waarde: 'CUSTOMER', label: 'Eén klant' },
  { waarde: 'PRODUCT', label: 'Eén product' },
] as const

/**
 * Wat dit percentage in de andere eenheid is. De omrekening komt uit
 * `@rgh/contracts`, zodat het scherm nooit een ander antwoord geeft dan de
 * berekening.
 */
function Omgerekend({ waarde, basis }: { waarde: string; basis: 'COST' | 'SALE' }) {
  const getal = Number(waarde.replace(',', '.'))
  if (!waarde.trim() || Number.isNaN(getal)) return null

  try {
    // De factor erbij: dat is het getal waar in deze handel mee gerekend
    // wordt, en het maakt een vergissing tussen de twee meteen zichtbaar.
    const factor = `inkoop × ${toPriceFactor(getal, basis).toFixed(2).replace('.', ',')}`
    return basis === 'COST' ? (
      <>Dat is {toSaleMarginPercent(getal, 'COST').toFixed(2)}% van de verkoopprijs ({factor}).</>
    ) : (
      <>Dat is {toCostMarkupPercent(getal, 'SALE').toFixed(2)}% opslag op de inkoop ({factor}).</>
    )
  } catch {
    return <>Een marge van 100% of meer van de verkoopprijs kan niet.</>
  }
}

export function MargeregelFormulier({
  regel,
  klanten,
  vasteKlantId,
  terug,
}: {
  regel?: PriceRuleView
  klanten: { id: string; name: string }[]
  /** Komt de gebruiker van een klantpagina, dan ligt de klant al vast. */
  vasteKlantId?: string
  terug: string
}) {
  const { fouten, algemeen, bezig, opslaan } = useOpslaan(terug)
  const nieuw = !regel

  const [scope, setScope] = useState<'GLOBAL' | 'CUSTOMER' | 'PRODUCT'>(
    (regel?.scope as 'GLOBAL' | 'CUSTOMER' | 'PRODUCT') ?? (vasteKlantId ? 'CUSTOMER' : 'GLOBAL'),
  )
  const [customerId, setCustomerId] = useState(vasteKlantId ?? regel?.targetId ?? '')
  const [product, setProduct] = useState<ProductPickerItem | null>(null)
  const [marginBasis, setMarginBasis] = useState<'COST' | 'SALE'>(regel?.marginBasis ?? 'SALE')
  const [marginPercent, setMarginPercent] = useState(regel?.marginPercent ?? '')
  const [printMarginPercent, setPrintMarginPercent] = useState(regel?.printMarginPercent ?? '')
  const [minQuantity, setMinQuantity] = useState(String(regel?.minQuantity ?? 1))
  const [priority, setPriority] = useState(String(regel?.priority ?? 100))
  const [note, setNote] = useState(regel?.note ?? '')
  const [validFrom, setValidFrom] = useState(regel?.validFrom?.slice(0, 10) ?? '')
  const [validTo, setValidTo] = useState(regel?.validTo?.slice(0, 10) ?? '')
  const [isActive, setIsActive] = useState(regel?.isActive ?? true)

  return (
    <form
      className="max-w-xl"
      onSubmit={(e) => {
        e.preventDefault()
        const velden = {
          marginBasis, marginPercent, printMarginPercent,
          minQuantity, priority, note, validFrom, validTo, isActive,
        }
        void opslaan(
          nieuw ? '/api/price-rules' : `/api/price-rules/${regel.id}`,
          nieuw ? 'POST' : 'PATCH',
          nieuw
            ? {
                scope,
                ...(scope === 'CUSTOMER' ? { customerId } : {}),
                ...(scope === 'PRODUCT' ? { productId: product?.id ?? '' } : {}),
                ...velden,
              }
            : velden,
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        {nieuw ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="scope" className="text-sm font-medium text-ink-soft">
              Waarvoor geldt deze regel?
            </label>
            <select
              id="scope"
              name="scope"
              value={scope}
              disabled={!!vasteKlantId}
              onChange={(e) => setScope(e.target.value as typeof scope)}
              className="h-9 rounded border border-rule bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none disabled:text-ink-faint"
            >
              {BEREIKEN.map((b) => (
                <option key={b.waarde} value={b.waarde}>{b.label}</option>
              ))}
            </select>
            <p className="text-xs text-ink-faint">
              Een specifiekere regel gaat voor. Het bereik ligt na opslaan vast; een ander bereik
              is een andere regel.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="text-sm font-medium text-ink-soft">Waarvoor geldt deze regel?</span>
            <p className="text-sm">
              {regel.targetName ?? 'Standaard — geldt voor alles zonder eigen regel'}
            </p>
          </div>
        )}

        {nieuw && scope === 'CUSTOMER' && !vasteKlantId && (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label htmlFor="customerId" className="text-sm font-medium text-ink-soft">
              Klant
            </label>
            <select
              id="customerId"
              name="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-9 rounded border border-rule bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
            >
              <option value="">Kies een klant</option>
              {klanten.map((k) => (
                <option key={k.id} value={k.id}>{k.name}</option>
              ))}
            </select>
            {fouten.customerId && <p className="text-xs text-alarm">{fouten.customerId}</p>}
          </div>
        )}

        {nieuw && scope === 'PRODUCT' && (
          <div className="sm:col-span-2">
            <ProductKiezer gekozen={product} fout={fouten.productId} onKies={setProduct} />
          </div>
        )}

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="marginBasis" className="text-sm font-medium text-ink-soft">
            Hoe is het percentage bedoeld?
          </label>
          <select
            id="marginBasis"
            name="marginBasis"
            value={marginBasis}
            onChange={(e) => setMarginBasis(e.target.value as 'COST' | 'SALE')}
            className="h-9 rounded border border-rule bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
          >
            {(['SALE', 'COST'] as const).map((b) => (
              <option key={b} value={b}>{BASIS_LABELS[b]}</option>
            ))}
          </select>
          <p className="text-xs text-ink-faint">
            Deze twee worden het vaakst door elkaar gehaald: 40% marge op de verkoopprijs is 66,67%
            opslag op de inkoop. Daarom staat het er apart bij in plaats van dat je het uit het
            getal moet opmaken.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <FormVeld
            naam="marginPercent"
            label="Op het artikel"
            waarde={marginPercent}
            fout={fouten.marginPercent}
            onChange={setMarginPercent}
          />
          {!fouten.marginPercent && (
            <p className="text-xs text-ink-faint">
              <Omgerekend waarde={marginPercent} basis={marginBasis} />
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <FormVeld
            naam="printMarginPercent"
            label="Op de bedrukking"
            waarde={printMarginPercent}
            fout={fouten.printMarginPercent}
            onChange={setPrintMarginPercent}
          />
          {!fouten.printMarginPercent && (
            <p className="text-xs text-ink-faint">
              {printMarginPercent.trim() ? (
                <Omgerekend waarde={printMarginPercent} basis={marginBasis} />
              ) : (
                'Leeg laten betekent: bedrukking volgt de marge op het artikel.'
              )}
            </p>
          )}
        </div>

        <FormVeld
          naam="minQuantity"
          label="Vanaf aantal"
          type="number"
          waarde={minQuantity}
          fout={fouten.minQuantity}
          hint="Voor een andere marge bij grotere oplagen."
          onChange={setMinQuantity}
        />
        <FormVeld
          naam="priority"
          label="Voorrang"
          type="number"
          waarde={priority}
          fout={fouten.priority}
          hint="Lager wint. Dit is de knop als twee regels allebei passen."
          onChange={setPriority}
        />

        <FormVeld
          naam="validFrom"
          label="Geldig vanaf"
          type="date"
          waarde={validFrom}
          fout={fouten.validFrom}
          hint="Leeg = nu. Vooruit zetten kan: een verhoging klaarzetten."
          onChange={setValidFrom}
        />
        <FormVeld
          naam="validTo"
          label="Geldig tot en met"
          type="date"
          waarde={validTo}
          fout={fouten.validTo}
          onChange={setValidTo}
        />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="note" className="text-sm font-medium text-ink-soft">
            Waar komt deze regel uit?
          </label>
          <textarea
            id="note"
            name="note"
            rows={2}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-ink-faint">
            Bijvoorbeeld: jaarafspraak 2026, of waarom deze klant scherper zit.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Aanvinkveld
            naam="isActive"
            label="Regel geldt"
            hint="Uitzetten bewaart de regel, maar de calculatie gebruikt hem niet meer."
            aangevinkt={isActive}
            onChange={setIsActive}
          />
        </div>
      </div>

      <p className="mt-3 rounded border border-rule bg-ground px-3 py-2 text-xs text-ink-soft">
        Een klantprijsafspraak gaat nog vóór deze regel: die noemt een afgesproken bedrag per stuk
        en wint altijd. Een afspraak raakt de bedrukking niet — die blijft deze marge volgen.
      </p>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <FormVoet terug={terug} bezig={bezig} opslaanLabel={nieuw ? 'Regel opslaan' : 'Wijzigingen opslaan'} />
    </form>
  )
}
