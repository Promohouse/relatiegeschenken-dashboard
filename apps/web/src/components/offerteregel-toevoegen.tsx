'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ProductDetail, ProductPickerItem, ShippingMethod } from '@rgh/contracts'
import { formatEuro } from '@rgh/contracts'
import { ProductKiezer } from './product-kiezer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Een regel aan de offerte toevoegen.
 *
 * Dezelfde invoer als de calculator, maar zonder klant: die komt van de
 * offerte. Er is bewust geen voorbeeldknop - de regel verschijnt meteen in de
 * tabel met zijn bedragen, en zolang de offerte een concept is haal je hem er
 * met één klik weer af. Een tussenstap zou alleen maar een tweede plek zijn
 * waar een prijs kan staan.
 */
export function OfferteregelToevoegen({
  quoteId,
  verzendwijzen,
}: {
  quoteId: string
  verzendwijzen: ShippingMethod[]
}) {
  const router = useRouter()
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [laden, setLaden] = useState(false)
  const [aantal, setAantal] = useState('250')
  const [gekozenDruk, setGekozenDruk] = useState<Record<string, number>>({})
  const [korting, setKorting] = useState('0')
  const [manueel, setManueel] = useState('')
  const [omschrijving, setOmschrijving] = useState('')
  const [verzendwijze, setVerzendwijze] = useState('')
  const [verzendkosten, setVerzendkosten] = useState('')
  const [verzendbijdrage, setVerzendbijdrage] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  const metKomma = (bedrag: string) => bedrag.replace('.', ',')

  function kiesVerzendwijze(naam: string) {
    setVerzendwijze(naam)
    const gekozen = verzendwijzen.find((w) => w.name === naam)
    setVerzendkosten(gekozen ? metKomma(gekozen.cost) : '')
    setVerzendbijdrage(gekozen ? metKomma(gekozen.contribution) : '')
  }

  async function kies(keuze: ProductPickerItem | null) {
    setGekozenDruk({})
    setFout(null)
    if (!keuze) {
      setProduct(null)
      return
    }
    setLaden(true)
    try {
      const res = await fetch(`/api/products/${keuze.id}`)
      if (!res.ok) {
        setFout('Dit product kon niet geladen worden.')
        return
      }
      setProduct((await res.json()) as ProductDetail)
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setLaden(false)
    }
  }

  async function voegToe() {
    if (!product) {
      setFout('Zoek eerst een product.')
      return
    }
    setFout(null)
    setBezig(true)
    try {
      const ids = Object.keys(gekozenDruk)
      const res = await fetch(`/api/quotes/${quoteId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product.id,
          quantity: aantal,
          printOptionIds: ids,
          printColors: ids.map((id) => gekozenDruk[id]),
          ...(manueel ? { manualUnitSalePrice: manueel.replace(',', '.') } : {}),
          discountPercent: korting.replace(',', '.') || '0',
          shippingCost: verzendkosten.replace(',', '.') || '0',
          shippingContribution: verzendbijdrage.replace(',', '.') || '0',
          description: omschrijving,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(body?.error?.message ?? 'De regel kon niet toegevoegd worden.')
        return
      }

      // Alles leeg, zodat de volgende regel niet per ongeluk de vorige erft.
      setProduct(null)
      setGekozenDruk({})
      setManueel('')
      setOmschrijving('')
      setVerzendwijze('')
      setVerzendkosten('')
      setVerzendbijdrage('')
      router.refresh()
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <section className="mt-5 rounded border border-rule bg-surface p-5">
      <h2 className="text-sm font-semibold">Regel toevoegen</h2>

      <div className="mt-3">
        <ProductKiezer gekozen={null} onKies={(k) => void kies(k)} />
      </div>

      {laden && <p className="mt-3 text-sm text-ink-faint">Bezig met laden…</p>}

      {product && (
        <>
          <div className="mt-4 flex flex-wrap items-baseline gap-2 text-sm">
            <span className="font-medium">{product.name}</span>
            <span className="font-[family-name:var(--font-mono)] text-xs text-ink-faint">
              {product.articleNumber}
            </span>
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="aantal" className="text-sm font-medium text-ink-soft">
                Aantal
              </label>
              <Input id="aantal" value={aantal} onChange={(e) => setAantal(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="korting" className="text-sm font-medium text-ink-soft">
                Korting in procenten
              </label>
              <Input id="korting" value={korting} onChange={(e) => setKorting(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="manueel" className="text-sm font-medium text-ink-soft">
                Prijs per stuk handmatig
              </label>
              <Input
                id="manueel"
                value={manueel}
                placeholder="leeg = berekend"
                onChange={(e) => setManueel(e.target.value)}
              />
            </div>
          </div>

          {product.printOptions.length > 0 && (
            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-ink-soft">Bedrukking</legend>
              <p className="mt-1 text-xs text-ink-faint">
                Er wordt gerekend met de maximale drukmaat van de positie.
              </p>
              <div className="mt-2 grid gap-2">
                {product.printOptions.map((optie) => {
                  const aan = optie.id in gekozenDruk
                  return (
                    <div key={optie.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={aan}
                          onChange={(e) =>
                            setGekozenDruk((d) => {
                              const nieuw = { ...d }
                              if (e.target.checked) nieuw[optie.id] = 1
                              else delete nieuw[optie.id]
                              return nieuw
                            })
                          }
                          className="size-4 accent-[var(--color-accent)]"
                        />
                        {optie.printMethodName} op {optie.printPositionName}
                      </label>
                      {aan && (
                        <label className="flex items-center gap-2 text-xs text-ink-soft">
                          kleuren
                          <Input
                            value={String(gekozenDruk[optie.id])}
                            onChange={(e) =>
                              setGekozenDruk((d) => ({
                                ...d,
                                [optie.id]: Number(e.target.value) || 1,
                              }))
                            }
                            className="h-7 w-16"
                          />
                        </label>
                      )}
                    </div>
                  )
                })}
              </div>
            </fieldset>
          )}

          <fieldset className="mt-4 rounded border border-rule p-4">
            <legend className="px-1.5 text-sm font-medium text-ink-soft">
              Bijdrage verzendkosten
            </legend>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1.8fr)_1fr_1fr]">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="verzendwijze" className="text-xs font-medium text-ink-soft">
                  Verzendwijze
                </label>
                <select
                  id="verzendwijze"
                  value={verzendwijze}
                  onChange={(e) => kiesVerzendwijze(e.target.value)}
                  className="h-9 rounded border border-rule bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
                >
                  <option value="">Geen verzending</option>
                  {verzendwijzen.map((w) => (
                    <option key={w.name} value={w.name}>
                      {w.name} — kost {formatEuro(w.cost)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="verzendkosten" className="text-xs font-medium text-ink-soft">
                  Kost ons
                </label>
                <Input
                  id="verzendkosten"
                  value={verzendkosten}
                  placeholder="0,00"
                  className="tabular"
                  onChange={(e) => setVerzendkosten(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="verzendbijdrage" className="text-xs font-medium text-ink-soft">
                  Klant betaalt
                </label>
                <Input
                  id="verzendbijdrage"
                  value={verzendbijdrage}
                  placeholder="0,00"
                  className="tabular"
                  onChange={(e) => setVerzendbijdrage(e.target.value)}
                />
              </div>
            </div>
          </fieldset>

          <div className="mt-4 flex flex-col gap-1.5">
            <label htmlFor="omschrijving" className="text-sm font-medium text-ink-soft">
              Omschrijving op de offerte
            </label>
            <Input
              id="omschrijving"
              value={omschrijving}
              placeholder="leeg = de productnaam"
              onChange={(e) => setOmschrijving(e.target.value)}
            />
          </div>

          <div className="mt-4">
            <Button type="button" disabled={bezig} onClick={() => void voegToe()}>
              {bezig ? 'Bezig met toevoegen…' : 'Regel toevoegen'}
            </Button>
          </div>
        </>
      )}

      {fout && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {fout}
        </p>
      )}
    </section>
  )
}
