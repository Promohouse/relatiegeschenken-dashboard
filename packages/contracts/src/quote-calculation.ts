import Decimal from 'decimal.js'
import { z } from 'zod'
import { calculateOrderLine, round2, round4, type OrderLineTotals, type VatRegime } from './money'

/**
 * De offertecalculatie: van inkoop naar verkoopprijs, met bedrukking.
 *
 * Staat hier en niet in de api omdat het orderscherm, de offerte, de webshop
 * en straks de partnerfeeds met dezelfde som moeten rekenen (harde regel 11).
 * Alles wat de database weet - staffels, prijsregels, klantafspraken - wordt
 * er door de aanroeper ingestopt; deze functie rekent alleen.
 *
 * Twee dingen die bewust zichtbaar blijven in de uitkomst:
 *
 * - **waar de verkoopprijs vandaan komt**: een prijsregel, een klantafspraak,
 *   of een handmatig ingevoerd bedrag. Een prijs zonder herkomst is niet na
 *   te rekenen als een klant belt;
 * - **de werkelijke marge**, ook na handmatige aanpassing. Wie een prijs
 *   verlaagt hoort meteen te zien wat er overblijft.
 */

export type PriceOrigin = 'RULE' | 'AGREEMENT' | 'MANUAL'

export interface PrintPositionInput {
  /** Herkenbare naam voor in de uitkomst, bijvoorbeeld "Voorzijde". */
  positionName: string
  methodName: string
  colors: number
  /** Inkoopprijs van de bedrukking per stuk. */
  unitPurchaseCost: Decimal.Value
  /** Eenmalige instelkosten bij de leverancier. */
  setupPurchaseCost: Decimal.Value
  /**
   * Marge op het drukwerk in procenten. Leeg betekent: dezelfde marge als op
   * het artikel, zodat een offerte niet per ongeluk drukwerk zonder marge
   * bevat.
   */
  marginPercent?: Decimal.Value | null
}

export interface QuoteLineInput {
  quantity: number
  /** Inkoopprijs van het artikel per stuk, uit de staffel. */
  unitPurchasePrice: Decimal.Value
  /** Verkoopprijs per stuk zoals de prijsengine hem bepaalde. */
  unitSalePrice: Decimal.Value
  priceOrigin: Exclude<PriceOrigin, 'MANUAL'>
  /** Handmatig bedrag dat de berekende prijs vervangt. */
  manualUnitSalePrice?: Decimal.Value | null
  /** Korting op de verkoopprijs, 0-100. */
  discountPercent?: Decimal.Value
  /** Eenmalige kosten op de regel die niets met bedrukking te maken hebben. */
  otherSetupCost?: Decimal.Value
  vatRate: Decimal.Value
  vatRegime?: VatRegime
  printPositions?: PrintPositionInput[]
}

export interface PrintPositionResult {
  positionName: string
  methodName: string
  colors: number
  unitPurchaseCost: Decimal
  setupPurchaseCost: Decimal
  marginPercent: Decimal
  unitSalePrice: Decimal
  setupSaleCost: Decimal
}

export interface QuoteLineResult extends OrderLineTotals {
  /** De prijs per stuk die werkelijk gerekend wordt, na korting. */
  effectiveUnitPrice: Decimal
  priceOrigin: PriceOrigin
  /** De berekende prijs, ook als er handmatig een andere is ingevoerd. */
  calculatedUnitSalePrice: Decimal
  printPositions: PrintPositionResult[]
  /** Totale eenmalige kosten op de regel, bedrukking plus overig. */
  setupTotal: Decimal
  /** De prijs ligt onder de inkoop; verliesgevend, maar soms een keuze. */
  belowCost: boolean
}

/** Marge als percentage van de verkoopprijs, de maat die in de handel telt. */
function margePercentage(verkoop: Decimal, inkoop: Decimal): Decimal {
  if (verkoop.isZero()) return new Decimal(0)
  return round2(verkoop.minus(inkoop).dividedBy(verkoop).times(100))
}

/**
 * Een opslag die een gegeven margepercentage oplevert.
 *
 * Let op het verschil met een opslag *op* de inkoopprijs: 40% marge op de
 * verkoopprijs is een opslag van 66,7% op de inkoop. Dat is de verwarring
 * waar in deze handel het vaakst geld mee verloren gaat, dus staat het hier
 * in één functie met een naam die zegt wat hij doet.
 */
export function salePriceForMargin(purchase: Decimal.Value, marginPercent: Decimal.Value): Decimal {
  const marge = new Decimal(marginPercent)
  if (marge.greaterThanOrEqualTo(100)) {
    throw new Error('Een marge van 100% of meer op de verkoopprijs kan niet.')
  }
  return round4(new Decimal(purchase).dividedBy(new Decimal(1).minus(marge.dividedBy(100))))
}

export function calculateQuoteLine(input: QuoteLineInput): QuoteLineResult {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new Error('Het aantal moet een geheel getal groter dan nul zijn.')
  }

  const berekend = round4(input.unitSalePrice)
  const handmatig =
    input.manualUnitSalePrice === null || input.manualUnitSalePrice === undefined
      ? null
      : round4(input.manualUnitSalePrice)

  const unitSalePrice = handmatig ?? berekend
  const priceOrigin: PriceOrigin = handmatig === null ? input.priceOrigin : 'MANUAL'

  const inkoop = new Decimal(input.unitPurchasePrice)
  // De marge op het artikel is de maat die het drukwerk standaard volgt.
  const artikelMarge = margePercentage(unitSalePrice, inkoop)

  const posities: PrintPositionResult[] = (input.printPositions ?? []).map((positie) => {
    const marge = positie.marginPercent ?? artikelMarge
    const inkoopDruk = new Decimal(positie.unitPurchaseCost)
    const inkoopSetup = new Decimal(positie.setupPurchaseCost)

    // Een marge van 100% of meer bestaat niet; dan zou de prijs oneindig zijn.
    const bruikbareMarge = new Decimal(marge).greaterThanOrEqualTo(100)
      ? new Decimal(0)
      : new Decimal(marge)

    return {
      positionName: positie.positionName,
      methodName: positie.methodName,
      colors: positie.colors,
      unitPurchaseCost: round4(inkoopDruk),
      setupPurchaseCost: round4(inkoopSetup),
      marginPercent: round2(bruikbareMarge),
      unitSalePrice: inkoopDruk.isZero() ? new Decimal(0) : salePriceForMargin(inkoopDruk, bruikbareMarge),
      setupSaleCost: inkoopSetup.isZero() ? new Decimal(0) : salePriceForMargin(inkoopSetup, bruikbareMarge),
    }
  })

  const totalen = calculateOrderLine({
    quantity: input.quantity,
    unitSalePrice,
    unitPurchasePrice: inkoop,
    discountPercent: input.discountPercent,
    setupCost: input.otherSetupCost,
    vatRate: input.vatRate,
    vatRegime: input.vatRegime,
    printJobs: posities.map((p) => ({
      unitPrice: p.unitSalePrice,
      setupCost: p.setupSaleCost,
      unitPurchaseCost: p.unitPurchaseCost,
      setupPurchaseCost: p.setupPurchaseCost,
    })),
  })

  const korting = new Decimal(input.discountPercent ?? 0)
  const effectiveUnitPrice = round4(unitSalePrice.times(new Decimal(1).minus(korting.dividedBy(100))))
  const setupTotal = round4(
    posities
      .reduce((som, p) => som.plus(p.setupSaleCost), new Decimal(0))
      .plus(input.otherSetupCost ?? 0),
  )

  return {
    ...totalen,
    effectiveUnitPrice,
    priceOrigin,
    calculatedUnitSalePrice: berekend,
    printPositions: posities,
    setupTotal,
    belowCost: totalen.marginAmount.isNegative(),
  }
}

// --- Schema's --------------------------------------------------------------

export const calculateQuoteLineSchema = z.object({
  productId: z.string({ error: 'Kies een product' }).uuid('Kies een product'),
  variantId: z.string().uuid().optional(),
  quantity: z.coerce
    .number({ error: 'Vul een aantal in' })
    .int('Het aantal is een heel getal')
    .min(1, 'Een offerte begint bij 1 stuk')
    .max(1_000_000),
  /** Klant waarvoor geprijsd wordt; laat klantafspraken meetellen. */
  customerId: z.string().uuid().optional(),
  /** Dwingt een bepaalde leverancier af; anders de voorkeursleverancier. */
  productSupplierId: z.string().uuid().optional(),
  printOptionIds: z.array(z.string().uuid()).default([]),
  /** Aantal kleuren per gekozen bedrukoptie, in dezelfde volgorde. */
  printColors: z.array(z.coerce.number().int().min(1).max(12)).default([]),
  /**
   * Oppervlak van het logo in cm2 per gekozen bedrukoptie, in dezelfde
   * volgorde. Nodig bij technieken die per oppervlak rekenen; die weigeren
   * zonder.
   */
  printAreaCm2: z.array(z.coerce.number().min(0).max(100000)).default([]),
  printMarginPercent: z.coerce.number().min(0).max(99.99).optional(),
  manualUnitSalePrice: z.coerce.number().min(0).optional(),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  otherSetupCost: z.coerce.number().min(0).default(0),
  vatRegime: z.enum(['DOMESTIC', 'EU_REVERSE_CHARGE', 'EXPORT', 'DOMESTIC_SHIFTED']).default('DOMESTIC'),
})

export const quoteLineCalculationSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  articleNumber: z.string(),
  quantity: z.number().int(),
  supplierName: z.string().nullable(),
  /** Welke inkoopstaffel gekozen is; maakt de prijs navraagbaar. */
  purchaseTierMinQuantity: z.number().int().nullable(),
  unitPurchasePrice: z.string(),
  unitSalePrice: z.string(),
  effectiveUnitPrice: z.string(),
  calculatedUnitSalePrice: z.string(),
  priceOrigin: z.enum(['RULE', 'AGREEMENT', 'MANUAL']),
  /** Leesbare uitleg van waar de prijs vandaan komt. */
  priceOriginLabel: z.string(),
  discountPercent: z.string(),
  vatRate: z.string(),
  vatRegime: z.string(),
  printPositions: z.array(
    z.object({
      positionName: z.string(),
      methodName: z.string(),
      colors: z.number().int(),
      unitPurchaseCost: z.string(),
      setupPurchaseCost: z.string(),
      marginPercent: z.string(),
      unitSalePrice: z.string(),
      setupSaleCost: z.string(),
    }),
  ),
  setupTotal: z.string(),
  subtotalExclVat: z.string(),
  vatAmount: z.string(),
  totalInclVat: z.string(),
  purchaseTotal: z.string(),
  marginAmount: z.string(),
  marginPercent: z.string(),
  belowCost: z.boolean(),
  /** Opmerkingen die het scherm hoort te tonen, bijvoorbeeld over voorraad. */
  warnings: z.array(z.string()),
})

export type CalculateQuoteLine = z.infer<typeof calculateQuoteLineSchema>
export type QuoteLineCalculation = z.infer<typeof quoteLineCalculationSchema>
