import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { TestingModule } from '@nestjs/testing'
import { createCoreModule, uniqueNumber } from './helpers'
import { PricingService } from '../src/core/pricing/pricing.service'
import { PrismaService } from '../src/core/prisma/prisma.service'

/**
 * De regel uitlezen uit een uitkomst. `PriceResult` is een union op `source`,
 * dus zonder narrowing is `rule` niet te lezen - precies de bedoeling, want
 * bij een klantprijsafspraak is er geen regel.
 */
function regelVan(uitkomst: { source: string; rule?: { id: string } }): { id: string } {
  if (uitkomst.source !== 'RULE' || !uitkomst.rule) {
    throw new Error(`Verwachtte een prijs uit een regel, maar de bron was ${uitkomst.source}`)
  }
  return uitkomst.rule
}


/**
 * De prijsengine tegen de echte database: staffel kiezen, regel kiezen,
 * prijs berekenen. Het rekenwerk zelf is apart getest in @rgh/contracts.
 */
describe('prijsengine', () => {
  let moduleRef: TestingModule
  let pricing: PricingService
  let prisma: PrismaService

  const tag = `prijs-${Date.now()}`
  let productId: string
  let categoryId: string
  let supplierId: string
  let customerId: string
  const regelIds: string[] = []

  beforeAll(async () => {
    moduleRef = await createCoreModule()
    pricing = moduleRef.get(PricingService)
    prisma = moduleRef.get(PrismaService)

    categoryId = (await prisma.db.productCategory.create({
      data: { name: `${tag} drinkware`, slug: `${tag}-drinkware`, path: `${tag}-drinkware` },
    })).id
    supplierId = (await prisma.db.supplier.create({ data: { code: tag, name: `${tag} leverancier` } })).id
    customerId = (await prisma.db.customer.create({ data: { number: uniqueNumber(), name: `${tag} klant` } })).id

    const product = await prisma.db.product.create({
      data: {
        articleNumber: `${tag}-1001`,
        name: 'Thermosbeker Rivo 350 ml',
        categoryId,
        suppliers: {
          create: [{
            supplierId,
            supplierArticleNumber: `S-${tag}`,
            purchasePrice: '4.8500',
            isPreferred: true,
            purchaseTiers: {
              create: [
                { minQuantity: 1, unitPrice: '4.8500' },
                { minQuantity: 100, unitPrice: '4.5590' },
                { minQuantity: 250, unitPrice: '4.3165' },
                { minQuantity: 500, unitPrice: '4.0740' },
              ],
            },
          }],
        },
      },
    })
    productId = product.id
  }, 30000)

  afterAll(async () => {
    await prisma.db.customerPriceAgreement.deleteMany({ where: { customerId } })
    await prisma.db.priceRule.deleteMany({ where: { id: { in: regelIds } } })
    await prisma.db.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.db.productCategory.deleteMany({ where: { slug: { startsWith: tag } } })
    await prisma.db.supplier.deleteMany({ where: { code: tag } })
    await prisma.db.customer.deleteMany({ where: { id: customerId } })
    await moduleRef.close()
  })

  it('weigert een prijs te bepalen zonder prijsregel', async () => {
    // Terugvallen op de inkoopprijs zou betekenen: zonder marge verkopen
    // zonder dat iemand het merkt.
    await expect(pricing.resolveUnitPrice({ productId, quantity: 250 })).rejects.toThrow(
      /geen prijsregel.*zonder marge/s,
    )
  })

  it('rekent met de staffel die bij het aantal hoort', async () => {
    const algemeen = await prisma.db.priceRule.create({
      data: { scope: 'GLOBAL', marginPercent: '110.00', priority: 1000 },
    })
    regelIds.push(algemeen.id)

    // 50 stuks valt op staffel vanaf 1: 4,8500 x 2,1
    const klein = await pricing.resolveUnitPrice({ productId, quantity: 50 })
    expect(klein.tierMinQuantity).toBe(1)
    expect(klein.unitPrice.toFixed(4)).toBe('10.1850')

    // 250 stuks valt op staffel vanaf 250: 4,3165 x 2,1
    const groot = await pricing.resolveUnitPrice({ productId, quantity: 250 })
    expect(groot.tierMinQuantity).toBe(250)
    expect(groot.unitPrice.toFixed(4)).toBe('9.0647')

    // 1000 stuks valt op de hoogste staffel
    const grootst = await pricing.resolveUnitPrice({ productId, quantity: 1000 })
    expect(grootst.tierMinQuantity).toBe(500)
    expect(grootst.unitPrice.toFixed(4)).toBe('8.5554')
  })

  it('geeft de marge in euro en procent terug', async () => {
    const uitkomst = await pricing.resolveUnitPrice({ productId, quantity: 250 })
    expect(uitkomst.purchasePrice.toFixed(4)).toBe('4.3165')
    expect(uitkomst.marginAmount.toFixed(4)).toBe('4.7482')
    expect(uitkomst.marginPercent.toFixed(2)).toBe('52.38')
    expect(uitkomst.supplierName).toContain(tag)
  })

  it('laat een klantafspraak voorgaan op de algemene regel', async () => {
    const klantregel = await prisma.db.priceRule.create({
      data: { scope: 'CUSTOMER', customerId, marginPercent: '60.00', priority: 10 },
    })
    regelIds.push(klantregel.id)

    const metKlant = await pricing.resolveUnitPrice({ productId, quantity: 250, customerId })
    expect(regelVan(metKlant).id).toBe(klantregel.id)
    expect(metKlant.unitPrice.toFixed(4)).toBe('6.9064')

    // Zonder die klant geldt de algemene regel weer.
    const zonderKlant = await pricing.resolveUnitPrice({ productId, quantity: 250 })
    expect(zonderKlant.unitPrice.toFixed(4)).toBe('9.0647')
  })

  it('laat zien welke regels meespeelden, zodat een prijs navraagbaar is', async () => {
    const uitkomst = await pricing.resolveUnitPrice({ productId, quantity: 250, customerId })
    expect(uitkomst.consideredRuleIds).toHaveLength(2)
    expect(uitkomst.consideredRuleIds[0]).toBe(regelVan(uitkomst).id)
  })

  it('negeert een regel die pas later ingaat', async () => {
    const toekomst = await prisma.db.priceRule.create({
      data: {
        scope: 'PRODUCT', productId, marginPercent: '200.00', priority: 1,
        validFrom: new Date(Date.now() + 30 * 86400000),
      },
    })
    regelIds.push(toekomst.id)

    const nu = await pricing.resolveUnitPrice({ productId, quantity: 250 })
    expect(nu.unitPrice.toFixed(4)).toBe('9.0647')

    const straks = await pricing.resolveUnitPrice({
      productId, quantity: 250, at: new Date(Date.now() + 60 * 86400000),
    })
    expect(regelVan(straks).id).toBe(toekomst.id)
    expect(straks.unitPrice.toFixed(4)).toBe('12.9495')
  })

  it('laat een klantprijsafspraak voorgaan op elke prijsregel', async () => {
    // Het acceptatiecriterium uit de roadmap. Er staat op dit moment al een
    // klantregel met priority 10 en een productregel met priority 1; de
    // afspraak moet daar langs, zonder dat er aan priority gesleuteld wordt.
    const scherpsteRegel = await pricing.resolveUnitPrice({ productId, quantity: 250, customerId })

    const afspraak = await prisma.db.customerPriceAgreement.create({
      data: { customerId, productId, minQuantity: 100, unitPrice: '5.5000' },
    })

    const met = await pricing.resolveUnitPrice({ productId, quantity: 250, customerId })
    expect(met.source).toBe('AGREEMENT')
    expect(met.unitPrice.toFixed(4)).toBe('5.5000')
    expect(met.unitPrice.toFixed(4)).not.toBe(scherpsteRegel.unitPrice.toFixed(4))
    // De marge wordt tegen de inkoopstaffel van 250 stuks gerekend.
    expect(met.purchasePrice.toFixed(4)).toBe('4.3165')
    expect(met.marginAmount.toFixed(4)).toBe('1.1835')
    expect(met.belowCost).toBe(false)

    // Onder de drempel geldt de regel weer.
    const onderDeDrempel = await pricing.resolveUnitPrice({ productId, quantity: 50, customerId })
    expect(onderDeDrempel.source).toBe('RULE')

    // En een andere klant heeft niets met deze afspraak te maken.
    const zonderKlant = await pricing.resolveUnitPrice({ productId, quantity: 250 })
    expect(zonderKlant.source).toBe('RULE')

    await prisma.db.customerPriceAgreement.delete({ where: { id: afspraak.id } })
  })

  it('meldt een afspraak die onder de inkoopprijs ligt', async () => {
    const afspraak = await prisma.db.customerPriceAgreement.create({
      data: { customerId, productId, minQuantity: 1, unitPrice: '3.0000' },
    })

    const uitkomst = await pricing.resolveUnitPrice({ productId, quantity: 250, customerId })
    expect(uitkomst.belowCost).toBe(true)
    expect(uitkomst.marginAmount.isNegative()).toBe(true)

    await prisma.db.customerPriceAgreement.delete({ where: { id: afspraak.id } })
  })

  it('negeert een afspraak die nog niet of niet meer geldt', async () => {
    const verlopen = await prisma.db.customerPriceAgreement.create({
      data: {
        customerId, productId, minQuantity: 1, unitPrice: '5.0000',
        validTo: new Date(Date.now() - 86400000),
      },
    })

    const uitkomst = await pricing.resolveUnitPrice({ productId, quantity: 250, customerId })
    expect(uitkomst.source).toBe('RULE')

    await prisma.db.customerPriceAgreement.delete({ where: { id: verlopen.id } })
  })

  it('weigert een ongeldig aantal', async () => {
    await expect(pricing.resolveUnitPrice({ productId, quantity: 0 })).rejects.toThrow(/groter dan nul/)
    await expect(pricing.resolveUnitPrice({ productId, quantity: 2.5 })).rejects.toThrow(/geheel getal/)
  })

  it('meldt een onbekend product als niet gevonden', async () => {
    await expect(
      pricing.resolveUnitPrice({ productId: '00000000-0000-0000-0000-000000000000', quantity: 1 }),
    ).rejects.toThrow(/bestaat niet/)
  })

  it('meldt een product zonder actieve leverancier', async () => {
    const zonder = await prisma.db.product.create({
      data: { articleNumber: `${tag}-geen-leverancier`, name: 'Losse post' },
    })
    await expect(pricing.resolveUnitPrice({ productId: zonder.id, quantity: 10 })).rejects.toThrow(
      /geen actieve leverancier/,
    )
  })
})
