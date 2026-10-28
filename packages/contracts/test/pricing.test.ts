import { describe, it, expect } from 'vitest'
import {
  applicableRules, selectPriceRule, applyPriceRule, calculateUnitSalePrice, selectTier,
  selectCustomerAgreement,
  type PriceRule, type PriceContext, type CustomerPriceAgreement,
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
    expect(uitkomst.source).toBe('RULE')
    // Narrowing op source: de union laat de regel pas lezen als die ook de
    // prijs bepaalde.
    if (uitkomst.source !== 'RULE') throw new Error('bron hoort RULE te zijn')
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

// --- Klantprijsafspraken ---------------------------------------------------

const afspraak = (
  over: Partial<CustomerPriceAgreement> & Pick<CustomerPriceAgreement, 'id'>,
): CustomerPriceAgreement => ({
  customerId: 'k1',
  productId: 'p1',
  minQuantity: 1,
  unitPrice: '7.0000',
  isActive: true,
  ...over,
})

describe('welke klantafspraak geldt', () => {
  it('kiest de hoogste drempel die het aantal haalt', () => {
    const afspraken = [
      afspraak({ id: 'vanaf1', minQuantity: 1, unitPrice: '9.0000' }),
      afspraak({ id: 'vanaf100', minQuantity: 100, unitPrice: '8.0000' }),
      afspraak({ id: 'vanaf500', minQuantity: 500, unitPrice: '7.0000' }),
    ]
    expect(selectCustomerAgreement(afspraken, context({ quantity: 250 }))?.id).toBe('vanaf100')
    expect(selectCustomerAgreement(afspraken, context({ quantity: 99 }))?.id).toBe('vanaf1')
    expect(selectCustomerAgreement(afspraken, context({ quantity: 500 }))?.id).toBe('vanaf500')
  })

  it('kijkt niet naar afspraken van een andere klant of een ander product', () => {
    const afspraken = [
      afspraak({ id: 'andere-klant', customerId: 'k2' }),
      afspraak({ id: 'ander-product', productId: 'p2' }),
    ]
    expect(selectCustomerAgreement(afspraken, context())).toBeNull()
  })

  it('negeert een afspraak buiten haar geldigheidsvenster', () => {
    const verlopen = afspraak({ id: 'verlopen', validTo: new Date('2026-01-01T00:00:00Z') })
    const toekomst = afspraak({ id: 'toekomst', validFrom: new Date('2027-01-01T00:00:00Z') })
    const nu = context({ at: new Date('2026-06-01T00:00:00Z') })
    expect(selectCustomerAgreement([verlopen], nu)).toBeNull()
    expect(selectCustomerAgreement([toekomst], nu)).toBeNull()
    expect(selectCustomerAgreement([toekomst], context({ at: new Date('2027-02-01T00:00:00Z') }))?.id)
      .toBe('toekomst')
  })

  it('negeert een afspraak die op inactief staat', () => {
    expect(selectCustomerAgreement([afspraak({ id: 'uit', isActive: false })], context())).toBeNull()
  })

  it('kiest bij een gelijke drempel de laagste prijs', () => {
    // Twee afspraken vanaf hetzelfde aantal horen niet te bestaan - de
    // database verbiedt het - maar als het toch gebeurt valt het niet in ons
    // voordeel uit.
    const afspraken = [
      afspraak({ id: 'duur', minQuantity: 100, unitPrice: '9.0000' }),
      afspraak({ id: 'goedkoop', minQuantity: 100, unitPrice: '8.5000' }),
    ]
    expect(selectCustomerAgreement(afspraken, context({ quantity: 100 }))?.id).toBe('goedkoop')
  })

  it('doet niets zonder klant in de context', () => {
    expect(selectCustomerAgreement([afspraak({ id: 'a' })], context({ customerId: null }))).toBeNull()
  })
})

describe('afspraak tegen prijsregel', () => {
  it('laat de afspraak voorgaan op elke regel, ook een scherpere klantregel', () => {
    const rules = [
      regel({ id: 'klant', scope: 'CUSTOMER', customerId: 'k1', marginPercent: 20, priority: 1 }),
      regel({ id: 'algemeen', scope: 'GLOBAL', marginPercent: 100, priority: 1 }),
    ]
    const uitkomst = calculateUnitSalePrice('4.8500', rules, context(), [
      afspraak({ id: 'jaarafspraak', unitPrice: '8.2500' }),
    ])!

    expect(uitkomst.source).toBe('AGREEMENT')
    if (uitkomst.source !== 'AGREEMENT') throw new Error('bron hoort AGREEMENT te zijn')
    expect(uitkomst.agreement.id).toBe('jaarafspraak')
    expect(uitkomst.unitPrice.toFixed(4)).toBe('8.2500')
    // De marge wordt nog steeds tegen de inkoopprijs gerekend, anders weet
    // niemand wat de afspraak kost.
    expect(uitkomst.marginAmount.toFixed(4)).toBe('3.4000')
    expect(uitkomst.belowCost).toBe(false)
  })

  it('valt terug op de regel als de afspraak niet geldt', () => {
    const rules = [regel({ id: 'algemeen', scope: 'GLOBAL', marginPercent: 100 })]
    const uitkomst = calculateUnitSalePrice('4.0000', rules, context({ quantity: 50 }), [
      afspraak({ id: 'vanaf100', minQuantity: 100, unitPrice: '5.0000' }),
    ])!
    expect(uitkomst.source).toBe('RULE')
    expect(uitkomst.unitPrice.toFixed(4)).toBe('8.0000')
  })

  it('geeft een prijs onder de inkoopprijs door, maar meldt het', () => {
    // Verliesgevend verkopen mag een zakelijke keuze zijn; stil gebeuren niet.
    const uitkomst = calculateUnitSalePrice('10.0000', [], context(), [
      afspraak({ id: 'te-scherp', unitPrice: '8.0000' }),
    ])!
    expect(uitkomst.belowCost).toBe(true)
    expect(uitkomst.marginAmount.toFixed(4)).toBe('-2.0000')
  })

  it('geeft een prijs ook zonder enige regel, als er een afspraak is', () => {
    // Zonder afspraak is geen regel een fout; met afspraak is er een bedrag.
    expect(calculateUnitSalePrice('4.0000', [], context())).toBeNull()
    expect(calculateUnitSalePrice('4.0000', [], context(), [afspraak({ id: 'a' })])).not.toBeNull()
  })
})
