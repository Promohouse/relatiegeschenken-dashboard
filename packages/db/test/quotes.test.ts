import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import {
  createPrismaClient, lockQuoteVersion, nextQuoteVersionNumber,
  approvalIdempotencyKey, allowLockedQuoteChanges, type Db,
} from '../src/index'
import { uniqueNumber } from './helpers'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * ADR-0007: een verzonden offerteversie is onveranderlijk, zodat een digitaal
 * klantakkoord aantoonbaar aan een exacte versie vastligt. Dat wordt door
 * databasetriggers afgedwongen; deze suite bewijst dat.
 */
describe('offertes', () => {
  let db: Db
  const tag = `quote-${Date.now()}`
  let customerId: string
  let contactId: string
  let quoteId: string

  async function nieuweVersie(quoteId: string, regels = 1) {
    const versionNumber = await db.$transaction((tx) => nextQuoteVersionNumber(tx, quoteId))
    return db.quoteVersion.create({
      data: {
        quoteId,
        versionNumber,
        subtotalExclVat: '1000.00',
        vatAmount: '210.00',
        totalInclVat: '1210.00',
        items: {
          create: Array.from({ length: regels }, (_, i) => ({
            lineNumber: i + 1,
            productName: `Testartikel ${i + 1}`,
            quantity: 100,
            unitSalePrice: '10.0000',
            lineSubtotalExclVat: '1000.00',
          })),
        },
      },
      include: { items: true },
    })
  }

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    const customer = await db.customer.create({
      data: {
        number: uniqueNumber(),
        name: `${tag} klant`,
        contacts: { create: [{ firstName: 'Demo', lastName: 'Goedkeurder', isPrimary: true }] },
      },
      include: { contacts: true },
    })
    customerId = customer.id
    contactId = customer.contacts[0].id
    quoteId = (await db.quote.create({ data: { number: uniqueNumber('OFF'), customerId } })).id
  })

  afterAll(async () => {
    // Orders eerst: Order.quoteVersionId is Restrict. Daarna de offertes, met
    // het ontsnappingsluik omdat er vastgezette versies tussen zitten.
    await db.order.deleteMany({ where: { customer: { name: { startsWith: tag } } } })
    await db.$transaction(async (tx) => {
      await allowLockedQuoteChanges(tx)
      await tx.quote.deleteMany({ where: { customerId } })
    })
    await db.customer.deleteMany({ where: { id: customerId } })
    await db.$disconnect()
  })

  describe('versienummering', () => {
    it('begint bij 1 en loopt op', async () => {
      expect(await db.$transaction((tx) => nextQuoteVersionNumber(tx, quoteId))).toBe(1)
      const v1 = await nieuweVersie(quoteId)
      expect(v1.versionNumber).toBe(1)
      expect(await db.$transaction((tx) => nextQuoteVersionNumber(tx, quoteId))).toBe(2)
    })

    it('staat geen twee versies met hetzelfde nummer toe', async () => {
      await expect(db.quoteVersion.create({ data: { quoteId, versionNumber: 1 } })).rejects.toThrow()
    })
  })

  describe('een concept mag nog wel gewijzigd worden', () => {
    it('laat een niet-vastgezette versie en zijn regels aanpassen', async () => {
      const v = await nieuweVersie(quoteId, 2)
      const bijgewerkt = await db.quoteVersion.update({
        where: { id: v.id },
        data: { customerNotes: 'Aangepast concept.' },
      })
      expect(bijgewerkt.customerNotes).toBe('Aangepast concept.')

      await db.quoteItem.update({ where: { id: v.items[0].id }, data: { quantity: 150 } })
      const extra = await db.quoteItem.create({
        data: { quoteVersionId: v.id, lineNumber: 3, productName: 'Extra', quantity: 10, unitSalePrice: '1.0000' },
      })
      expect(extra.lineNumber).toBe(3)

      await db.quoteItem.delete({ where: { id: extra.id } })
      expect(await db.quoteItem.count({ where: { quoteVersionId: v.id } })).toBe(2)
    })
  })

  describe('vastzetten maakt de versie onveranderlijk', () => {
    let versionId: string
    let itemId: string

    beforeAll(async () => {
      const v = await nieuweVersie(quoteId, 1)
      versionId = v.id
      itemId = v.items[0].id
      await db.$transaction((tx) => lockQuoteVersion(tx, versionId, { documentChecksum: 'abc123' }))
    })

    it('zet lockedAt, sentAt en de controlewaarde', async () => {
      const v = await db.quoteVersion.findUniqueOrThrow({ where: { id: versionId } })
      expect(v.lockedAt).not.toBeNull()
      expect(v.sentAt).not.toBeNull()
      expect(v.documentChecksum).toBe('abc123')
    })

    it('weigert een tweede keer vastzetten', async () => {
      await expect(
        db.$transaction((tx) => lockQuoteVersion(tx, versionId)),
      ).rejects.toThrow(/al vastgezet/i)
    })

    it('weigert elke wijziging aan de versie', async () => {
      await expect(
        db.quoteVersion.update({ where: { id: versionId }, data: { customerNotes: 'stilletjes aanpassen' } }),
      ).rejects.toThrow(/vastgezet/i)
    })

    it('weigert verwijderen van de versie', async () => {
      await expect(db.quoteVersion.delete({ where: { id: versionId } })).rejects.toThrow(/vastgezet/i)
    })

    it('weigert een wijziging aan een offerteregel', async () => {
      await expect(
        db.quoteItem.update({ where: { id: itemId }, data: { quantity: 999 } }),
      ).rejects.toThrow(/vastgezet/i)
    })

    it('weigert een nieuwe regel op een vastgezette versie', async () => {
      await expect(
        db.quoteItem.create({
          data: { quoteVersionId: versionId, lineNumber: 99, productName: 'Smokkelregel', quantity: 1, unitSalePrice: '1.0000' },
        }),
      ).rejects.toThrow(/vastgezet/i)
    })

    it('weigert verwijderen van een regel', async () => {
      await expect(db.quoteItem.delete({ where: { id: itemId } })).rejects.toThrow(/vastgezet/i)
    })

    it('weigert een bedrukking op een regel van een vastgezette versie', async () => {
      await expect(
        db.quoteItemPrintJob.create({
          data: { quoteItemId: itemId, printMethodName: 'Zeefdruk', colors: 1 },
        }),
      ).rejects.toThrow(/vastgezet/i)
    })

    it('laat een beheerhandeling door, maar alleen via het ontsnappingsluik', async () => {
      await db.$transaction(async (tx) => {
        await allowLockedQuoteChanges(tx)
        await tx.quoteItem.update({ where: { id: itemId }, data: { notes: 'gecorrigeerd tijdens beheer' } })
      })
      const item = await db.quoteItem.findUniqueOrThrow({ where: { id: itemId } })
      expect(item.notes).toBe('gecorrigeerd tijdens beheer')

      // Zonder het luik blijft het geweigerd.
      await expect(
        db.quoteItem.update({ where: { id: itemId }, data: { notes: 'toch nog even' } }),
      ).rejects.toThrow(/vastgezet/i)
    })
  })

  describe('klantakkoord', () => {
    let versionId: string

    beforeAll(async () => {
      const v = await nieuweVersie(quoteId, 1)
      versionId = v.id
      await db.$transaction((tx) => lockQuoteVersion(tx, versionId, { documentChecksum: 'def456' }))
    })

    it('legt de beslissing vast met bewijsmateriaal', async () => {
      const approval = await db.quoteApproval.create({
        data: {
          quoteVersionId: versionId,
          decision: 'ACCEPTED',
          decidedByContactId: contactId,
          documentChecksum: 'def456',
          ipAddress: '203.0.113.5',
          userAgent: 'test',
          idempotencyKey: approvalIdempotencyKey(versionId, 'ACCEPTED'),
        },
      })
      expect(approval.decision).toBe('ACCEPTED')
      expect(approval.documentChecksum).toBe('def456')
    })

    it('levert bij tweemaal akkoord geven één beslissing', async () => {
      await expect(
        db.quoteApproval.create({
          data: {
            quoteVersionId: versionId,
            decision: 'ACCEPTED',
            decidedByContactId: contactId,
            idempotencyKey: approvalIdempotencyKey(versionId, 'ACCEPTED'),
          },
        }),
      ).rejects.toThrow()
      expect(await db.quoteApproval.count({ where: { quoteVersionId: versionId } })).toBe(1)
    })

    it('staat een andere soort beslissing op dezelfde versie wel toe', async () => {
      const wijziging = await db.quoteApproval.create({
        data: {
          quoteVersionId: versionId,
          decision: 'CHANGES_REQUESTED',
          decidedByContactId: contactId,
          comment: 'Logo groter.',
          idempotencyKey: approvalIdempotencyKey(versionId, 'CHANGES_REQUESTED'),
        },
      })
      expect(wijziging.decision).toBe('CHANGES_REQUESTED')
    })

    it('is append-only: wijzigen en verwijderen worden geweigerd', async () => {
      const approval = await db.quoteApproval.findFirstOrThrow({
        where: { quoteVersionId: versionId, decision: 'ACCEPTED' },
      })
      await expect(
        db.quoteApproval.update({ where: { id: approval.id }, data: { comment: 'herschreven' } }),
      ).rejects.toThrow(/append-only/i)
      await expect(db.quoteApproval.delete({ where: { id: approval.id } })).rejects.toThrow(/append-only/i)
    })

    it('levert uit één geaccepteerde versie nooit twee orders', async () => {
      const first = await db.order.create({
        data: { number: uniqueNumber('ORD'), customerId, quoteVersionId: versionId },
      })
      expect(first.quoteVersionId).toBe(versionId)

      await expect(
        db.order.create({ data: { number: uniqueNumber('ORD'), customerId, quoteVersionId: versionId } }),
      ).rejects.toThrow()
    })

    it('blokkeert verwijderen van een offerteversie waar een order aan hangt', async () => {
      await expect(
        db.$transaction(async (tx) => {
          await allowLockedQuoteChanges(tx)
          await tx.quoteVersion.delete({ where: { id: versionId } })
        }),
      ).rejects.toThrow()
    })
  })
})
