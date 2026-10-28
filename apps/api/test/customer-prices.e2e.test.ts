import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { maakGebruikerMetWachtwoord, uniqueNumber } from './helpers'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { PrismaService } = await import('../src/core/prisma/prisma.service')

describe('klantprijsafspraken', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `kp-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let klantId = ''
  let andereKlantId = ''
  let productId = ''

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['customers:view', 'customers:create', 'customers:update', 'products:view'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: key.split(':')[0], action: key.split(':')[1] },
        }),
      ),
    )
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-rol`, name: 'Testverkoop',
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

    klantId = (await prisma.unscoped.customer.create({
      data: { number: uniqueNumber(), name: `${tag} Hoofdklant BV` },
    })).id
    andereKlantId = (await prisma.unscoped.customer.create({
      data: { number: uniqueNumber(), name: `${tag} Andere klant BV` },
    })).id
    productId = (await prisma.unscoped.product.create({
      data: { articleNumber: `${tag}-2001`, name: 'Katoenen tas Lima' },
    })).id
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.customerPriceAgreement.deleteMany({
      where: { customerId: { in: [klantId, andereKlantId] } },
    })
    await prisma.unscoped.auditLog.deleteMany({
      where: { entity: 'CustomerPriceAgreement' },
    })
    await prisma.unscoped.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.unscoped.customer.deleteMany({ where: { id: { in: [klantId, andereKlantId] } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  let afspraakId = ''

  it('voegt een afspraak toe met het product erbij in het antwoord', async () => {
    const res = await api()
      .post(`/api/customers/${klantId}/prices`).set('Cookie', cookie)
      .send({ productId, minQuantity: 250, unitPrice: '7,9500', note: 'Jaarafspraak, per mail' })
      .expect(201)

    afspraakId = res.body.id
    expect(res.body.productName).toBe('Katoenen tas Lima')
    expect(res.body.productArticleNumber).toBe(`${tag}-2001`)
    // Een komma mag ingevoerd worden; wat de database bewaart is een punt.
    expect(res.body.unitPrice).toBe('7.95')
    expect(res.body.appliesToday).toBe(true)
  })

  it('weigert een tweede afspraak vanaf hetzelfde aantal', async () => {
    const res = await api()
      .post(`/api/customers/${klantId}/prices`).set('Cookie', cookie)
      .send({ productId, minQuantity: 250, unitPrice: '7.0000' })
      .expect(409)
    expect(res.body.error.message).toContain('vanaf 250 stuks')
  })

  it('weigert een prijs met meer dan vier decimalen', async () => {
    const res = await api()
      .post(`/api/customers/${klantId}/prices`).set('Cookie', cookie)
      .send({ productId, minQuantity: 10, unitPrice: '7.123456' })
      .expect(400)
    expect(res.body.error.details[0].veld).toBe('unitPrice')
  })

  it('weigert een afspraak op een product dat niet bestaat', async () => {
    const res = await api()
      .post(`/api/customers/${klantId}/prices`).set('Cookie', cookie)
      .send({ productId: randomUUID(), minQuantity: 10, unitPrice: '5.0000' })
      .expect(404)
    expect(res.body.error.message).toBe('Dit product bestaat niet.')

    // En er blijft geen half aangemaakte afspraak achter.
    const lijst = await api().get(`/api/customers/${klantId}/prices`).set('Cookie', cookie).expect(200)
    expect(lijst.body).toHaveLength(1)
  })

  it('toont per afspraak of hij vandaag meedoet', async () => {
    const verlopen = await api()
      .post(`/api/customers/${klantId}/prices`).set('Cookie', cookie)
      .send({
        productId, minQuantity: 500, unitPrice: '7.0000',
        validTo: new Date(Date.now() - 86400000).toISOString(),
      })
      .expect(201)
    expect(verlopen.body.appliesToday).toBe(false)

    const lijst = await api().get(`/api/customers/${klantId}/prices`).set('Cookie', cookie).expect(200)
    const regels = lijst.body as { minQuantity: number; appliesToday: boolean }[]
    expect(regels.find((r) => r.minQuantity === 250)?.appliesToday).toBe(true)
    expect(regels.find((r) => r.minQuantity === 500)?.appliesToday).toBe(false)

    await api()
      .delete(`/api/customers/${klantId}/prices/${verlopen.body.id}`).set('Cookie', cookie)
      .expect(204)
  })

  it('wijzigt de prijs en legt het verschil in het auditlog vast', async () => {
    await api()
      .patch(`/api/customers/${klantId}/prices/${afspraakId}`).set('Cookie', cookie)
      .send({ unitPrice: '7.5000' })
      .expect(200)

    const regel = await prisma.unscoped.auditLog.findFirst({
      where: { entity: 'CustomerPriceAgreement', entityId: afspraakId, action: 'UPDATE' },
      orderBy: { occurredAt: 'desc' },
    })
    const diff = regel?.diff as Record<string, { van: unknown; naar: unknown }> | null
    expect(Object.keys(diff ?? {})).toContain('unitPrice')
  })

  it('laat een wijziging van de prijs de rest ongemoeid', async () => {
    const voor = await api().get(`/api/customers/${klantId}/prices`).set('Cookie', cookie).expect(200)
    const bestaand = voor.body.find((a: { id: string }) => a.id === afspraakId)

    await api()
      .patch(`/api/customers/${klantId}/prices/${afspraakId}`).set('Cookie', cookie)
      .send({ unitPrice: '7.4000' }).expect(200)

    const na = await api().get(`/api/customers/${klantId}/prices`).set('Cookie', cookie).expect(200)
    const nieuw = na.body.find((a: { id: string }) => a.id === afspraakId)
    expect(nieuw.note).toBe(bestaand.note)
    expect(nieuw.isActive).toBe(bestaand.isActive)
    expect(nieuw.minQuantity).toBe(bestaand.minQuantity)
  })

  it('kent de afspraak van een andere klant niet', async () => {
    await api()
      .patch(`/api/customers/${andereKlantId}/prices/${afspraakId}`).set('Cookie', cookie)
      .send({ unitPrice: '1.0000' })
      .expect(404)
    await api()
      .delete(`/api/customers/${andereKlantId}/prices/${afspraakId}`).set('Cookie', cookie)
      .expect(404)

    // De afspraak staat er nog, met de prijs van de vorige test.
    const lijst = await api().get(`/api/customers/${klantId}/prices`).set('Cookie', cookie).expect(200)
    expect(lijst.body.find((a: { id: string }) => a.id === afspraakId).unitPrice).toBe('7.4')
  })

  it('weigert een geldigheidsvenster dat eindigt voordat het begint', async () => {
    // Bij het veld, niet als serverfout: de database heeft hier ook een
    // check-constraint, maar een typefout hoort een nette melding te geven.
    const res = await api()
      .post(`/api/customers/${klantId}/prices`).set('Cookie', cookie)
      .send({
        productId, minQuantity: 750, unitPrice: '6.0000',
        validFrom: '2026-06-01', validTo: '2026-01-01',
      })
      .expect(400)
    expect(res.body.error.details).toEqual([
      { veld: 'validTo', melding: 'De einddatum ligt voor de begindatum' },
    ])
  })

  it('verwijdert een afspraak', async () => {
    await api()
      .delete(`/api/customers/${klantId}/prices/${afspraakId}`).set('Cookie', cookie)
      .expect(204)
    const lijst = await api().get(`/api/customers/${klantId}/prices`).set('Cookie', cookie).expect(200)
    expect(lijst.body).toHaveLength(0)
  })

  it('weigert een afspraak bij een klant die niet bestaat', async () => {
    await api()
      .get(`/api/customers/${randomUUID()}/prices`).set('Cookie', cookie)
      .expect(404)
  })
})
