import Decimal from 'decimal.js'

/**
 * Bedragen en btw. Zie ADR-0005.
 *
 * - Nooit float: alle berekeningen via decimal.js.
 * - Btw per orderregel, afgerond op twee decimalen (ROUND_HALF_UP).
 * - Het ordertotaal is de som van de afgeronde regelbedragen, zodat wat op de
 *   factuur staat exact optelt.
 */

Decimal.set({ precision: 28, rounding: Decimal.ROUND_HALF_UP })

export type Money = Decimal
export const money = (v: Decimal.Value): Money => new Decimal(v)

/** Afronden op twee decimalen, commercieel (0,005 gaat omhoog). */
export const round2 = (v: Decimal.Value): Money => new Decimal(v).toDecimalPlaces(2, Decimal.ROUND_HALF_UP)

/** Afronden op vier decimalen, voor eenheidsprijzen en staffels. */
export const round4 = (v: Decimal.Value): Money => new Decimal(v).toDecimalPlaces(4, Decimal.ROUND_HALF_UP)

export type VatRegime = 'DOMESTIC' | 'EU_REVERSE_CHARGE' | 'EXPORT' | 'DOMESTIC_SHIFTED'

/**
 * Bij verlegging, intracommunautaire levering en export is het btw-tarief nul,
 * ongeacht het tarief op de regel.
 */
export function effectiveVatRate(regime: VatRegime, vatRate: Decimal.Value): Money {
  return regime === 'DOMESTIC' ? new Decimal(vatRate) : new Decimal(0)
}

export interface PrintJobInput {
  /** Wat wij de klant per stuk rekenen voor deze bedrukking. */
  unitPrice: Decimal.Value
  /** Eenmalige instelkosten voor deze bedrukking, zoals wij die doorberekenen. */
  setupCost: Decimal.Value
  /**
   * Wat de bedrukking ons per stuk kost. Telt mee in de inkoop en dus in de
   * marge.
   *
   * Zonder dit lijkt drukwerk gratis ingekocht en valt de marge te hoog uit -
   * bij een order met veel posities scheelt dat tientallen procenten. Optioneel
   * voor bestaande aanroepers, maar wie een marge toont hoort het te vullen.
   */
  unitPurchaseCost?: Decimal.Value
  /** Wat de instelkosten ons eenmalig kosten. */
  setupPurchaseCost?: Decimal.Value
}

export interface OrderLineInput {
  quantity: number
  unitSalePrice: Decimal.Value
  /** Inkoopprijs van het artikel zelf, per stuk. */
  unitPurchasePrice?: Decimal.Value
  /** Kortingspercentage op de verkoopprijs, 0-100. */
  discountPercent?: Decimal.Value
  /** Eenmalige instelkosten op de regel, los van bedrukkingen. */
  setupCost?: Decimal.Value
  /**
   * Eenmalige kosten op de regel die wíj betalen, los van bedrukkingen.
   * Verzending bijvoorbeeld: die wordt hier vaak niet doorberekend, en dan
   * drukt hij alleen op de marge. Zonder dit veld zou die marge te mooi zijn.
   */
  setupPurchaseCost?: Decimal.Value
  /** Btw-percentage, bijvoorbeeld 21. */
  vatRate: Decimal.Value
  vatRegime?: VatRegime
  printJobs?: PrintJobInput[]
}

export interface OrderLineTotals {
  subtotalExclVat: Money
  vatAmount: Money
  totalInclVat: Money
  purchaseTotal: Money
  marginAmount: Money
  /** Marge als percentage van het subtotaal; 0 als het subtotaal nul is. */
  marginPercent: Money
}

/**
 * Regeltotalen. Instelkosten zijn eenmalig, stuksprijzen en bedrukkingskosten
 * per stuk vermenigvuldigen met het aantal.
 */
export function calculateOrderLine(input: OrderLineInput): OrderLineTotals {
  const quantity = new Decimal(input.quantity)
  const discount = new Decimal(input.discountPercent ?? 0)
  const printJobs = input.printJobs ?? []

  const unitAfterDiscount = new Decimal(input.unitSalePrice).times(
    new Decimal(1).minus(discount.dividedBy(100)),
  )
  const unitPrintCost = printJobs.reduce((sum, j) => sum.plus(j.unitPrice), new Decimal(0))
  const setupTotal = printJobs
    .reduce((sum, j) => sum.plus(j.setupCost), new Decimal(0))
    .plus(input.setupCost ?? 0)

  const subtotalExclVat = round2(quantity.times(unitAfterDiscount.plus(unitPrintCost)).plus(setupTotal))

  const rate = effectiveVatRate(input.vatRegime ?? 'DOMESTIC', input.vatRate)
  const vatAmount = round2(subtotalExclVat.times(rate).dividedBy(100))
  const totalInclVat = round2(subtotalExclVat.plus(vatAmount))

  // De inkoop is het artikel plus het drukwerk. Instelkosten die wij zelf
  // betalen horen er ook bij: die zijn eenmalig, niet per stuk.
  const unitPrintPurchase = printJobs.reduce(
    (sum, j) => sum.plus(j.unitPurchaseCost ?? 0),
    new Decimal(0),
  )
  const setupPurchase = printJobs.reduce(
    (sum, j) => sum.plus(j.setupPurchaseCost ?? 0),
    new Decimal(0),
  )
  const purchaseTotal = round2(
    quantity
      .times(new Decimal(input.unitPurchasePrice ?? 0).plus(unitPrintPurchase))
      .plus(setupPurchase)
      .plus(input.setupPurchaseCost ?? 0),
  )
  const marginAmount = round2(subtotalExclVat.minus(purchaseTotal))
  const marginPercent = subtotalExclVat.isZero()
    ? new Decimal(0)
    : round2(marginAmount.dividedBy(subtotalExclVat).times(100))

  return { subtotalExclVat, vatAmount, totalInclVat, purchaseTotal, marginAmount, marginPercent }
}

/** Ordertotalen zijn de som van de al afgeronde regelbedragen. */
export function sumOrderTotals(lines: OrderLineTotals[]) {
  const zero = new Decimal(0)
  const subtotalExclVat = lines.reduce((s, l) => s.plus(l.subtotalExclVat), zero)
  const vatAmount = lines.reduce((s, l) => s.plus(l.vatAmount), zero)
  const purchaseTotal = lines.reduce((s, l) => s.plus(l.purchaseTotal), zero)
  return {
    subtotalExclVat: round2(subtotalExclVat),
    vatAmount: round2(vatAmount),
    totalInclVat: round2(subtotalExclVat.plus(vatAmount)),
    purchaseTotal: round2(purchaseTotal),
    marginAmount: round2(subtotalExclVat.minus(purchaseTotal)),
  }
}

/** Weergave in Nederlands formaat: 1.234,56 */
export function formatEuro(value: Decimal.Value): string {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(
    new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber(),
  )
}
