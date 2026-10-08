import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPrismaClient, type Db } from '../src/index'
import { uniqueNumber } from './helpers'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Drukproeven hangen aan de orderregel, niet aan de order: één order kan
 * meerdere producten met elk hun eigen proefronde hebben.
 */
describe('drukproeven', () => {
  let db: Db
  const tag = `proef-${Date.now()}`
  let orderLineId: string
  let customerId: string
  let userId: string
  let contactId: string

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)

    const customer = await db.customer.create({
      data: {
        number: uniqueNumber(),
        name: `${tag} klant`,
        contacts: { create: [{ firstName: 'Demo', lastName: 'Inkoper', isPrimary: true }] },
      },
      include: { contacts: true },
    })
    customerId = customer.id
    contactId = customer.contacts[0].id

    userId = (await db.user.create({ data: { email: `${tag}@test.local`, name: 'Orderbeheer' } })).id

    const order = await db.order.create({
      data: {
        number: `ORD-${tag}`,
        kind: 'ORDER',
        customerId,
        lines: { create: [{ lineNumber: 1, productName: 'Thermosbeker', quantity: 250, unitSalePrice: '9.9500' }] },
      },
      include: { lines: true },
    })
    orderLineId = order.lines[0].id
  })

  afterAll(async () => {
    await db.order.deleteMany({ where: { customerId } })
    await db.customer.deleteMany({ where: { id: customerId } })
    await db.user.deleteMany({ where: { id: userId } })
    await db.$disconnect()
  })

  it('legt een eerste drukproef vast met versienummer 1', async () => {
    const proof = await db.proof.create({ data: { orderLineId, versionNumber: 1 } })
    expect(proof.versionNumber).toBe(1)
    expect(proof.status).toBe('REQUESTED')
  })

  it('staat geen twee drukproeven met hetzelfde versienummer toe', async () => {
    await expect(db.proof.create({ data: { orderLineId, versionNumber: 1 } })).rejects.toThrow()
  })

  it('bewaart de goedkeuringshistorie, ook een wijzigingsverzoek', async () => {
    const v1 = await db.proof.findFirstOrThrow({ where: { orderLineId, versionNumber: 1 } })

    await db.proofApproval.create({
      data: {
        proofId: v1.id,
        decision: 'CHANGES_REQUESTED',
        decidedByContactId: contactId,
        comment: 'Logo staat te laag.',
      },
    })
    await db.proof.update({
      where: { id: v1.id },
      data: { status: 'CHANGES_REQUESTED', decidedAt: new Date() },
    })

    const v2 = await db.proof.create({
      data: { orderLineId, versionNumber: 2, status: 'SENT_TO_CUSTOMER', sentToCustomerAt: new Date() },
    })
    await db.proofApproval.create({
      data: { proofId: v2.id, decision: 'APPROVED', decidedByUserId: userId, comment: 'Akkoord.' },
    })
    await db.proof.update({ where: { id: v2.id }, data: { status: 'APPROVED', decidedAt: new Date() } })

    const historie = await db.proof.findMany({
      where: { orderLineId },
      include: { approvals: true },
      orderBy: { versionNumber: 'asc' },
    })
    expect(historie).toHaveLength(2)
    expect(historie[0].approvals[0].decision).toBe('CHANGES_REQUESTED')
    expect(historie[1].approvals[0].decision).toBe('APPROVED')
    // Het wijzigingsverzoek blijft bewaard na goedkeuring van versie 2.
    expect(historie[0].status).toBe('CHANGES_REQUESTED')
  })

  it('koppelt een document aan de drukproef', async () => {
    const proof = await db.proof.findFirstOrThrow({ where: { orderLineId, versionNumber: 2 } })
    await db.document.create({
      data: {
        category: 'PROOF',
        title: 'Drukproef versie 2',
        visibility: 'CUSTOMER',
        proofId: proof.id,
        orderLineId,
        versions: {
          create: [{
            versionNumber: 1,
            storageKey: `test/${proof.id}/proof-v2.pdf`,
            fileName: 'proef-v2.pdf',
            mimeType: 'application/pdf',
            sizeBytes: 2048,
            checksum: 'test',
          }],
        },
      },
    })
    const docs = await db.document.findMany({ where: { proofId: proof.id }, include: { versions: true } })
    expect(docs).toHaveLength(1)
    expect(docs[0].versions).toHaveLength(1)
  })

  it('verwijdert drukproeven en goedkeuringen mee met de orderregel', async () => {
    await db.orderLine.delete({ where: { id: orderLineId } })
    expect(await db.proof.count({ where: { orderLineId } })).toBe(0)
  })
})
