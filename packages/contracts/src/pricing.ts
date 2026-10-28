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
 * bevestigen: een klantafspraak gaat voor op een algemene productregel, omdat
 * een klantafspraak een commerciële toezegging is.
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

function geldigOpDatum(rule: PriceRule, at: Date): boolean {
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

export interface PriceResult {
  unitPrice: Decimal
  rule: PriceRule
  purchasePrice: Decimal
  /** Marge in euro's per stuk, en als percentage van de verkoopprijs. */
  marginAmount: Decimal
  marginPercent: Decimal
}

/**
 * Verkoopprijs per stuk.
 *
 * Geeft null terug als geen enkele regel van toepassing is. Dat is met opzet:
 * terugvallen op de inkoopprijs zou betekenen dat er zonder marge verkocht
 * wordt zonder dat iemand het merkt. De aanroeper hoort dan te stoppen en te
 * melden dat er een prijsregel ontbreekt.
 */
export function calculateUnitSalePrice(
  purchasePrice: Decimal.Value,
  rules: PriceRule[],
  ctx: PriceContext,
): PriceResult | null {
  const rule = selectPriceRule(rules, ctx)
  if (!rule) return null

  const inkoop = new Decimal(purchasePrice)
  const unitPrice = applyPriceRule(inkoop, rule)
  const marginAmount = round4(unitPrice.minus(inkoop))
  const marginPercent = unitPrice.isZero()
    ? new Decimal(0)
    : round4(marginAmount.dividedBy(unitPrice).times(100))

  return { unitPrice, rule, purchasePrice: inkoop, marginAmount, marginPercent }
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
