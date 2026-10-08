import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPrismaClient, type Db } from '../src/index'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Controleert de afspraken die het schema moet afdwingen. Niet "werkt Prisma",
 * maar: houdt de database zich aan de harde regels uit CLAUDE.md.
 */
describe('schema-afspraken', () => {
  let db: Db
  const tag = `test-${Date.now()}`

  beforeAll(() => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
  })

  afterAll(async () => {
    // Orders eerst: klanten met een order zijn beschermd door onDelete:
    // Restrict, wat deze suite zelf aantoont.
    const customers = await db.customer.findMany({
      where: { name: { startsWith: tag } },
      select: { id: true },
    })
    const customerIds = customers.map((c) => c.id)
    await db.order.deleteMany({ where: { customerId: { in: customerIds } } })
    await db.customer.deleteMany({ where: { id: { in: customerIds } } })
    await db.$disconnect()
  })

  it('staat geen twee klanten met hetzelfde klantnummer toe', async () => {
    const number = `${Date.now()}`.slice(-8)
    await db.customer.create({ data: { number, name: `${tag} eerste` } })
    await expect(db.customer.create({ data: { number, name: `${tag} tweede` } })).rejects.toThrow()
  })

  it('bewaart bedragen exact, zonder floating-pointfout', async () => {
    const customer = await db.customer.create({
      data: { number: `${Date.now()}`.slice(-8), name: `${tag} bedragen` },
    })
    const order = await db.order.create({
      data: {
        number: `TST-${Date.now()}`,
        customerId: customer.id,
        subtotalExclVat: '1234.57',
        vatAmount: '259.26',
        totalInclVat: '1493.83',
      },
    })
    const stored = await db.order.findUniqueOrThrow({ where: { id: order.id } })
    expect(stored.subtotalExclVat.toString()).toBe('1234.57')
    expect(stored.vatAmount.toString()).toBe('259.26')
    // 1234.57 + 259.26 is in floating point 1493.8299999999999
    expect(stored.subtotalExclVat.plus(stored.vatAmount).toString()).toBe('1493.83')
  })

  it('houdt de eenheidsprijs op vier decimalen', async () => {
    const customer = await db.customer.create({
      data: { number: `${Date.now()}`.slice(-8), name: `${tag} eenheidsprijs` },
    })
    const order = await db.order.create({
      data: { number: `TST-P-${Date.now()}`, customerId: customer.id },
    })
    const line = await db.orderLine.create({
      data: {
        orderId: order.id,
        lineNumber: 1,
        productName: 'Testartikel',
        quantity: 100,
        unitSalePrice: '1.2345',
      },
    })
    expect(line.unitSalePrice.toString()).toBe('1.2345')
  })

  it('staat geen twee orderregels met hetzelfde regelnummer toe', async () => {
    const customer = await db.customer.create({
      data: { number: `${Date.now()}`.slice(-8), name: `${tag} regelnummer` },
    })
    const order = await db.order.create({
      data: { number: `TST-R-${Date.now()}`, customerId: customer.id },
    })
    const line = { orderId: order.id, lineNumber: 1, productName: 'A', quantity: 1, unitSalePrice: '1' }
    await db.orderLine.create({ data: line })
    await expect(db.orderLine.create({ data: { ...line, productName: 'B' } })).rejects.toThrow()
  })

  it('verwijdert orderregels en tijdlijn mee met de order', async () => {
    const customer = await db.customer.create({
      data: { number: `${Date.now()}`.slice(-8), name: `${tag} cascade` },
    })
    const order = await db.order.create({
      data: {
        number: `TST-C-${Date.now()}`,
        customerId: customer.id,
        lines: { create: [{ lineNumber: 1, productName: 'A', quantity: 1, unitSalePrice: '1' }] },
        events: { create: [{ type: 'ORDER_CREATED' }] },
      },
    })
    await db.order.delete({ where: { id: order.id } })
    expect(await db.orderLine.count({ where: { orderId: order.id } })).toBe(0)
    expect(await db.orderEvent.count({ where: { orderId: order.id } })).toBe(0)
  })

  it('blokkeert het verwijderen van een klant met een order (onDelete: Restrict)', async () => {
    const customer = await db.customer.create({
      data: { number: `${Date.now()}`.slice(-8), name: `${tag} restrict` },
    })
    await db.order.create({ data: { number: `TST-X-${Date.now()}`, customerId: customer.id } })
    await expect(db.customer.delete({ where: { id: customer.id } })).rejects.toThrow()
  })

  it('markeert nieuwe rijen standaard niet als demodata', async () => {
    const customer = await db.customer.create({
      data: { number: `${Date.now()}`.slice(-8), name: `${tag} demo-vlag` },
    })
    expect(customer.isDemo).toBe(false)
  })
})
