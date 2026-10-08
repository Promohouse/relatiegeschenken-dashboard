import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { generateApiKey, apiKeyMatches } from '@rgh/contracts'
import { createPrismaClient, type Db } from '../src/index'
import { uniqueNumber } from './helpers'

config({ path: resolve(__dirname, '../../../.env') })

/**
 * Kanalen: eigen webshop, besloten klantomgeving en partnerkanaal, elk met
 * eigen assortiment en prijsregels (ADR-0004, uitgaande kant).
 */
describe('kanalen en partners', () => {
  let db: Db
  const tag = `kanaal-${Date.now()}`
  let productId: string
  let publicChannelId: string
  let partnerChannelId: string

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    productId = (await db.product.create({
      data: { articleNumber: `${tag}-1001`, name: 'Testartikel' },
    })).id

    publicChannelId = (await db.shopChannel.create({
      data: { key: `${tag}-public`, name: 'Eigen webshop', type: 'PUBLIC' },
    })).id
    partnerChannelId = (await db.shopChannel.create({
      data: { key: `${tag}-partner`, name: 'Partnerkanaal', type: 'PARTNER' },
    })).id
  })

  afterAll(async () => {
    await db.shopChannel.deleteMany({ where: { key: { startsWith: tag } } })
    await db.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await db.$disconnect()
  })

  it('laat hetzelfde product in meerdere kanalen staan met eigen prijs', async () => {
    await db.channelAssortmentItem.create({ data: { channelId: publicChannelId, productId } })
    await db.channelAssortmentItem.create({
      data: { channelId: partnerChannelId, productId, overrideUnitPrice: '7.5000' },
    })

    const items = await db.channelAssortmentItem.findMany({ where: { productId } })
    expect(items).toHaveLength(2)
    const partner = items.find((i) => i.channelId === partnerChannelId)
    expect(partner?.overrideUnitPrice?.toString()).toBe('7.5')
  })

  it('staat een product niet twee keer in hetzelfde kanaal toe', async () => {
    await expect(
      db.channelAssortmentItem.create({ data: { channelId: publicChannelId, productId } }),
    ).rejects.toThrow()
  })

  it('kiest de prijsregel met de laagste priority binnen de geldigheidsperiode', async () => {
    const nu = new Date()
    await db.priceRule.createMany({
      data: [
        { scope: 'GLOBAL', marginPercent: '100.00', priority: 100 },
        { scope: 'PRODUCT', productId, marginPercent: '140.00', priority: 10, validFrom: new Date(nu.getTime() - 86400000) },
        { scope: 'PRODUCT', productId, marginPercent: '160.00', priority: 5, validFrom: new Date(nu.getTime() + 30 * 86400000) },
      ],
    })

    const actief = await db.priceRule.findMany({
      where: {
        isActive: true,
        productId,
        OR: [{ validFrom: null }, { validFrom: { lte: nu } }],
      },
      orderBy: { priority: 'asc' },
    })

    // De regel van 160% begint pas over een maand en doet nu niet mee.
    expect(actief).toHaveLength(1)
    expect(actief[0].marginPercent?.toString()).toBe('140')

    await db.priceRule.deleteMany({ where: { productId } })
    await db.priceRule.deleteMany({ where: { scope: 'GLOBAL', priority: 100, marginPercent: '100.00' } })
  })

  it('bewaart van een API-sleutel alleen de hash', async () => {
    const partner = await db.partnerAccount.create({
      data: { name: `${tag} partner`, channelId: partnerChannelId, contactEmail: 'partner@test.local' },
    })

    const { key, keyHash } = generateApiKey()
    const stored = await db.apiKey.create({
      data: {
        name: 'Feedtoegang',
        partnerAccountId: partner.id,
        keyHash,
        scopes: ['products:view', 'orders:create'],
      },
    })

    // De sleutel zelf staat nergens in de database.
    expect(stored.keyHash).toBe(keyHash)
    expect(JSON.stringify(stored)).not.toContain(key)
    expect(apiKeyMatches(key, stored.keyHash)).toBe(true)
    expect(stored.scopes).toEqual(['products:view', 'orders:create'])

    await expect(
      db.apiKey.create({ data: { name: 'Dubbel', keyHash, partnerAccountId: partner.id } }),
    ).rejects.toThrow()

    await db.partnerAccount.delete({ where: { id: partner.id } })
  })

  it('legt een uitgaande feed per kanaal vast', async () => {
    const feed = await db.feedExport.create({
      data: {
        channelId: partnerChannelId,
        key: `${tag}-feed`,
        name: 'Partnerfeed',
        format: 'GOOGLE_SHOPPING',
        settings: { includeOutOfStock: false },
      },
    })
    expect(feed.format).toBe('GOOGLE_SHOPPING')
    expect(feed.lastGeneratedAt).toBeNull()
  })

  it('koppelt een besloten kanaal aan één klant', async () => {
    const customer = await db.customer.create({
      data: { number: uniqueNumber(), name: `${tag} klant` },
    })
    const channel = await db.shopChannel.create({
      data: { key: `${tag}-klant`, name: 'Klantomgeving', type: 'CUSTOMER', customerId: customer.id },
    })
    expect(channel.customerId).toBe(customer.id)

    // Kanaal verdwijnt met de klant mee.
    await db.customer.delete({ where: { id: customer.id } })
    expect(await db.shopChannel.count({ where: { id: channel.id } })).toBe(0)
  })
})
