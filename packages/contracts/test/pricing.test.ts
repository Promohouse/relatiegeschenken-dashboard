import { describe, it, expect } from 'vitest'
import {
  applicableRules, selectPriceRule, applyPriceRule, calculateUnitSalePrice, selectTier,
  type PriceRule, type PriceContext,
} from '../src/pricing'

const regel = (over: Partial<PriceRule> & Pick<PriceRule, 'id' | 'scope'>): PriceRule => ({
  minQuantity: 1,
  priority: 100,
  isActive: true,
  ...over,
})

const context = (over: Partial<PriceContext> = {}): PriceContext => ({
  productId: 'p1',
  categoryId: 'c1',
  supplierId: 's1',
  customerId: 'k1',
  channelId: 'ch1',
  quantity: 250,
  ...over,
})

describe('welke prijsregel geldt', () => {
  it('kiest de regel met de laagste priority', () => {
    const rules = [
      regel({ id: 'algemeen', scope: 'GLOBAL', marginPercent: 100, priority: 1000 }),
      regel({ id: 'klant', scope: 'CUSTOMER', customerId: 'k1', marginPercent: 60, priority: 10 }),
    ]
    expect(selectPriceRule(rules, context())?.id).toBe('klant')
  })

  it('gebruikt specificiteit pas als de priority gelijk is', () => {
    const rules = [
      regel({ id: 'categorie', scope: 'CATEGORY', categoryId: 'c1', priority: 50 }),
      regel({ id: 'product', scope: 'PRODUCT', productId: 'p1', priority: 50 }),
      regel({ id: 'leverancier', scope: 'SUPPLIER', supplierId: 's1', priority: 50 }),
    ]
    expect(selectPriceRule(rules, context())?.id).toBe('product')
  })

  it('negeert een regel voor een andere klant, categorie of leverancier', () => {
    const rules = [
      regel({ id: 'andere-klant', scope: 'CUSTOMER', customerId: 'k2', priority: 1 }),
      regel({ id: 'andere-categorie', scope: 'CATEGORY', categoryId: 'c9', priority: 2 }),
      regel({ id: 'algemeen', scope: 'GLOBAL', priority: 900 }),
    ]
    expect(selectPriceRule(rules, context())?.id).toBe('algemeen')
  })

  it('negeert een regel waarvan het aantal nog niet gehaald is', () => {
    const rules = [
      regel({ id: 'vanaf-500', scope: 'GLOBAL', minQuantity: 500, priority: 1 }),
      regel({ id: 'vanaf-1', scope: 'GLOBAL', minQuantity: 1, priority: 2 }),
    ]
    expect(selectPriceRule(rules, context({ quantity: 250 }))?.id).toBe('vanaf-1')
    expect(selectPriceRule(rules, context({ quantity: 500 }))?.id).toBe('vanaf-500')
  })

  it('negeert een uitgeschakelde regel', () => {
    const rules = [
      regel({ id: 'uit', scope: 'GLOBAL', priority: 1, isActive: false }),
      regel({ id: 'aan', scope: 'GLOBAL', priority: 2 }),
    ]
    expect(selectPriceRule(rules, context())?.id).toBe('aan')
  })

  it('houdt rekening met de geldigheidsperiode, zodat een verhoging vooruit kan', () => {
    const nu = new Date('2026-10-28T12:00:00Z')
    const rules = [
      regel({ id: 'nieuw-tarief', scope: 'GLOBAL', priority: 1, validFrom: new Date('2027-01-01') }),
      regel({ id: 'huidig', scope: 'GLOBAL', priority: 2 }),
      regel({ id: 'verlopen', scope: 'GLOBAL', priority: 0, validTo: new Date('2026-01-01') }),
    ]
    expect(selectPriceRule(rules, context({ at: nu }))?.id).toBe('huidig')
    expect(selectPriceRule(rules, context({ at: new Date('2027-02-01') }))?.id).toBe('nieuw-tarief')
  })

  it('geeft null als er geen enkele regel van toepassing is', () => {
    expect(selectPriceRule([], context())).toBeNull()
    expect(selectPriceRule([regel({ id: 'x', scope: 'PRODUCT', productId: 'anders' })], context())).toBeNull()
  })

  it('toont alle geldende regels op volgorde, zodat navraagbaar is waarom', () => {
    const rules = [
      regel({ id: 'algemeen', scope: 'GLOBAL', priority: 1000 }),
      regel({ id: 'klant', scope: 'CUSTOMER', customerId: 'k1', priority: 10 }),
      regel({ id: 'product', scope: 'PRODUCT', productId: 'p1', priority: 50 }),
    ]
    expect(applicableRules(rules, context()).map((r) => r.id)).toEqual(['klant', 'product', 'algemeen'])
  })
})

describe('prijs berekenen', () => {
  it('past een margepercentage toe op de inkoopprijs', () => {
    const r = regel({ id: 'm', scope: 'GLOBAL', marginPercent: 110 })
    expect(applyPriceRule('4.8500', r).toFixed(4)).toBe('10.1850')
  })

  it('past een vast opslagbedrag toe', () => {
    const r = regel({ id: 'm', scope: 'GLOBAL', markupAmount: '2.5000' })
    expect(applyPriceRule('4.8500', r).toFixed(4)).toBe('7.3500')
  })

  it('past eerst de marge toe en daarna het opslagbedrag', () => {
    const r = regel({ id: 'm', scope: 'GLOBAL', marginPercent: 100, markupAmount: '1.0000' })
    expect(applyPriceRule('4.0000', r).toFixed(4)).toBe('9.0000')
  })

  it('rekent de marge in euro en in procent van de verkoopprijs uit', () => {
    const rules = [regel({ id: 'm', scope: 'GLOBAL', marginPercent: 110 })]
    const uitkomst = calculateUnitSalePrice('4.8500', rules, context())!
    expect(uitkomst.unitPrice.toFixed(4)).toBe('10.1850')
    expect(uitkomst.marginAmount.toFixed(4)).toBe('5.3350')
    expect(uitkomst.marginPercent.toFixed(2)).toBe('52.38')
    expect(uitkomst.rule.id).toBe('m')
  })

  it('geeft null in plaats van de inkoopprijs als er geen regel is', () => {
    // Terugvallen op de inkoopprijs zou betekenen: zonder marge verkopen
    // zonder dat iemand het merkt.
    expect(calculateUnitSalePrice('4.8500', [], context())).toBeNull()
  })

  it('rekent zonder floating-pointfouten', () => {
    const r = regel({ id: 'm', scope: 'GLOBAL', marginPercent: 10 })
    expect(applyPriceRule('0.1000', r).toFixed(4)).toBe('0.1100')
  })
})

describe('inkoopstaffels', () => {
  const staffels = [
    { minQuantity: 1, unitPrice: '4.8500' },
    { minQuantity: 100, unitPrice: '4.5590' },
    { minQuantity: 250, unitPrice: '4.3165' },
    { minQuantity: 500, unitPrice: '4.0740' },
  ]

  it('kiest de hoogste drempel die het aantal haalt', () => {
    expect(selectTier(staffels, 1)?.unitPrice).toBe('4.8500')
    expect(selectTier(staffels, 99)?.unitPrice).toBe('4.8500')
    expect(selectTier(staffels, 100)?.unitPrice).toBe('4.5590')
    expect(selectTier(staffels, 250)?.unitPrice).toBe('4.3165')
    expect(selectTier(staffels, 10000)?.unitPrice).toBe('4.0740')
  })

  it('geeft null als geen enkele staffel het aantal haalt', () => {
    expect(selectTier([{ minQuantity: 50, unitPrice: '1' }], 25)).toBeNull()
  })
})
