import Decimal from 'decimal.js'
import { round4 } from './money'

/**
 * De prijsengine: van inkoopprijs naar verkoopprijs.
 *
 * Eén plek voor deze berekening (ADR-0005). Het orderscherm, de
 * offertecalculator, de webshop en de partnerfeeds gebruiken dezelfde functie;
 * een tweede implementatie in de frontend is hoe je verschillen tussen scherm
 * en factuur krijgt.
 */

export type PriceRuleScope = 'GLOBAL' | 'SUPPLIER' | 'CATEGORY' | 'PRODUCT' | 'CUSTOMER' | 'CHANNEL'

export interface PriceRule {
  id: string
  scope: PriceRuleScope
  supplierId?: string | null
  categoryId?: string | null
  productId?: string | null
  customerId?: string | null
  channelId?: string | null
  /** Vanaf welk aantal deze regel geldt. */
  minQuantity: number
  marginPercent?: Decimal.Value | null
  markupAmount?: Decimal.Value | null
  /** Lager wint. Dit is de bedoelde knop om regels te ordenen. */
  priority: number
  validFrom?: Date | null
  validTo?: Date | null
  isActive: boolean
}

export interface PriceContext {
  productId: string
  categoryId?: string | null
  supplierId?: string | null
  customerId?: string | null
  channelId?: string | null
  quantity: number
  /** Peildatum; standaard nu. Maakt een prijs in het verleden navraagbaar. */
  at?: Date
}

/**
 * Specificiteit is alleen de tiebreaker als twee regels dezelfde priority
 * hebben. De volgorde hieronder is een aanname die de opdrachtgever nog moet
 * bevestigen (D-11): een regel op klantniveau gaat voor op een algemene
 * productregel, omdat hij specifieker is.
 *
 * Let op het verschil met een klantprijsafspraak verderop: dat is een vast
 * toegezegd bedrag en dat wint altijd, buiten deze ordening om. Deze lijst
 * gaat alleen over marge-regels.
 *
 * Wie het anders wil, hoeft geen code te wijzigen: priority is de knop.
 */
const SPECIFICITEIT: Record<PriceRuleScope, number> = {
  CUSTOMER: 5,
  PRODUCT: 4,
  CHANNEL: 3,
  CATEGORY: 2,
  SUPPLIER: 1,
  GLOBAL: 0,
}

interface Geldigheid {
  validFrom?: Date | null
  validTo?: Date | null
}

function geldigOpDatum(rule: Geldigheid, at: Date): boolean {
  if (rule.validFrom && rule.validFrom.getTime() > at.getTime()) return false
  if (rule.validTo && rule.validTo.getTime() < at.getTime()) return false
  return true
}

function hoortBij(rule: PriceRule, ctx: PriceContext): boolean {
  switch (rule.scope) {
    case 'GLOBAL':
      return true
    case 'SUPPLIER':
      return !!rule.supplierId && rule.supplierId === ctx.supplierId
    case 'CATEGORY':
      return !!rule.categoryId && rule.categoryId === ctx.categoryId
    case 'PRODUCT':
      return !!rule.productId && rule.productId === ctx.productId
    case 'CUSTOMER':
      return !!rule.customerId && rule.customerId === ctx.customerId
    case 'CHANNEL':
      return !!rule.channelId && rule.channelId === ctx.channelId
  }
}

/** Alle regels die op dit moment, dit aantal en deze context van toepassing zijn. */
export function applicableRules(rules: PriceRule[], ctx: PriceContext): PriceRule[] {
  const at = ctx.at ?? new Date()
  return rules
    .filter((r) => r.isActive)
    .filter((r) => r.minQuantity <= ctx.quantity)
    .filter((r) => geldigOpDatum(r, at))
    .filter((r) => hoortBij(r, ctx))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        SPECIFICITEIT[b.scope] - SPECIFICITEIT[a.scope] ||
        b.minQuantity - a.minQuantity,
    )
}

/** De regel die geldt, of null als er geen enkele van toepassing is. */
export function selectPriceRule(rules: PriceRule[], ctx: PriceContext): PriceRule | null {
  return applicableRules(rules, ctx)[0] ?? null
}

// --- Klantprijsafspraken ---------------------------------------------------

/**
 * Een met de klant afgesproken bedrag per stuk, vanaf een aantal.
 *
 * Dit is geen prijsregel: een regel rekent een marge over de inkoopprijs, een
 * afspraak is een toegezegd bedrag. Daarom wint een afspraak altijd, ongeacht
 * `priority`. Zou je afspraken ook via priority laten meedoen, dan kan een
 * verkeerd ingestelde algemene regel een commerciële toezegging overrulen,
 * en dat merkt niemand tot de klant de factuur ziet.
 */
export interface CustomerPriceAgreement {
  id: string
  customerId: string
  productId: string
  minQuantity: number
  unitPrice: Decimal.Value
  validFrom?: Date | null
  validTo?: Date | null
  isActive: boolean
}

/**
 * De afspraak die geldt: de hoogste drempel die het aantal haalt. Bij een
 * gelijke drempel wint de laagste prijs, zodat een dubbel ingevoerde afspraak
 * nooit in ons voordeel uitvalt.
 */
export function selectCustomerAgreement(
  agreements: CustomerPriceAgreement[],
  ctx: PriceContext,
): CustomerPriceAgreement | null {
  if (!ctx.customerId) return null
  const at = ctx.at ?? new Date()
  return (
    agreements
      .filter((a) => a.isActive)
      .filter((a) => a.customerId === ctx.customerId && a.productId === ctx.productId)
      .filter((a) => a.minQuantity <= ctx.quantity)
      .filter((a) => geldigOpDatum(a, at))
      .sort(
        (a, b) =>
          b.minQuantity - a.minQuantity ||
          new Decimal(a.unitPrice).comparedTo(new Decimal(b.unitPrice)),
      )[0] ?? null
  )
}

/**
 * Past één regel toe: eerst de marge als percentage op de inkoopprijs, dan een
 * eventueel vast opslagbedrag erbovenop.
 */
export function applyPriceRule(purchasePrice: Decimal.Value, rule: PriceRule): Decimal {
  let prijs = new Decimal(purchasePrice)
  if (rule.marginPercent != null) {
    prijs = prijs.times(new Decimal(1).plus(new Decimal(rule.marginPercent).dividedBy(100)))
  }
  if (rule.markupAmount != null) {
    prijs = prijs.plus(rule.markupAmount)
  }
  return round4(prijs)
}

interface PriceResultBasis {
  unitPrice: Decimal
  purchasePrice: Decimal
  /** Marge in euro's per stuk, en als percentage van de verkoopprijs. */
  marginAmount: Decimal
  marginPercent: Decimal
  /**
   * De prijs ligt onder de inkoopprijs. Geen fout - een klantafspraak mag
   * verliesgevend zijn - maar de aanroeper hoort het te laten zien.
   */
  belowCost: boolean
}

/**
 * Het resultaat zegt zelf waar de prijs vandaan komt. Een union en geen
 * optionele velden: zo is het onmogelijk om de prijsregel uit te lezen terwijl
 * een klantafspraak de prijs bepaalde.
 */
export type PriceResult =
  | (PriceResultBasis & { source: 'RULE'; rule: PriceRule })
  | (PriceResultBasis & { source: 'AGREEMENT'; agreement: CustomerPriceAgreement })

function marge(unitPrice: Decimal, inkoop: Decimal): Omit<PriceResultBasis, 'unitPrice' | 'purchasePrice'> {
  const marginAmount = round4(unitPrice.minus(inkoop))
  return {
    marginAmount,
    marginPercent: unitPrice.isZero()
      ? new Decimal(0)
      : round4(marginAmount.dividedBy(unitPrice).times(100)),
    belowCost: unitPrice.lessThan(inkoop),
  }
}

/**
 * Verkoopprijs per stuk.
 *
 * Een klantprijsafspraak gaat voor op elke prijsregel. Is er geen afspraak,
 * dan beslist de regel met de laagste `priority`.
 *
 * Geeft null terug als er geen afspraak en geen regel van toepassing is. Dat
 * is met opzet: terugvallen op de inkoopprijs zou betekenen dat er zonder
 * marge verkocht wordt zonder dat iemand het merkt. De aanroeper hoort dan te
 * stoppen en te melden dat er een prijsregel ontbreekt.
 */
export function calculateUnitSalePrice(
  purchasePrice: Decimal.Value,
  rules: PriceRule[],
  ctx: PriceContext,
  agreements: CustomerPriceAgreement[] = [],
): PriceResult | null {
  const inkoop = new Decimal(purchasePrice)

  const agreement = selectCustomerAgreement(agreements, ctx)
  if (agreement) {
    const unitPrice = round4(agreement.unitPrice)
    return { source: 'AGREEMENT', agreement, unitPrice, purchasePrice: inkoop, ...marge(unitPrice, inkoop) }
  }

  const rule = selectPriceRule(rules, ctx)
  if (!rule) return null

  const unitPrice = applyPriceRule(inkoop, rule)
  return { source: 'RULE', rule, unitPrice, purchasePrice: inkoop, ...marge(unitPrice, inkoop) }
}

// --- Inkoopstaffels --------------------------------------------------------

export interface PriceTier {
  minQuantity: number
  unitPrice: Decimal.Value
}

/**
 * De staffel die bij dit aantal hoort: de hoogste drempel die het aantal
 * haalt. Geen staffel voor dit aantal betekent null, niet "neem de eerste".
 */
export function selectTier<T extends PriceTier>(tiers: T[], quantity: number): T | null {
  return (
    tiers
      .filter((t) => t.minQuantity <= quantity)
      .sort((a, b) => b.minQuantity - a.minQuantity)[0] ?? null
  )
}
