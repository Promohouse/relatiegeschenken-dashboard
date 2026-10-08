import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { computePayloadHash } from '@rgh/contracts'
import {
  createPrismaClient, resolveCapabilitySource, listCapabilitySources, needsProcessing, type Db,
} from '../src/index'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Capability-routing en de hash-vergelijking uit ADR-0004: catalogus via een
 * feed, voorraad via een directe API, met een terugvaloptie.
 */
describe('leverancierskoppelingen', () => {
  let db: Db
  const tag = `conn-${Date.now()}`
  let supplierId: string
  let feedId: string
  let apiId: string

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)

    const supplier = await db.supplier.create({ data: { code: tag, name: `${tag} leverancier` } })
    supplierId = supplier.id

    const feed = await db.supplierConnection.create({
      data: {
        supplierId,
        key: `${tag}-feed`,
        connectorKey: 'generic-xml',
        transport: 'XML_FEED',
        capabilities: {
          create: [
            { capability: 'CATALOG', priority: 10, schedule: '0 3 * * *' },
            { capability: 'PRICE_TIERS', priority: 10 },
          ],
        },
      },
    })
    feedId = feed.id

    const api = await db.supplierConnection.create({
      data: {
        supplierId,
        key: `${tag}-api`,
        connectorKey: 'generic-rest',
        transport: 'REST',
        capabilities: {
          create: [
            { capability: 'CATALOG', priority: 50 },
            { capability: 'INVENTORY', priority: 10 },
            { capability: 'PLACE_ORDER', priority: 10 },
          ],
        },
      },
    })
    apiId = api.id
  })

  afterAll(async () => {
    await db.supplier.deleteMany({ where: { code: tag } })
    await db.$disconnect()
  })

  it('kiest voor de catalogus de bron met de laagste priority', async () => {
    const source = await resolveCapabilitySource(db, supplierId, 'CATALOG')
    expect(source?.connection.id).toBe(feedId)
    expect(source?.connection.transport).toBe('XML_FEED')
  })

  it('haalt voorraad en orders bij de directe API, niet bij de feed', async () => {
    const inventory = await resolveCapabilitySource(db, supplierId, 'INVENTORY')
    const placeOrder = await resolveCapabilitySource(db, supplierId, 'PLACE_ORDER')
    expect(inventory?.connection.id).toBe(apiId)
    expect(placeOrder?.connection.id).toBe(apiId)
  })

  it('valt terug op de volgende bron als de eerste uitgezet wordt', async () => {
    await db.supplierConnectionCapability.updateMany({
      where: { connectionId: feedId, capability: 'CATALOG' },
      data: { isEnabled: false },
    })
    const source = await resolveCapabilitySource(db, supplierId, 'CATALOG')
    expect(source?.connection.id).toBe(apiId)

    await db.supplierConnectionCapability.updateMany({
      where: { connectionId: feedId, capability: 'CATALOG' },
      data: { isEnabled: true },
    })
  })

  it('negeert een verbinding die inactief is gezet', async () => {
    await db.supplierConnection.update({ where: { id: feedId }, data: { isActive: false } })
    const source = await resolveCapabilitySource(db, supplierId, 'CATALOG')
    expect(source?.connection.id).toBe(apiId)
    await db.supplierConnection.update({ where: { id: feedId }, data: { isActive: true } })
  })

  it('geeft null als geen enkele bron de capability levert', async () => {
    expect(await resolveCapabilitySource(db, supplierId, 'SHIPPING')).toBeNull()
  })

  it('toont alle bronnen op volgorde, zodat de terugval zichtbaar is', async () => {
    const sources = await listCapabilitySources(db, supplierId, 'CATALOG')
    expect(sources.map((s) => s.priority)).toEqual([10, 50])
  })

  it('staat dezelfde capability niet twee keer op één verbinding toe', async () => {
    await expect(
      db.supplierConnectionCapability.create({
        data: { connectionId: feedId, capability: 'CATALOG', priority: 1 },
      }),
    ).rejects.toThrow()
  })

  it('slaat ongewijzigde artikelen over op basis van de hash', async () => {
    const payload = { sku: 'S1001', name: 'Beker', price: '4.85' }
    const hash = computePayloadHash(payload)

    // Nog nooit gezien: verwerken.
    expect(await needsProcessing(db, feedId, 'S1001', hash)).toBe(true)

    await db.rawSupplierProduct.create({
      data: { connectionId: feedId, externalId: 'S1001', payload, hash },
    })

    // Zelfde inhoud, andere veldvolgorde: overslaan.
    const zelfde = computePayloadHash({ price: '4.85', name: 'Beker', sku: 'S1001' })
    expect(await needsProcessing(db, feedId, 'S1001', zelfde)).toBe(false)

    // Prijswijziging: verwerken.
    const gewijzigd = computePayloadHash({ ...payload, price: '4.95' })
    expect(await needsProcessing(db, feedId, 'S1001', gewijzigd)).toBe(true)
  })

  it('bewaart een ruw artikel per verbinding en externe id maar één keer', async () => {
    await expect(
      db.rawSupplierProduct.create({
        data: { connectionId: feedId, externalId: 'S1001', payload: {}, hash: 'x' },
      }),
    ).rejects.toThrow()
  })

  it('zet wijzigingen klaar en markeert ze als toegepast', async () => {
    const run = await db.importRun.create({
      data: { connectionId: feedId, capability: 'CATALOG', status: 'RUNNING', itemsSeen: 2 },
    })

    await db.stagedChange.createMany({
      data: [
        { importRunId: run.id, entityType: 'Product', externalId: 'S1001', changeType: 'UPDATE', diff: { price: { van: '4.85', naar: '4.95' } } },
        { importRunId: run.id, entityType: 'Product', externalId: 'S1002', changeType: 'CREATE', diff: { name: { van: null, naar: 'Nieuw artikel' } } },
      ],
    })

    expect(await db.stagedChange.count({ where: { importRunId: run.id, status: 'PENDING' } })).toBe(2)

    await db.stagedChange.updateMany({
      where: { importRunId: run.id, changeType: 'CREATE' },
      data: { status: 'APPLIED', appliedAt: new Date() },
    })

    expect(await db.stagedChange.count({ where: { importRunId: run.id, status: 'PENDING' } })).toBe(1)
    expect(await db.stagedChange.count({ where: { importRunId: run.id, status: 'APPLIED' } })).toBe(1)

    await db.importRun.update({
      where: { id: run.id },
      data: { status: 'PARTIAL', finishedAt: new Date(), itemsChanged: 2, itemsFailed: 0 },
    })
    const after = await db.importRun.findUniqueOrThrow({ where: { id: run.id } })
    expect(after.status).toBe('PARTIAL')
  })

  it('bewaart een mislukt artikel zonder de run te laten vallen', async () => {
    const run = await db.importRun.create({
      data: { connectionId: feedId, capability: 'CATALOG', status: 'RUNNING' },
    })
    await db.importItem.createMany({
      data: [
        { importRunId: run.id, externalId: 'S2001', status: 'OK' },
        { importRunId: run.id, externalId: 'S2002', status: 'FAILED', message: 'prijs niet te lezen' },
        { importRunId: run.id, externalId: 'S2003', status: 'SKIPPED', message: 'ongewijzigd' },
      ],
    })
    expect(await db.importItem.count({ where: { importRunId: run.id, status: 'FAILED' } })).toBe(1)
    expect(await db.importItem.count({ where: { importRunId: run.id } })).toBe(3)
  })

  it('mapt leveranciersbenamingen naar één eigen waarde', async () => {
    await db.valueMapping.createMany({
      data: [
        { connectionId: feedId, domain: 'COLOR', sourceValue: 'navy', targetValue: 'Donkerblauw' },
        { connectionId: feedId, domain: 'COLOR', sourceValue: 'NY', targetValue: 'Donkerblauw' },
      ],
    })
    const mapped = await db.valueMapping.findMany({
      where: { connectionId: feedId, domain: 'COLOR', targetValue: 'Donkerblauw' },
    })
    expect(mapped).toHaveLength(2)

    await expect(
      db.valueMapping.create({
        data: { connectionId: feedId, domain: 'COLOR', sourceValue: 'navy', targetValue: 'Marine' },
      }),
    ).rejects.toThrow()
  })
})
