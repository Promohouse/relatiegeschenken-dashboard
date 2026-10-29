import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { maakGebruikerMetWachtwoord } from './helpers'
import { PRINT_DATA_FEED, PRINT_PRICE_FEED, PRODUCT_FEED } from './fixtures/pfconcept'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { PrismaService } = await import('../src/core/prisma/prisma.service')
const { CredentialsService } = await import('../src/core/connectors/credentials.service')
const { PfConceptConnector } = await import('../src/core/connectors/pfconcept/pfconcept.connector')

/**
 * De import van PF Concept tegen de echte database, met gestubde feeds.
 *
 * Wat hier bewezen moet worden: hun drukprijslijst is een opzoektabel en
 * landt als zodanig, een nieuwe lijst vervangt de oude in plaats van ernaast
 * te komen, en het minimum bedrukkingsaantal uit de prijsfeed komt mee - want
 * zonder dat getal is de toeslag eronder niet te rekenen.
 */
describe('PF Concept-import', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `pfc-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let supplierId = ''
  let connectionId = ''
  let productId = ''
  let koppelingId = ''
  const verbinding = `${tag}-pfconcept`

  /** Wat elke feed teruggeeft; per test aan te passen. */
  const feeds: Record<string, unknown> = {
    productfeed: PRODUCT_FEED,
    printdata: PRINT_DATA_FEED,
    printpricefeed: PRINT_PRICE_FEED,
    pricefeed: null,
  }

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const stub = new PfConceptConnector(async (url: string) => {
      const sleutel = Object.keys(feeds).find((k) => url.includes(k))
      return {
        ok: true, status: 200, statusText: 'stub',
        json: async () => (sleutel ? feeds[sleutel] : null),
      } as Response
    })

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PfConceptConnector)
      .useValue(stub)
      .compile()

    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['imports:view', 'imports:create', 'imports:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: 'imports', action: key.split(':')[1] },
        }),
      ),
    )
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-rol`, name: 'Importbeheer',
        permissions: { create: rechten.map((p) => ({ permissionId: p.id })) },
      },
    })
    const email = `${tag}@test.local`
    const ik = await maakGebruikerMetWachtwoord(app, { email, name: 'Tester', password: wachtwoord })
    ikId = ik.id
    await prisma.unscoped.userRole.create({ data: { userId: ikId, roleId: rol.id } })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    supplierId = (await prisma.unscoped.supplier.create({
      data: { code: tag, name: `${tag} PF Concept` },
    })).id

    const credentials = new Uint8Array(
      app.get(CredentialsService).encrypt({ uniqueCode: 'TESTCODE' }),
    )
    connectionId = (await prisma.unscoped.supplierConnection.create({
      data: {
        supplierId,
        key: verbinding,
        connectorKey: 'pfconcept-feed',
        transport: 'JSON_FEED',
        config: { language: 'nl', department: 'cnl1', assortment: 'stock' },
        credentials,
        isActive: true,
        capabilities: {
          create: [
            { capability: 'CATALOG', priority: 10 },
            { capability: 'PRICE_TIERS', priority: 10 },
            { capability: 'PRINT_DATA', priority: 10 },
          ],
        },
      },
    })).id

    // Het artikel staat al in de catalogus; zo hoeft het beoordelingsscherm
    // hier niet doorlopen te worden om bij de prijzen te komen.
    const product = await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-100002`,
        name: 'Oregon 400 ml',
        variants: { create: [{ sku: '10000200', colorName: 'Silver' }] },
        suppliers: {
          create: [{ supplierId, supplierArticleNumber: '100002', purchasePrice: '10.4900' }],
        },
      },
      include: { suppliers: true },
    })
    productId = product.id
    koppelingId = product.suppliers[0].id
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.supplierPrintPriceTier.deleteMany({ where: { connectionId } })
    await prisma.unscoped.supplierPrintMethod.deleteMany({ where: { connectionId } })
    await prisma.unscoped.supplierConnection.deleteMany({ where: { supplierId } })
    await prisma.unscoped.productSupplier.deleteMany({ where: { supplierId } })
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: productId } })
    await prisma.unscoped.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.unscoped.supplier.deleteMany({ where: { id: supplierId } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  const start = (capability: string, dryRun = false) =>
    api().post('/api/imports/run').set('Cookie', cookie)
      .send({ connectionKey: verbinding, capability, dryRun })

  it('legt de drukprijslijst vast als opzoektabel', async () => {
    const res = await start('PRINT_DATA').expect(201)
    expect(res.body.status).not.toBe('FAILED')

    const methode = await prisma.unscoped.supplierPrintMethod.findUnique({
      where: { connectionId_printCode: { connectionId, printCode: 'DEB02' } },
      include: { tiers: { orderBy: { minQuantity: 'asc' } } },
    })

    expect(methode).not.toBeNull()
    expect(methode!.description).toBe('Blinddruk')
    // De toeslag bij bedrukken onder het minimumaantal. Zonder dit bedrag is
    // een kleine bedrukte oplage te goedkoop berekend.
    expect(methode!.ltmCharge?.toString()).toBe('15')
    // Ruwe tekst: welke waarden PF hier gebruikt is nog niet bevestigd.
    expect(methode!.priceDependence).toBe('None')
    expect(methode!.tiers).toHaveLength(10)
  })

  it('bewaart de drie dimensies van zo\'n regel', async () => {
    const methode = await prisma.unscoped.supplierPrintMethod.findUniqueOrThrow({
      where: { connectionId_printCode: { connectionId, printCode: 'DEB02' } },
      include: { tiers: { orderBy: { minQuantity: 'asc' } } },
    })

    const eerste = methode.tiers[0]
    // logoSizeCm2 nul betekent bij PF "formaat doet niet mee"; dat is iets
    // anders dan een logo van nul vierkante centimeter.
    expect(Number(eerste.logoSizeCm2)).toBe(0)
    expect(eerste.colors).toBe(1)
    expect(eerste.minQuantity).toBe(1)
    expect(eerste.unitPrice.toString()).toBe('1.71')
    expect(eerste.setupCost.toString()).toBe('45')

    const laatste = methode.tiers.at(-1)!
    expect(laatste.minQuantity).toBe(5000)
    expect(laatste.unitPrice.toString()).toBe('0.35')
  })

  it('vervangt een vorige prijslijst in plaats van ernaast te komen', async () => {
    // Een achtergebleven regel uit een oude lijst zou gekozen kunnen worden
    // en een verkeerde prijs geven. Dit is leveranciersdata die opnieuw
    // opgehaald wordt, geen gegeven van ons.
    const korter = structuredClone(PRINT_PRICE_FEED) as typeof PRINT_PRICE_FEED
    korter.decoCharges[0].decoCharge[0].logoSizes[0].logoSize[0]
      .amountColors[0].amountColor[0].amountSetupCharges[0]
      .amountSetupCharge[0].decoPrices[0].decoPrice = [
        { decoPriceFromQty: '1', price: 2.5 },
        { decoPriceFromQty: '100', price: 1.25 },
      ]
    feeds.printpricefeed = korter

    try {
      await start('PRINT_DATA').expect(201)

      const methode = await prisma.unscoped.supplierPrintMethod.findUniqueOrThrow({
        where: { connectionId_printCode: { connectionId, printCode: 'DEB02' } },
        include: { tiers: { orderBy: { minQuantity: 'asc' } } },
      })
      expect(methode.tiers).toHaveLength(2)
      expect(methode.tiers[0].unitPrice.toString()).toBe('2.5')
    } finally {
      feeds.printpricefeed = PRINT_PRICE_FEED
    }
  })

  it('schrijft bij een proefimport geen prijslijst weg', async () => {
    await prisma.unscoped.supplierPrintMethod.deleteMany({ where: { connectionId } })

    await start('PRINT_DATA', true).expect(201)

    const aantal = await prisma.unscoped.supplierPrintMethod.count({ where: { connectionId } })
    expect(aantal).toBe(0)

    // En daarna weer vullen voor de volgende tests.
    await start('PRINT_DATA').expect(201)
  })

  describe('prijzen', () => {
    beforeAll(async () => {
      // De prijsimport heeft de vastgelegde catalogus nodig om te weten bij
      // welk artikel een variant hoort.
      await start('CATALOG').expect(201)

      feeds.pricefeed = {
        priceInfo: [
          {
            models: [
              {
                model: [
                  {
                    modelcode: '100002',
                    items: [
                      {
                        item: [
                          {
                            itemcode: '10000200',
                            currency: 'EUR',
                            decoCharge: 'DEB02,LAS04',
                            minDecoQty: '25',
                            scales: [
                              {
                                scale: [
                                  { priceBar: 1, nettPrice: 10.49, type: 'G', industryCol: 26.69 },
                                  { priceBar: 100, nettPrice: 9.95, type: 'G', industryCol: 24.11 },
                                ],
                              },
                            ],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }
    })

    it('stelt het minimum bedrukkingsaantal voor als wijziging', async () => {
      await start('PRICE_TIERS').expect(201)

      const wijziging = await prisma.unscoped.stagedChange.findFirst({
        where: { entityType: 'ProductSupplier', entityId: koppelingId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      })

      expect(wijziging).not.toBeNull()
      const diff = wijziging!.diff as Record<string, { van: unknown; naar: unknown }>
      expect(diff.minDecoQuantity).toEqual({ van: null, naar: 25 })
      // En de staffel, want priceBar is bij PF een beginaantal.
      expect(diff.staffels.naar).toEqual([
        { minimumQuantity: 1, unitPrice: '10.4900' },
        { minimumQuantity: 100, unitPrice: '9.9500' },
      ])
    })

    it('zet het minimum op de koppeling zodra de wijziging is toegepast', async () => {
      const wijziging = await prisma.unscoped.stagedChange.findFirstOrThrow({
        where: { entityType: 'ProductSupplier', entityId: koppelingId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      })

      await api()
        .post(`/api/imports/changes/${wijziging.id}/apply`)
        .set('Cookie', cookie)
        .expect(201)

      const koppeling = await prisma.unscoped.productSupplier.findUniqueOrThrow({
        where: { id: koppelingId },
      })
      expect(koppeling.minDecoQuantity).toBe(25)
    })
  })
})
