'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  formatEuro,
  type ProductDetail, type ProductPickerItem, type QuoteLineCalculation,
} from '@rgh/contracts'
import { ProductKiezer } from './product-kiezer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const HERKOMST: Record<string, { label: string; tone: string }> = {
  RULE: { label: 'prijsregel', tone: 'bg-rest-bg text-rest' },
  AGREEMENT: { label: 'klantafspraak', tone: 'bg-ok-bg text-ok' },
  MANUAL: { label: 'handmatig', tone: 'bg-wait-bg text-wait' },
}

function Bedrag({ label, waarde, groot = false, alarm = false }: {
  label: string
  waarde: string
  groot?: boolean
  alarm?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1">
      <span className={`text-sm ${groot ? 'font-medium' : 'text-ink-soft'}`}>{label}</span>
      <span className={`tabular ${groot ? 'text-lg font-bold' : ''} ${alarm ? 'text-alarm' : ''}`}>
        {formatEuro(waarde)}
      </span>
    </div>
  )
}

export function Calculator({
  beginProduct,
  klanten,
}: {
  /** Product uit de URL, bijvoorbeeld via "Doorrekenen" op de productpagina. */
  beginProduct: ProductDetail | null
  klanten: { id: string; name: string }[]
}) {
  const [product, setProduct] = useState<ProductDetail | null>(beginProduct)
  const [laadFout, setLaadFout] = useState<string | null>(null)
  const [laden, setLaden] = useState(false)
  const [quantity, setQuantity] = useState('250')
  const [customerId, setCustomerId] = useState('')
  const [gekozenDruk, setGekozenDruk] = useState<Record<string, number>>({})
  const [oppervlak, setOppervlak] = useState<Record<string, string>>({})
  const [manueel, setManueel] = useState('')
  const [korting, setKorting] = useState('0')
  const [drukMarge, setDrukMarge] = useState('')
  const [regime, setRegime] = useState('DOMESTIC')

  const [uitkomst, setUitkomst] = useState<QuoteLineCalculation | null>(null)
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  /**
   * Na het kiezen het volledige product ophalen: de zoekfunctie geeft alleen
   * nummer en naam, en voor de bedrukopties is het detail nodig.
   */
  async function kies(keuze: ProductPickerItem | null) {
    setUitkomst(null)
    setGekozenDruk({})
    setFout(null)
    setLaadFout(null)

    if (!keuze) {
      setProduct(null)
      return
    }

    setLaden(true)
    try {
      const res = await fetch(`/api/products/${keuze.id}`)
      if (!res.ok) {
        setLaadFout('Dit product kon niet geladen worden.')
        return
      }
      setProduct((await res.json()) as ProductDetail)
    } catch {
      setLaadFout('De server is niet bereikbaar.')
    } finally {
      setLaden(false)
    }
  }

  async function reken() {
    setBezig(true)
    setFout(null)
    try {
      const ids = Object.keys(gekozenDruk)
      const res = await fetch('/api/quotes/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: product!.id,
          quantity,
          ...(customerId ? { customerId } : {}),
          printOptionIds: ids,
          printColors: ids.map((id) => gekozenDruk[id]),
          printAreaCm2: ids.map((id) => (oppervlak[id] || '0').replace(',', '.')),
          ...(manueel ? { manualUnitSalePrice: manueel.replace(',', '.') } : {}),
          ...(drukMarge ? { printMarginPercent: drukMarge.replace(',', '.') } : {}),
          discountPercent: korting.replace(',', '.') || '0',
          vatRegime: regime,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(body?.error?.message ?? 'De calculatie lukte niet.')
        setUitkomst(null)
        return
      }
      setUitkomst((await res.json()) as QuoteLineCalculation)
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  const herkomst = uitkomst ? HERKOMST[uitkomst.priceOrigin] : null

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded border border-rule bg-surface p-5">
        <h2 className="text-sm font-semibold">Wat wordt er gevraagd</h2>

        <div className="mt-4">
          <ProductKiezer
            gekozen={
              product
                ? {
                    id: product.id,
                    articleNumber: product.articleNumber,
                    name: product.name,
                    isActive: product.isActive,
                  }
                : null
            }
            onKies={(keuze) => void kies(keuze)}
          />
          {laden && <p className="mt-1 text-xs text-ink-faint">Productgegevens ophalen…</p>}
          {laadFout && <p className="mt-1 text-xs text-alarm">{laadFout}</p>}
          {product && (
            <p className="mt-1 text-xs text-ink-faint">
              {product.variantCount} varianten ·{' '}
              <Link href={`/producten/${product.id}`} className="text-accent hover:underline">
                naar het product
              </Link>
            </p>
          )}
        </div>

        {!product ? (
          <p className="mt-4 text-sm text-ink-faint">
            Zoek eerst een product op artikelnummer of naam.
          </p>
        ) : (
        <>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="quantity" className="text-sm font-medium text-ink-soft">
              Aantal
            </label>
            <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="customerId" className="text-sm font-medium text-ink-soft">
              Klant
            </label>
            <select
              id="customerId"
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              className="h-9 rounded border border-rule bg-surface px-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Geen klant — algemene prijs</option>
              {klanten.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-ink-faint">Een klant laat zijn prijsafspraken meetellen.</p>
          </div>
        </div>

        {product!.printOptions.length > 0 && (
          <fieldset className="mt-5">
            <legend className="text-sm font-medium text-ink-soft">Bedrukking</legend>
            <p className="mt-1 text-xs text-ink-faint">
              Het logoformaat is alleen nodig bij technieken die per oppervlak rekenen; die
              weigeren zonder.
            </p>
            <div className="mt-2 grid gap-2">
              {product!.printOptions.map((optie) => {
                const aan = optie.id in gekozenDruk
                return (
                  <div key={optie.id} className="flex flex-wrap items-center gap-3 text-sm">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={aan}
                        onChange={(e) =>
                          setGekozenDruk((g) => {
                            const nieuw = { ...g }
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
                      <>
                        <label className="flex items-center gap-2 text-xs text-ink-soft">
                          kleuren
                          <Input
                            type="number"
                            min={1}
                            max={optie.maxColors || 12}
                            value={gekozenDruk[optie.id]}
                            onChange={(e) =>
                              setGekozenDruk((g) => ({ ...g, [optie.id]: Number(e.target.value) || 1 }))
                            }
                            className="h-7 w-16"
                          />
                          <span className="text-ink-faint">
                            {optie.maxColors === 0 ? 'onbeperkt' : `max ${optie.maxColors}`}
                          </span>
                        </label>
                        <label className="flex items-center gap-2 text-xs text-ink-soft">
                          logo cm²
                          <Input
                            value={oppervlak[optie.id] ?? ''}
                            placeholder="bv. 12"
                            onChange={(e) =>
                              setOppervlak((o) => ({ ...o, [optie.id]: e.target.value }))
                            }
                            className="h-7 w-20"
                          />
                          {optie.maxPrintWidthMm && optie.maxPrintHeightMm && (
                            <span className="text-ink-faint">
                              max {optie.maxPrintWidthMm} × {optie.maxPrintHeightMm} mm
                            </span>
                          )}
                        </label>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </fieldset>
        )}

        <div className="mt-5 grid gap-4 sm:grid-cols-2">
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
          <div className="flex flex-col gap-1.5">
            <label htmlFor="korting" className="text-sm font-medium text-ink-soft">
              Korting in procenten
            </label>
            <Input id="korting" value={korting} onChange={(e) => setKorting(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="drukMarge" className="text-sm font-medium text-ink-soft">
              Marge op drukwerk
            </label>
            <Input
              id="drukMarge"
              value={drukMarge}
              placeholder="leeg = zelfde als artikel"
              onChange={(e) => setDrukMarge(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="regime" className="text-sm font-medium text-ink-soft">
              Btw
            </label>
            <select
              id="regime"
              value={regime}
              onChange={(e) => setRegime(e.target.value)}
              className="h-9 rounded border border-rule bg-surface px-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="DOMESTIC">Binnenland</option>
              <option value="EU_REVERSE_CHARGE">Intracommunautair, verlegd</option>
              <option value="EXPORT">Export</option>
              <option value="DOMESTIC_SHIFTED">Binnenland verlegd</option>
            </select>
          </div>
        </div>

        <div className="mt-5">
          <Button type="button" disabled={bezig} onClick={() => void reken()}>
            {bezig ? 'Bezig met rekenen…' : 'Doorrekenen'}
          </Button>
        </div>

        {fout && (
          <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
            {fout}
          </p>
        )}
        </>
        )}
      </div>

      <div className="rounded border border-rule bg-surface p-5">
        <h2 className="text-sm font-semibold">Uitkomst</h2>

        {!uitkomst ? (
          <p className="mt-3 text-sm text-ink-faint">
            Vul het aantal in en druk op doorrekenen. Er wordt niets opgeslagen; een calculatie is
            een vraag, geen handeling.
          </p>
        ) : (
          <>
            {uitkomst.warnings.map((melding) => (
              <p
                key={melding}
                className="mt-3 rounded border border-wait/30 bg-wait-bg px-3 py-2 text-sm text-wait"
              >
                {melding}
              </p>
            ))}

            <div className="mt-4 border-b border-rule pb-3">
              <div className="flex items-baseline justify-between gap-4">
                <span className="text-sm text-ink-soft">Inkoop per stuk</span>
                <span className="tabular">
                  {formatEuro(uitkomst.unitPurchasePrice)}
                  {uitkomst.purchaseTierMinQuantity !== null && (
                    <span className="ml-2 text-xs text-ink-faint">
                      staffel vanaf {uitkomst.purchaseTierMinQuantity}
                    </span>
                  )}
                </span>
              </div>
              <div className="mt-1 flex items-baseline justify-between gap-4">
                <span className="text-sm text-ink-soft">Verkoop per stuk</span>
                <span className="tabular">
                  {formatEuro(uitkomst.effectiveUnitPrice)}
                  {herkomst && (
                    <span className={`ml-2 rounded px-1.5 py-0.5 text-xs ${herkomst.tone}`}>
                      {herkomst.label}
                    </span>
                  )}
                </span>
              </div>
              {uitkomst.priceOrigin === 'MANUAL' && (
                <p className="mt-1 text-xs text-ink-faint">
                  Berekend was {formatEuro(uitkomst.calculatedUnitSalePrice)} — {uitkomst.priceOriginLabel}.
                </p>
              )}
              {uitkomst.priceOrigin !== 'MANUAL' && (
                <p className="mt-1 text-xs text-ink-faint">{uitkomst.priceOriginLabel}.</p>
              )}
            </div>

            {uitkomst.printPositions.length > 0 && (
              <div className="border-b border-rule py-3">
                <p className="text-xs uppercase tracking-wide text-ink-faint">Bedrukking</p>
                {uitkomst.printPositions.map((p) => (
                  <div key={`${p.positionName}-${p.methodName}`} className="mt-1 text-sm">
                    <div className="flex items-baseline justify-between gap-4">
                      <span className="text-ink-soft">
                        {p.methodName} op {p.positionName}, {p.colors}{' '}
                        {p.colors === 1 ? 'kleur' : 'kleuren'}
                      </span>
                      <span className="tabular">{formatEuro(p.unitSalePrice)} p/st</span>
                    </div>
                    <div className="flex items-baseline justify-between gap-4 text-xs text-ink-faint">
                      <span>
                        inkoop {formatEuro(p.unitPurchaseCost)} · marge {p.marginPercent}%
                      </span>
                      <span className="tabular">instelkosten {formatEuro(p.setupSaleCost)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="border-b border-rule py-3">
              {/* De vraag die een klant stelt: wat kost er één? Alles erin,
                  dus ook de instelkosten verdeeld over de oplage. */}
              <div className="mb-2 flex items-baseline justify-between gap-4 rounded bg-sunk px-3 py-2">
                <span className="text-sm font-medium">
                  <span>Prijs per stuk</span>
                  <span className="block text-xs font-normal text-ink-faint">
                    inclusief bedrukking en instelkosten, bij {uitkomst.quantity} stuks
                  </span>
                </span>
                <span className="tabular text-lg font-bold">
                  {formatEuro(uitkomst.allInUnitPrice)}
                </span>
              </div>

              <Bedrag label={`Subtotaal (${uitkomst.quantity} stuks)`} waarde={uitkomst.subtotalExclVat} />
              <Bedrag label={`Btw ${uitkomst.vatRate}%`} waarde={uitkomst.vatAmount} />
              <Bedrag label="Totaal inclusief btw" waarde={uitkomst.totalInclVat} groot />
            </div>

            <div className="py-3">
              <Bedrag label="Inkoopwaarde" waarde={uitkomst.purchaseTotal} />
              <Bedrag
                label="Marge"
                waarde={uitkomst.marginAmount}
                groot
                alarm={uitkomst.belowCost}
              />
              <p className={`text-right text-sm ${uitkomst.belowCost ? 'text-alarm' : 'text-ink-soft'}`}>
                {uitkomst.marginPercent}% van de verkoopprijs
              </p>
              {uitkomst.belowCost && (
                <p className="mt-2 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
                  Deze prijs ligt onder de inkoop. Dat mag een keuze zijn, maar niet per ongeluk.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
