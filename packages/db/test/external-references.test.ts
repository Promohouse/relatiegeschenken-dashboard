import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPrismaClient, type Db } from '../src/index'
import { uniqueNumber } from './helpers'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Herkomst en idempotente synchronisatie. Zonder deze tabel levert een
 * mislukte synchronisatie bij de tweede poging een duplicaat.
 */
describe('externe verwijzingen', () => {
  let db: Db
  const tag = `extref-${Date.now()}`
  let customerA: string
  let customerB: string

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    customerA = (await db.customer.create({ data: { number: uniqueNumber(), name: `${tag} A` } })).id
    customerB = (await db.customer.create({ data: { number: uniqueNumber(), name: `${tag} B` } })).id
  })

  afterAll(async () => {
    await db.externalReference.deleteMany({ where: { entityId: { in: [customerA, customerB] } } })
    await db.customer.deleteMany({ where: { id: { in: [customerA, customerB] } } })
    await db.$disconnect()
  })

  it('is idempotent: tweemaal synchroniseren levert één verwijzing', async () => {
    const key = { system: 'TEAMLEADER' as const, entityType: 'Customer', entityId: customerA }
    for (let poging = 0; poging < 3; poging++) {
      await db.externalReference.upsert({
        where: { system_entityType_entityId: key },
        update: { lastSyncedAt: new Date(), lastError: null },
        create: { ...key, externalId: `${tag}-A`, externalNumber: 'TL-1001' },
      })
    }
    const refs = await db.externalReference.findMany({ where: { entityId: customerA } })
    expect(refs).toHaveLength(1)
    expect(refs[0].externalId).toBe(`${tag}-A`)
    expect(refs[0].lastSyncedAt).not.toBeNull()
  })

  it('staat niet toe dat twee interne records dezelfde externe identificatie krijgen', async () => {
    await expect(
      db.externalReference.create({
        data: { system: 'TEAMLEADER', entityType: 'Customer', entityId: customerB, externalId: `${tag}-A` },
      }),
    ).rejects.toThrow()
  })

  it('staat niet toe dat één record twee identificaties in hetzelfde systeem krijgt', async () => {
    await expect(
      db.externalReference.create({
        data: { system: 'TEAMLEADER', entityType: 'Customer', entityId: customerA, externalId: `${tag}-A-anders` },
      }),
    ).rejects.toThrow()
  })

  it('staat dezelfde externe identificatie in een ander systeem wel toe', async () => {
    const ref = await db.externalReference.create({
      data: { system: 'SNELSTART', entityType: 'Customer', entityId: customerA, externalId: `${tag}-A` },
    })
    expect(ref.system).toBe('SNELSTART')
  })

  it('staat dezelfde identificatie voor een ander entiteitstype toe', async () => {
    const ref = await db.externalReference.create({
      data: { system: 'TEAMLEADER', entityType: 'Order', entityId: customerA, externalId: `${tag}-A` },
    })
    expect(ref.entityType).toBe('Order')
    await db.externalReference.delete({ where: { id: ref.id } })
  })

  it('bewaart de laatst bekende externe toestand en een foutmelding', async () => {
    await db.externalReference.update({
      where: { system_entityType_entityId: { system: 'SNELSTART', entityType: 'Customer', entityId: customerA } },
      data: {
        payload: { relatiecode: 'DEB-1001', naam: 'Demo' },
        lastError: 'HTTP 503 bij het ophalen van de debiteur',
      },
    })
    const ref = await db.externalReference.findUniqueOrThrow({
      where: { system_entityType_entityId: { system: 'SNELSTART', entityType: 'Customer', entityId: customerA } },
    })
    expect(ref.lastError).toContain('503')
    expect((ref.payload as { relatiecode: string }).relatiecode).toBe('DEB-1001')
  })

  it('is per intern record op te zoeken, ongeacht het systeem', async () => {
    const refs = await db.externalReference.findMany({
      where: { entityType: 'Customer', entityId: customerA },
      orderBy: { system: 'asc' },
    })
    // PostgreSQL sorteert een enum op de volgorde waarin de waarden
    // gedefinieerd zijn, niet alfabetisch. TEAMLEADER staat voor SNELSTART.
    expect(refs.map((r) => r.system)).toEqual(['TEAMLEADER', 'SNELSTART'])
  })
})
