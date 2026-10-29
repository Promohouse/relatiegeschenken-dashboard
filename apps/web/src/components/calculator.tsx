'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  formatEuro,
  type ProductDetail, type ProductPickerItem, type QuoteLineCalculation, type QuoteTiers,
  type ShippingMethod,
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
  staffelaantallen,
  verzendwijzen,
}: {
  /** Product uit de URL, bijvoorbeeld via "Doorrekenen" op de productpagina. */
  beginProduct: ProductDetail | null
  klanten: { id: string; name: string }[]
  /** Standaardaantallen voor de staffel, uit de instellingen. */
  staffelaantallen: number[]
  /** Verzendwijzen met hun bedragen, uit de instellingen. */
  verzendwijzen: ShippingMethod[]
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
  const [verzendwijze, setVerzendwijze] = useState('')
  const [verzendkosten, setVerzendkosten] = useState('')
  const [verzendbijdrage, setVerzendbijdrage] = useState('')

  /**
   * Een verzendwijze kiezen vult de twee bedragen. Ze blijven invulbaar: het
   * tarief uit de instellingen is het gewone geval, niet de enige mogelijkheid.
   */
  function kiesVerzendwijze(naam: string) {
    setVerzendwijze(naam)
    const gekozen = verzendwijzen.find((w) => w.name === naam)
    // Met een komma in beeld, zoals een bedrag hier geschreven wordt. Bij het
    // versturen gaat er weer een punt van.
    const metKomma = (bedrag: string) => bedrag.replace('.', ',')
    setVerzendkosten(gekozen ? metKomma(gekozen.cost) : '')
    setVerzendbijdrage(gekozen ? metKomma(gekozen.contribution) : '')
  }
  const [regime, setRegime] = useState('DOMESTIC')

  const [uitkomst, setUitkomst] = useState<QuoteLineCalculation | null>(null)
  const [staffel, setStaffel] = useState<QuoteTiers | null>(null)
  const [aantallen, setAantallen] = useState(staffelaantallen.join(', '))
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  /**
   * Na het kiezen het volledige product ophalen: de zoekfunctie geeft alleen
   * nummer en naam, en voor de bedrukopties is het detail nodig.
   */
  async function kies(keuze: ProductPickerItem | null) {
    setUitkomst(null)
    setStaffel(null)
    setGekozenDruk({})
    setOppervlak({})
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

  /** Wat beide knoppen meesturen; zo kunnen ze niet uit elkaar lopen. */
  function invoer() {
    const ids = Object.keys(gekozenDruk)
    return {
      productId: product!.id,
      ...(customerId ? { customerId } : {}),
      printOptionIds: ids,
      printColors: ids.map((id) => gekozenDruk[id]),
      printAreaCm2: ids.map((id) => (oppervlak[id] || '0').replace(',', '.')),
      ...(manueel ? { manualUnitSalePrice: manueel.replace(',', '.') } : {}),
      ...(drukMarge ? { printMarginPercent: drukMarge.replace(',', '.') } : {}),
      shippingCost: verzendkosten.replace(',', '.') || '0',
      shippingContribution: verzendbijdrage.replace(',', '.') || '0',
      discountPercent: korting.replace(',', '.') || '0',
      vatRegime: regime,
    }
  }

  async function verstuur<T>(pad: string, body: unknown): Promise<T | null> {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(pad, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const fout = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(fout?.error?.message ?? 'De calculatie lukte niet.')
        return null
      }
      return (await res.json()) as T
    } catch {
      setFout('De server is niet bereikbaar.')
      return null
    } finally {
      setBezig(false)
    }
  }

  async function reken() {
    setStaffel(null)
    const uit = await verstuur<QuoteLineCalculation>('/api/quotes/calculate', {
      ...invoer(),
      quantity,
    })
    setUitkomst(uit)
  }

  /**
   * De staffel: dezelfde calculatie voor een rij aantallen. Daar vraagt een
   * klant in deze handel vrijwel altijd om, want de stuksprijs verschuift met
   * het aantal.
   */
  async function rekenStaffel() {
    setUitkomst(null)
    const lijst = aantallen
      .split(/[,;\s]+/)
      .map((a) => a.trim())
      .filter(Boolean)
    const uit = await verstuur<QuoteTiers>('/api/quotes/calculate/tiers', {
      ...invoer(),
      quantities: lijst,
    })
    setStaffel(uit)
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
              Technieken die per oppervlak rekenen gebruiken standaard de <strong>maximale</strong>{' '}
              drukmaat. Dat hoef je dus niet in te vullen, en de prijs is nooit te laag doordat
              een formaat vergeten is. Een kleiner logo kun je invullen om scherper te offreren.
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
                            placeholder="max"
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
              placeholder="leeg = de ingestelde marge"
              aria-describedby="drukMarge-hint"
              onChange={(e) => setDrukMarge(e.target.value)}
            />
            <p id="drukMarge-hint" className="text-xs text-ink-faint">
              Alleen voor deze calculatie. Leeg laten gebruikt de marge uit{' '}
              <Link href="/beheer/marges" className="hover:text-accent">
                Marges
              </Link>
              , en als daar niets staat de marge op het artikel.
            </p>
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

        <fieldset className="mt-5 rounded border border-rule p-4">
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
          <p className="mt-2 text-xs text-ink-faint">
            De tarieven komen uit{' '}
            <Link href="/beheer/instellingen" className="hover:text-accent">
              Instellingen
            </Link>{' '}
            en zijn hier aan te passen. Wat wij betalen en niet doorrekenen komt van de marge af.
          </p>
        </fieldset>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <Button type="button" disabled={bezig} onClick={() => void reken()}>
            {bezig ? 'Bezig met rekenen…' : 'Doorrekenen'}
          </Button>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="aantallen" className="text-xs font-medium text-ink-soft">
                Staffelaantallen
              </label>
              <Input
                id="aantallen"
                value={aantallen}
                onChange={(e) => setAantallen(e.target.value)}
                className="h-9 w-44"
              />
            </div>
            <Button type="button" variant="secondary" disabled={bezig} onClick={() => void rekenStaffel()}>
              Staffel tonen
            </Button>
          </div>
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

        {staffel ? (
          <div className="mt-3">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-rule text-left">
                    <th className="pb-2 pr-3 text-xs font-medium uppercase tracking-wide text-ink-faint">
                      Aantal
                    </th>
                    <th className="pb-2 pr-3 text-right text-xs font-medium uppercase tracking-wide text-ink-faint">
                      Inkoop p/st
                    </th>
                    <th className="pb-2 pr-3 text-right text-xs font-medium uppercase tracking-wide text-ink-faint">
                      Prijs p/st
                    </th>
                    <th className="pb-2 pr-3 text-right text-xs font-medium uppercase tracking-wide text-ink-faint">
                      Totaal
                    </th>
                    <th className="pb-2 text-right text-xs font-medium uppercase tracking-wide text-ink-faint">
                      Marge
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {staffel.rows.map((rij) => (
                    <tr key={rij.quantity} className="border-b border-rule last:border-0">
                      <td className="py-2 pr-3 tabular font-medium">{rij.quantity}</td>
                      {rij.calculation ? (
                        <>
                          <td className="py-2 pr-3 text-right tabular text-ink-soft">
                            {formatEuro(rij.calculation.unitPurchasePrice)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular font-medium">
                            {formatEuro(rij.calculation.allInUnitPrice)}
                          </td>
                          <td className="py-2 pr-3 text-right tabular">
                            {formatEuro(rij.calculation.subtotalExclVat)}
                          </td>
                          <td
                            className={`py-2 text-right tabular ${
                              rij.calculation.belowCost ? 'text-alarm' : 'text-ink-soft'
                            }`}
                          >
                            {rij.calculation.marginPercent}%
                          </td>
                        </>
                      ) : (
                        <td colSpan={4} className="py-2 text-xs text-alarm">
                          {rij.error}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-3 text-xs text-ink-faint">
              Prijs per stuk is inclusief bedrukking en instelkosten. Die instelkosten zijn
              eenmalig, dus bij een klein aantal wegen ze zwaarder — daar komt het verschil
              tussen de regels grotendeels vandaan. Bedragen zijn exclusief btw.
            </p>

            {staffel.rows.some((r) => r.calculation?.warnings.length) && (
              <div className="mt-3 grid gap-2">
                {staffel.rows
                  .filter((r) => r.calculation?.warnings.length)
                  .map((r) => (
                    <p key={r.quantity} className="rounded border border-wait/30 bg-wait-bg px-3 py-2 text-xs text-wait">
                      Bij {r.quantity} stuks: {r.calculation!.warnings.join(' ')}
                    </p>
                  ))}
              </div>
            )}
          </div>
        ) : !uitkomst ? (
          <p className="mt-3 text-sm text-ink-faint">
            Vul het aantal in en druk op doorrekenen, of vraag een staffel voor meerdere aantallen
            tegelijk. Er wordt niets opgeslagen; een calculatie is een vraag, geen handeling.
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
                        {p.areaCm2 !== null && ` · gerekend met ${p.areaCm2} cm²`}
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
              {Number(uitkomst.shippingCost) > 0 && (
                <>
                  <Bedrag label="Waarvan verzending" waarde={uitkomst.shippingCost} />
                  <p className="text-right text-xs text-ink-faint">
                    {Number(uitkomst.shippingContribution) > 0
                      ? `klant draagt ${formatEuro(uitkomst.shippingContribution)} bij`
                      : 'niet doorberekend'}
                    {Number(uitkomst.shippingResult) < 0 &&
                      ` — wij leggen ${formatEuro(
                        String(Math.abs(Number(uitkomst.shippingResult))),
                      )} toe`}
                  </p>
                </>
              )}
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
