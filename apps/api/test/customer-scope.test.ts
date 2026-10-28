import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { TestingModule } from '@nestjs/testing'
import { createCoreModule, uniqueNumber } from './helpers'
import { PrismaService } from '../src/core/prisma/prisma.service'
import { RequestContext } from '../src/core/context/request-context'
import { klantgebondenModellen } from '../src/core/prisma/customer-scope'

/**
 * Klantisolatie: een klant mag nooit gegevens van een andere klant zien, ook
 * niet door een id in de URL aan te passen (SECURITY.md paragraaf 3).
 *
 * Deze suite test vooral dat er niets terugkomt. Dat is het punt.
 */
describe('klantisolatie', () => {
  let moduleRef: TestingModule
  let prisma: PrismaService
  const tag = `scope-${Date.now()}`
  let klantA = ''
  let klantB = ''
  let orderA = ''
  let orderB = ''
  let productId = ''

  /** Draait iets alsof het een portaalsessie van deze klant is. */
  const alsKlant = <T>(customerId: string, fn: () => Promise<T>) =>
    RequestContext.run({ requestId: 'test', userId: null, customerId }, fn)

  beforeAll(async () => {
    moduleRef = await createCoreModule()
    prisma = moduleRef.get(PrismaService)
    const db = prisma.unscoped

    klantA = (await db.customer.create({ data: { number: uniqueNumber(), name: `${tag} A` } })).id
    klantB = (await db.customer.create({ data: { number: uniqueNumber(), name: `${tag} B` } })).id

    orderA = (await db.order.create({
      data: {
        number: uniqueNumber('ORD-A'), customerId: klantA, status: 'ACTIVE',
        lines: { create: [{ lineNumber: 1, productName: 'Artikel A', quantity: 10, unitSalePrice: '1.0000' }] },
      },
    })).id
    orderB = (await db.order.create({
      data: {
        number: uniqueNumber('ORD-B'), customerId: klantB, status: 'ACTIVE',
        lines: { create: [{ lineNumber: 1, productName: 'Artikel B', quantity: 10, unitSalePrice: '1.0000' }] },
      },
    })).id

    productId = (await db.product.create({
      data: { articleNumber: `${tag}-1001`, name: 'Algemeen product' },
    })).id
  }, 40000)

  afterAll(async () => {
    const db = prisma.unscoped
    await db.order.deleteMany({ where: { customerId: { in: [klantA, klantB] } } })
    await db.customer.deleteMany({ where: { id: { in: [klantA, klantB] } } })
    await db.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await moduleRef.close()
  })

  it('toont zonder portaalsessie alles, want dat is intern werk', async () => {
    const orders = await prisma.db.order.findMany({ where: { id: { in: [orderA, orderB] } } })
    expect(orders).toHaveLength(2)
  })

  it('toont een klant alleen zijn eigen orders', async () => {
    await alsKlant(klantA, async () => {
      const orders = await prisma.db.order.findMany({ where: { id: { in: [orderA, orderB] } } })
      expect(orders.map((o) => o.id)).toEqual([orderA])
    })
  })

  it('geeft niets terug bij het opvragen van een vreemde order op id', async () => {
    // Dit is het gat waar het om gaat: een aangepast id in de URL.
    await alsKlant(klantA, async () => {
      expect(await prisma.db.order.findUnique({ where: { id: orderB } })).toBeNull()
      await expect(prisma.db.order.findUniqueOrThrow({ where: { id: orderB } })).rejects.toThrow()
      expect(await prisma.db.order.findFirst({ where: { id: orderB } })).toBeNull()
    })
  })

  it('geeft de eigen order wel gewoon terug op id', async () => {
    await alsKlant(klantA, async () => {
      const order = await prisma.db.order.findUniqueOrThrow({ where: { id: orderA } })
      expect(order.id).toBe(orderA)
    })
  })

  it('telt alleen de eigen gegevens', async () => {
    await alsKlant(klantA, async () => {
      expect(await prisma.db.order.count({ where: { id: { in: [orderA, orderB] } } })).toBe(1)
    })
  })

  it('begrenst ook wat via een omweg hangt, zoals orderregels', async () => {
    await alsKlant(klantA, async () => {
      const regels = await prisma.db.orderLine.findMany({
        where: { orderId: { in: [orderA, orderB] } },
      })
      expect(regels).toHaveLength(1)
      expect(regels[0].productName).toBe('Artikel A')
    })
  })

  it('laat een vreemde order niet wijzigen of verwijderen', async () => {
    await alsKlant(klantA, async () => {
      const gewijzigd = await prisma.db.order.updateMany({
        where: { id: orderB },
        data: { reference: 'gekaapt' },
      })
      expect(gewijzigd.count).toBe(0)

      const verwijderd = await prisma.db.order.deleteMany({ where: { id: orderB } })
      expect(verwijderd.count).toBe(0)
    })

    const nog = await prisma.unscoped.order.findUniqueOrThrow({ where: { id: orderB } })
    expect(nog.reference).toBeNull()
  })

  it('ziet de klant zelf alleen als zijn eigen klantrecord', async () => {
    await alsKlant(klantA, async () => {
      expect(await prisma.db.customer.findUnique({ where: { id: klantB } })).toBeNull()
      expect((await prisma.db.customer.findUniqueOrThrow({ where: { id: klantA } })).id).toBe(klantA)
    })
  })

  it('laat gegevens die voor iedereen gelijk zijn ongemoeid', async () => {
    // Producten zijn geen klantgegevens; die mogen gewoon zichtbaar zijn.
    await alsKlant(klantA, async () => {
      const product = await prisma.db.product.findUnique({ where: { id: productId } })
      expect(product?.id).toBe(productId)
    })
  })

  it('dekt de modellen die klantgegevens dragen', () => {
    // Een model dat hier ontbreekt terwijl het klantgegevens draagt is een lek.
    for (const model of [
      'customer', 'order', 'orderLine', 'quote', 'document', 'task', 'shipment',
      'customerPriceAgreement',
    ]) {
      expect(klantgebondenModellen).toContain(model)
    }
  })
})
