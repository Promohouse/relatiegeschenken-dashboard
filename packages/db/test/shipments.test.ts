import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import {
  deriveLineLogisticsStatus, deriveOrderLogisticsStatus, isOrderFullyDelivered,
  type LogisticsStatus,
} from '@rgh/contracts'
import { createPrismaClient, type Db } from '../src/index'
import { uniqueNumber } from './helpers'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Uitgaande leveringen met deelzendingen. De harde eis: een order is pas
 * volledig geleverd als alle relevante aantallen geleverd zijn, en een
 * deellevering mag nooit tot afronding leiden.
 */
describe('uitgaande zendingen', () => {
  let db: Db
  const tag = `zending-${Date.now()}`
  let customerId: string
  let orderId: string
  let lineA: string
  let lineB: string

  /** Leest de zendingen en leidt de statussen af, zoals de workflow dat doet. */
  async function stand() {
    const lines = await db.orderLine.findMany({
      where: { orderId },
      include: { shipmentItems: { include: { shipment: true } } },
      orderBy: { lineNumber: 'asc' },
    })

    const shippable = lines.map((l) => {
      const verzonden = l.shipmentItems.filter((i) =>
        i.shipment.status === 'SHIPPED' || i.shipment.status === 'DELIVERED')
      const geleverd = l.shipmentItems.filter((i) => i.shipment.status === 'DELIVERED')
      return {
        id: l.id,
        current: l.logisticsStatus as LogisticsStatus,
        quantity: l.quantity,
        shipped: verzonden.reduce((s, i) => s + i.quantity, 0),
        delivered: geleverd.reduce((s, i) => s + i.quantity, 0),
      }
    })

    for (const l of shippable) {
      await db.orderLine.update({
        where: { id: l.id },
        data: { logisticsStatus: deriveLineLogisticsStatus(l, l.current) as never },
      })
    }

    return {
      perRegel: shippable.map((l) => deriveLineLogisticsStatus(l, l.current)),
      order: deriveOrderLogisticsStatus(shippable),
      volledig: isOrderFullyDelivered(shippable),
    }
  }

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    const customer = await db.customer.create({ data: { number: uniqueNumber(), name: `${tag} klant` } })
    customerId = customer.id
    const order = await db.order.create({
      data: {
        number: uniqueNumber('ORD'),
        customerId,
        status: 'ACTIVE',
        lines: {
          create: [
            { lineNumber: 1, productName: 'Thermosbekers', quantity: 250, unitSalePrice: '9.9500', logisticsStatus: 'EXPECTED' },
            { lineNumber: 2, productName: 'Balpennen', quantity: 500, unitSalePrice: '1.4500', logisticsStatus: 'EXPECTED' },
          ],
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    })
    orderId = order.id
    lineA = order.lines[0].id
    lineB = order.lines[1].id
  })

  afterAll(async () => {
    await db.order.deleteMany({ where: { customerId } })
    await db.customer.deleteMany({ where: { id: customerId } })
    await db.$disconnect()
  })

  it('houdt de verwachte status zolang er niets verzonden is', async () => {
    const s = await stand()
    expect(s.perRegel).toEqual(['EXPECTED', 'EXPECTED'])
    expect(s.volledig).toBe(false)
  })

  it('wordt deels geleverd na een eerste deelzending', async () => {
    await db.shipment.create({
      data: {
        number: uniqueNumber('VZ'),
        orderId,
        status: 'DELIVERED',
        carrier: 'PostNL',
        trackingCode: '3STEST0000001',
        shippedAt: new Date(),
        deliveredAt: new Date(),
        items: { create: [{ orderLineId: lineA, quantity: 100 }] },
      },
    })
    const s = await stand()
    expect(s.perRegel[0]).toBe('PARTIALLY_DELIVERED')
    expect(s.order).toBe('PARTIALLY_DELIVERED')
    expect(s.volledig).toBe(false)
  })

  it('maakt regel A compleet met een tweede zending, maar de order nog niet', async () => {
    await db.shipment.create({
      data: {
        number: uniqueNumber('VZ'),
        orderId,
        status: 'DELIVERED',
        deliveredAt: new Date(),
        items: { create: [{ orderLineId: lineA, quantity: 150 }] },
      },
    })
    const s = await stand()
    expect(s.perRegel[0]).toBe('DELIVERED')
    expect(s.perRegel[1]).toBe('EXPECTED')
    // Dit is de eis: regel A is klaar, de order is dat niet.
    expect(s.volledig).toBe(false)
    expect(s.order).toBe('PARTIALLY_DELIVERED')
  })

  it('onderscheidt verzonden van geleverd', async () => {
    const onderweg = await db.shipment.create({
      data: {
        number: uniqueNumber('VZ'),
        orderId,
        status: 'SHIPPED',
        shippedAt: new Date(),
        items: { create: [{ orderLineId: lineB, quantity: 500 }] },
      },
    })
    let s = await stand()
    expect(s.perRegel[1]).toBe('SHIPPED')
    expect(s.volledig).toBe(false)

    await db.shipment.update({ where: { id: onderweg.id }, data: { status: 'DELIVERED', deliveredAt: new Date() } })
    s = await stand()
    expect(s.perRegel).toEqual(['DELIVERED', 'DELIVERED'])
    expect(s.order).toBe('DELIVERED')
    expect(s.volledig).toBe(true)
  })

  it('staat dezelfde orderregel niet twee keer in één zending toe', async () => {
    const zending = await db.shipment.create({
      data: { number: uniqueNumber('VZ'), orderId, items: { create: [{ orderLineId: lineA, quantity: 1 }] } },
    })
    await expect(
      db.shipmentItem.create({ data: { shipmentId: zending.id, orderLineId: lineA, quantity: 1 } }),
    ).rejects.toThrow()
    await db.shipment.delete({ where: { id: zending.id } })
  })

  it('legt een rechtstreekse levering vanuit de leverancier vast', async () => {
    const supplier = await db.supplier.create({ data: { code: tag, name: `${tag} leverancier` } })
    const zending = await db.shipment.create({
      data: {
        number: uniqueNumber('VZ'),
        orderId,
        method: 'SUPPLIER_DIRECT',
        supplierId: supplier.id,
        status: 'SHIPPED',
      },
      include: { supplier: true },
    })
    expect(zending.method).toBe('SUPPLIER_DIRECT')
    expect(zending.supplier?.name).toContain(tag)
    await db.shipment.delete({ where: { id: zending.id } })
    await db.supplier.delete({ where: { id: supplier.id } })
  })

  it('koppelt een pakbon aan de zending', async () => {
    const zending = await db.shipment.findFirstOrThrow({ where: { orderId } })
    await db.document.create({
      data: {
        category: 'PACKING_SLIP',
        title: `Pakbon ${zending.number}`,
        visibility: 'CUSTOMER',
        customerId,
        orderId,
        shipmentId: zending.id,
        versions: {
          create: [{
            versionNumber: 1,
            storageKey: `test/${zending.id}/pakbon.pdf`,
            fileName: 'pakbon.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 512,
            checksum: 'test',
          }],
        },
      },
    })
    expect(await db.document.count({ where: { shipmentId: zending.id } })).toBe(1)
  })

  it('verwijdert zendingen en regels mee met de order', async () => {
    const order = await db.order.create({
      data: {
        number: uniqueNumber('ORD'),
        customerId,
        lines: { create: [{ lineNumber: 1, productName: 'Test', quantity: 10, unitSalePrice: '1.0000' }] },
      },
      include: { lines: true },
    })
    const zending = await db.shipment.create({
      data: {
        number: uniqueNumber('VZ'),
        orderId: order.id,
        items: { create: [{ orderLineId: order.lines[0].id, quantity: 5 }] },
      },
    })
    await db.order.delete({ where: { id: order.id } })
    expect(await db.shipment.count({ where: { id: zending.id } })).toBe(0)
    expect(await db.shipmentItem.count({ where: { shipmentId: zending.id } })).toBe(0)
  })
})
