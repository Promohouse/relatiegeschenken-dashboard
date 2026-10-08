import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { derivePurchaseOrderStatus, type PurchaseOrderStatus } from '@rgh/contracts'
import { createPrismaClient, type Db } from '../src/index'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Inkoop met deelontvangsten, en de dubbelherkenning van inkoopfacturen.
 */
describe('inkoop', () => {
  let db: Db
  const tag = `inkoop-${Date.now()}`
  let supplierId: string
  let purchaseOrderId: string
  let lineA: string
  let lineB: string

  /** Werkt de ontvangen aantallen bij en leidt de orderstatus opnieuw af. */
  async function herbereken(): Promise<PurchaseOrderStatus> {
    const lines = await db.purchaseOrderLine.findMany({
      where: { purchaseOrderId },
      include: { receiptLines: true },
    })

    for (const line of lines) {
      const received = line.receiptLines.reduce((s, r) => s + r.quantity, 0)
      await db.purchaseOrderLine.update({ where: { id: line.id }, data: { quantityReceived: received } })
    }

    const fresh = await db.purchaseOrderLine.findMany({ where: { purchaseOrderId } })
    const current = (await db.purchaseOrder.findUniqueOrThrow({ where: { id: purchaseOrderId } }))
      .status as PurchaseOrderStatus
    const next = derivePurchaseOrderStatus(fresh, current)
    await db.purchaseOrder.update({ where: { id: purchaseOrderId }, data: { status: next } })
    return next
  }

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    const supplier = await db.supplier.create({ data: { code: tag, name: `${tag} leverancier` } })
    supplierId = supplier.id

    const po = await db.purchaseOrder.create({
      data: {
        number: `INK-${tag}`,
        supplierId,
        status: 'CONFIRMED',
        lines: {
          create: [
            { lineNumber: 1, description: 'Thermosbekers', quantity: 250, unitPurchasePrice: '4.8500', lineTotal: '1212.50' },
            { lineNumber: 2, description: 'Balpennen', quantity: 500, unitPurchasePrice: '0.6200', lineTotal: '310.00' },
          ],
        },
      },
      include: { lines: { orderBy: { lineNumber: 'asc' } } },
    })
    purchaseOrderId = po.id
    lineA = po.lines[0].id
    lineB = po.lines[1].id
  })

  afterAll(async () => {
    await db.purchaseInvoice.deleteMany({ where: { supplierId } })
    await db.purchaseOrder.deleteMany({ where: { supplierId } })
    await db.supplier.deleteMany({ where: { code: tag } })
    await db.$disconnect()
  })

  it('blijft bevestigd zolang er niets ontvangen is', async () => {
    expect(await herbereken()).toBe('CONFIRMED')
  })

  it('wordt deels ontvangen na een eerste deellevering', async () => {
    await db.goodsReceipt.create({
      data: {
        purchaseOrderId,
        reference: 'PAKBON-1',
        trackingCode: '3STEST0001',
        lines: { create: [{ purchaseOrderLineId: lineA, quantity: 100 }] },
      },
    })
    expect(await herbereken()).toBe('PARTIALLY_RECEIVED')

    const line = await db.purchaseOrderLine.findUniqueOrThrow({ where: { id: lineA } })
    expect(line.quantityReceived).toBe(100)
  })

  it('telt een tweede deellevering op bij dezelfde regel', async () => {
    await db.goodsReceipt.create({
      data: {
        purchaseOrderId,
        reference: 'PAKBON-2',
        lines: { create: [{ purchaseOrderLineId: lineA, quantity: 150 }] },
      },
    })
    expect(await herbereken()).toBe('PARTIALLY_RECEIVED')

    const line = await db.purchaseOrderLine.findUniqueOrThrow({ where: { id: lineA } })
    expect(line.quantityReceived).toBe(250)
  })

  it('wordt pas ontvangen als ook de tweede regel volledig geleverd is', async () => {
    await db.goodsReceipt.create({
      data: {
        purchaseOrderId,
        reference: 'PAKBON-3',
        lines: { create: [{ purchaseOrderLineId: lineB, quantity: 500 }] },
      },
    })
    expect(await herbereken()).toBe('RECEIVED')
  })

  it('bewaart de leveranciersbevestiging met de ruwe inhoud', async () => {
    await db.supplierConfirmation.create({
      data: {
        purchaseOrderId,
        reference: 'CONF-9912',
        expectedDeliveryDate: new Date('2026-11-01'),
        payload: { orderReference: 'CONF-9912', lines: [{ sku: 'S1001', qty: 250 }] },
      },
    })
    const confirmations = await db.supplierConfirmation.findMany({ where: { purchaseOrderId } })
    expect(confirmations).toHaveLength(1)
    expect(confirmations[0].reference).toBe('CONF-9912')
  })

  it('verwijdert ontvangsten mee met de inkooporder', async () => {
    const po = await db.purchaseOrder.create({
      data: {
        number: `INK-${tag}-tijdelijk`,
        supplierId,
        lines: { create: [{ lineNumber: 1, description: 'Test', quantity: 10, unitPurchasePrice: '1.0000' }] },
      },
      include: { lines: true },
    })
    await db.goodsReceipt.create({
      data: { purchaseOrderId: po.id, lines: { create: [{ purchaseOrderLineId: po.lines[0].id, quantity: 5 }] } },
    })
    await db.purchaseOrder.delete({ where: { id: po.id } })
    expect(await db.goodsReceipt.count({ where: { purchaseOrderId: po.id } })).toBe(0)
  })
})

describe('inkoopfacturen: dubbelherkenning', () => {
  let db: Db
  const tag = `factuur-${Date.now()}`
  let supplierId: string
  let andereLeverancierId: string

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    supplierId = (await db.supplier.create({ data: { code: tag, name: `${tag} A` } })).id
    andereLeverancierId = (await db.supplier.create({ data: { code: `${tag}-b`, name: `${tag} B` } })).id
  })

  afterAll(async () => {
    await db.purchaseInvoice.deleteMany({ where: { supplierId: { in: [supplierId, andereLeverancierId] } } })
    await db.supplier.deleteMany({ where: { code: { startsWith: tag } } })
    await db.$disconnect()
  })

  it('staat hetzelfde factuurnummer niet twee keer bij dezelfde leverancier toe', async () => {
    const data = {
      supplierId,
      invoiceNumber: 'F-2026-0001',
      invoiceDate: new Date('2026-10-01'),
      totalExclVat: '1000.00',
      vatAmount: '210.00',
      totalInclVat: '1210.00',
    }
    await db.purchaseInvoice.create({ data })
    await expect(db.purchaseInvoice.create({ data })).rejects.toThrow()
  })

  it('staat hetzelfde factuurnummer bij een andere leverancier wel toe', async () => {
    const invoice = await db.purchaseInvoice.create({
      data: {
        supplierId: andereLeverancierId,
        invoiceNumber: 'F-2026-0001',
        invoiceDate: new Date('2026-10-02'),
      },
    })
    expect(invoice.invoiceNumber).toBe('F-2026-0001')
  })

  it('legt een gevonden dubbele factuur vast met verwijzing naar het origineel', async () => {
    const origineel = await db.purchaseInvoice.findFirstOrThrow({
      where: { supplierId, invoiceNumber: 'F-2026-0001' },
    })
    const dubbel = await db.purchaseInvoice.create({
      data: {
        supplierId,
        invoiceNumber: 'F-2026-0001-kopie',
        invoiceDate: new Date('2026-10-03'),
        status: 'DISPUTED',
        duplicateOfId: origineel.id,
      },
      include: { duplicateOf: true },
    })
    expect(dubbel.duplicateOf?.id).toBe(origineel.id)
    expect(dubbel.status).toBe('DISPUTED')
  })

  it('houdt inhoudelijke en financiële goedkeuring apart', async () => {
    const user = await db.user.create({
      data: { email: `${tag}@test.local`, name: 'Testgoedkeurder' },
    })
    const invoice = await db.purchaseInvoice.create({
      data: { supplierId, invoiceNumber: 'F-2026-0002', invoiceDate: new Date('2026-10-04') },
    })

    const contentApproved = await db.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { status: 'CONTENT_APPROVED', contentApprovedById: user.id, contentApprovedAt: new Date() },
    })
    expect(contentApproved.financeApprovedById).toBeNull()

    const financeApproved = await db.purchaseInvoice.update({
      where: { id: invoice.id },
      data: { status: 'FINANCE_APPROVED', financeApprovedById: user.id, financeApprovedAt: new Date() },
    })
    expect(financeApproved.contentApprovedById).toBe(user.id)
    expect(financeApproved.financeApprovedById).toBe(user.id)

    await db.purchaseInvoice.delete({ where: { id: invoice.id } })
    await db.user.delete({ where: { id: user.id } })
  })
})
