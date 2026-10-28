import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { maakGebruikerMetWachtwoord } from './helpers'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { PrismaService } = await import('../src/core/prisma/prisma.service')

describe('productcatalogus', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `prod-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let supplierId = ''
  let bekerId = ''

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const recht = await prisma.unscoped.permission.upsert({
      where: { key: 'products:view' }, update: {},
      create: { key: 'products:view', module: 'products', action: 'view' },
    })
    const rol = await prisma.unscoped.role.create({
      data: { key: `${tag}-rol`, name: 'Catalogus', permissions: { create: [{ permissionId: recht.id }] } },
    })
    const email = `${tag}@test.local`
    const ik = await maakGebruikerMetWachtwoord(app, { email, name: 'Tester', password: wachtwoord })
    ikId = ik.id
    await prisma.unscoped.userRole.create({ data: { userId: ikId, roleId: rol.id } })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    supplierId = (await prisma.unscoped.supplier.create({
      data: { code: tag, name: `${tag} Leverancier` },
    })).id

    bekerId = (await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-BEKER`,
        name: 'Thermosbeker Testa',
        brand: 'midocean',
        material: 'RVS',
        dimensions: 'H 19,5 CM',
        countryOfOrigin: 'CN',
        printable: true,
        variants: {
          create: [
            { sku: `${tag}-BEKER-03`, colorName: 'zwart', colorCode: '03', eanCode: '871000000001' },
            { sku: `${tag}-BEKER-21`, colorName: 'wit', colorCode: '21', isActive: false },
          ],
        },
        suppliers: {
          create: [{
            supplierId,
            supplierArticleNumber: 'TESTA-1',
            purchasePrice: '4.2200',
            isPreferred: true,
            purchaseTiers: {
              create: [
                { minQuantity: 1, unitPrice: '4.2200' },
                { minQuantity: 250, unitPrice: '4.0700' },
              ],
            },
          }],
        },
      },
    })).id

    await prisma.unscoped.product.create({
      data: { articleNumber: `${tag}-OUD`, name: 'Uit de collectie', isActive: false },
    })
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.productSupplier.deleteMany({ where: { supplierId } })
    await prisma.unscoped.productVariant.deleteMany({ where: { sku: { startsWith: tag } } })
    await prisma.unscoped.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.unscoped.supplier.deleteMany({ where: { id: supplierId } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  it('toont een product met zijn voorkeursleverancier en inkoopprijs', async () => {
    const res = await api()
      .get(`/api/products?search=${tag}-BEKER`).set('Cookie', cookie).expect(200)

    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0]).toMatchObject({
      articleNumber: `${tag}-BEKER`,
      name: 'Thermosbeker Testa',
      variantCount: 2,
      supplierArticleNumber: 'TESTA-1',
      purchasePrice: '4.22',
      currency: 'EUR',
    })
  })

  it('zoekt ook op variantnummer en op leveranciersartikelnummer', async () => {
    const opVariant = await api()
      .get(`/api/products?search=${tag}-BEKER-21`).set('Cookie', cookie).expect(200)
    expect(opVariant.body.items[0]?.id).toBe(bekerId)

    const opLeverancier = await api()
      .get('/api/products?search=TESTA-1').set('Cookie', cookie).expect(200)
    expect(opLeverancier.body.items.some((p: { id: string }) => p.id === bekerId)).toBe(true)
  })

  it('filtert op status en op leverancier', async () => {
    const actief = await api()
      .get(`/api/products?search=${tag}&status=active`).set('Cookie', cookie).expect(200)
    expect(actief.body.items.map((p: { articleNumber: string }) => p.articleNumber)).toEqual([`${tag}-BEKER`])

    const inactief = await api()
      .get(`/api/products?search=${tag}&status=inactive`).set('Cookie', cookie).expect(200)
    expect(inactief.body.items.map((p: { articleNumber: string }) => p.articleNumber)).toEqual([`${tag}-OUD`])

    const perLeverancier = await api()
      .get(`/api/products?supplier=${tag}`).set('Cookie', cookie).expect(200)
    expect(perLeverancier.body.items.map((p: { id: string }) => p.id)).toEqual([bekerId])
  })

  it('toont het detail met varianten, staffels en kenmerken', async () => {
    const res = await api().get(`/api/products/${bekerId}`).set('Cookie', cookie).expect(200)

    expect(res.body.material).toBe('RVS')
    expect(res.body.countryOfOrigin).toBe('CN')
    expect(res.body.printable).toBe(true)

    expect(res.body.variants.map((v: { sku: string }) => v.sku)).toEqual([
      `${tag}-BEKER-03`, `${tag}-BEKER-21`,
    ])
    expect(res.body.variants[0]).toMatchObject({ colorCode: '03', eanCode: '871000000001', isActive: true })
    // Een variant die niet meer geleverd wordt blijft zichtbaar, op inactief.
    expect(res.body.variants[1].isActive).toBe(false)

    expect(res.body.suppliers).toHaveLength(1)
    expect(res.body.suppliers[0].tiers).toEqual([
      { minQuantity: 1, unitPrice: '4.22' },
      { minQuantity: 250, unitPrice: '4.07' },
    ])
  })

  it('geeft 404 voor een product dat niet bestaat', async () => {
    await api().get(`/api/products/${randomUUID()}`).set('Cookie', cookie).expect(404)
  })

  it('weigert zonder products:view', async () => {
    const email = `${tag}-zonder@test.local`
    const zonder = await maakGebruikerMetWachtwoord(app, { email, name: 'Zonder', password: wachtwoord })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    const andersCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    await api().get('/api/products').set('Cookie', andersCookie).expect(403)
    await api().get(`/api/products/${bekerId}`).set('Cookie', andersCookie).expect(403)

    await prisma.unscoped.session.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: zonder.id } })
  })
})
