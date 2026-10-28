'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PriceAgreementView, ProductPickerItem } from '@rgh/contracts'
import { Aanvinkveld, FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Zoekt in de catalogus; de keuze is een product, niet een vrije tekst. */
function Productkiezer({
  gekozen, fout, onKies,
}: {
  gekozen: ProductPickerItem | null
  fout?: string
  onKies: (product: ProductPickerItem | null) => void
}) {
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<ProductPickerItem[]>([])
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  async function zoek() {
    if (term.trim().length === 0) return
    setBezig(true)
    setMelding(null)
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(term.trim())}`)
      if (!res.ok) {
        setMelding('Zoeken lukte niet.')
        return
      }
      const gevonden = (await res.json()) as ProductPickerItem[]
      setTreffers(gevonden)
      if (gevonden.length === 0) setMelding('Geen product gevonden.')
    } catch {
      setMelding('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  if (gekozen) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-soft">Product</span>
        <div className="flex items-center gap-3">
          <p className="text-sm">
            {gekozen.name}
            <span className="block font-[family-name:var(--font-mono)] text-xs text-ink-faint">
              {gekozen.articleNumber}
            </span>
          </p>
          <button
            type="button"
            onClick={() => onKies(null)}
            className="text-xs font-medium text-accent hover:underline"
          >
            anders kiezen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="productzoeken" className="text-sm font-medium text-ink-soft">
        Product
      </label>
      <div className="flex gap-2">
        <Input
          id="productzoeken"
          value={term}
          placeholder="Artikelnummer of naam"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Anders verstuurt Enter het hele formulier zonder product.
              e.preventDefault()
              void zoek()
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" disabled={bezig} onClick={() => void zoek()}>
          {bezig ? 'Zoeken…' : 'Zoeken'}
        </Button>
      </div>
      {fout && <p className="text-xs text-alarm">{fout}</p>}
      {melding && <p className="text-xs text-ink-faint">{melding}</p>}
      {treffers.length > 0 && (
        <ul className="divide-y divide-rule rounded border border-rule">
          {treffers.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onKies(p)}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-sunk"
              >
                <span>
                  {p.name}
                  {!p.isActive && <span className="text-ink-faint"> (inactief)</span>}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                  {p.articleNumber}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export function PrijsafspraakFormulier({
  klantId,
  afspraak,
}: {
  klantId: string
  afspraak?: PriceAgreementView
}) {
  const router = useRouter()
  const terug = `/klanten/${klantId}`
  const { fouten, algemeen, setAlgemeen, bezig, opslaan } = useOpslaan(terug)
  const nieuw = !afspraak

  const [product, setProduct] = useState<ProductPickerItem | null>(
    afspraak
      ? {
          id: afspraak.productId,
          name: afspraak.productName,
          articleNumber: afspraak.productArticleNumber,
          isActive: true,
        }
      : null,
  )
  const [minQuantity, setMinQuantity] = useState(String(afspraak?.minQuantity ?? 1))
  const [unitPrice, setUnitPrice] = useState(afspraak?.unitPrice ?? '')
  const [note, setNote] = useState(afspraak?.note ?? '')
  const [validFrom, setValidFrom] = useState(afspraak?.validFrom?.slice(0, 10) ?? '')
  const [validTo, setValidTo] = useState(afspraak?.validTo?.slice(0, 10) ?? '')
  const [isActive, setIsActive] = useState(afspraak?.isActive ?? true)
  const [verwijderen, setVerwijderen] = useState(false)

  async function verwijder() {
    if (!confirm('Deze prijsafspraak verwijderen?')) return
    setVerwijderen(true)
    const res = await fetch(`/api/customers/${klantId}/prices/${afspraak?.id}`, { method: 'DELETE' })
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
        if (nieuw && !product) {
          setAlgemeen('Kies eerst een product.')
          return
        }
        const velden = { unitPrice, note, validFrom, validTo, isActive }
        void opslaan(
          nieuw
            ? `/api/customers/${klantId}/prices`
            : `/api/customers/${klantId}/prices/${afspraak.id}`,
          nieuw ? 'POST' : 'PATCH',
          nieuw ? { productId: product?.id, minQuantity, ...velden } : velden,
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          {nieuw ? (
            <Productkiezer gekozen={product} fout={fouten.productId} onKies={setProduct} />
          ) : (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium text-ink-soft">Product</span>
              <p className="text-sm">
                {afspraak.productName}
                <span className="block font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                  {afspraak.productArticleNumber}
                </span>
              </p>
            </div>
          )}
        </div>

        {nieuw ? (
          <FormVeld
            naam="minQuantity"
            label="Vanaf aantal"
            type="number"
            waarde={minQuantity}
            fout={fouten.minQuantity}
            hint="Product en aantal vormen samen de afspraak en liggen daarna vast."
            onChange={setMinQuantity}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Vanaf aantal</span>
            <p className="flex h-9 items-center text-sm tabular">{afspraak.minQuantity}</p>
          </div>
        )}

        <FormVeld
          naam="unitPrice"
          label="Afgesproken prijs per stuk"
          waarde={unitPrice}
          fout={fouten.unitPrice}
          hint="In euro, hoogstens vier decimalen. Een komma mag."
          onChange={setUnitPrice}
        />

        <FormVeld
          naam="validFrom"
          label="Geldig vanaf"
          type="date"
          waarde={validFrom}
          fout={fouten.validFrom}
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
            Waar komt de afspraak uit?
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
            Bijvoorbeeld: jaarafspraak 2026, of de tender waar dit uit volgt.
          </p>
        </div>

        <div className="sm:col-span-2">
          <Aanvinkveld
            naam="isActive"
            label="Afspraak geldt"
            hint="Uitzetten houdt de afspraak bewaard, maar de calculatie gebruikt hem niet."
            aangevinkt={isActive}
            onChange={setIsActive}
          />
        </div>
      </div>

      <p className="mt-3 rounded border border-rule bg-ground px-3 py-2 text-xs text-ink-soft">
        Een prijsafspraak gaat vóór op elke prijsregel: ook als een algemene regel hoger uitkomt,
        rekent de calculatie met dit bedrag.
      </p>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <FormVoet
        terug={terug}
        bezig={bezig}
        opslaanLabel={nieuw ? 'Afspraak toevoegen' : 'Wijzigingen opslaan'}
        extra={
          afspraak ? (
            <Button type="button" variant="danger" size="sm" disabled={verwijderen} onClick={verwijder}>
              {verwijderen ? 'Bezig…' : 'Verwijderen'}
            </Button>
          ) : undefined
        }
      />
    </form>
  )
}
