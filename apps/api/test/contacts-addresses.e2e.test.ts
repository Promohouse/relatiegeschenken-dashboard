import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { PrismaService } = await import('../src/core/prisma/prisma.service')

describe('contactpersonen en adressen', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `ca-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let userId = ''
  let roleId = ''
  let klantA = ''
  let klantB = ''

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['customers:view', 'customers:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: 'customers', action: key.split(':')[1] },
        }),
      ),
    )
    roleId = (await prisma.unscoped.role.create({
      data: { key: `${tag}-rol`, name: 'Testrol', permissions: { create: rechten.map((p) => ({ permissionId: p.id })) } },
    })).id

    const email = `${tag}@test.local`
    await api().post('/api/auth/sign-up/email').send({ email, password: wachtwoord, name: 'Test' })
    userId = (await prisma.unscoped.user.findUniqueOrThrow({ where: { email } })).id
    await prisma.unscoped.userRole.create({ data: { userId, roleId } })

    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    klantA = (await prisma.unscoped.customer.create({
      data: { number: `${tag}-A`, name: `${tag} Klant A` },
    })).id
    klantB = (await prisma.unscoped.customer.create({
      data: { number: `${tag}-B`, name: `${tag} Klant B` },
    })).id
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.order.deleteMany({ where: { customerId: { in: [klantA, klantB] } } })
    await prisma.unscoped.customer.deleteMany({ where: { id: { in: [klantA, klantB] } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId } })
    await prisma.unscoped.user.deleteMany({ where: { id: userId } })
    await prisma.unscoped.role.deleteMany({ where: { id: roleId } })
    await app?.close()
  })

  describe('contactpersonen', () => {
    let eerste = ''

    it('voegt een contactpersoon toe', async () => {
      const res = await api()
        .post(`/api/customers/${klantA}/contacts`).set('Cookie', cookie)
        .send({ firstName: 'Anne', lastName: 'de Vries', email: 'Anne@Voorbeeld.NL', isPrimary: true })
        .expect(201)
      eerste = res.body.id
      expect(res.body.email).toBe('anne@voorbeeld.nl')
      expect(res.body.isPrimary).toBe(true)
    })

    it('geeft het hoofdcontact door aan de nieuwe, niet aan allebei', async () => {
      const tweede = await api()
        .post(`/api/customers/${klantA}/contacts`).set('Cookie', cookie)
        .send({ firstName: 'Bram', lastName: 'Jansen', isPrimary: true })
        .expect(201)

      const contacten = await prisma.unscoped.contactPerson.findMany({ where: { customerId: klantA } })
      expect(contacten.filter((c) => c.isPrimary).map((c) => c.id)).toEqual([tweede.body.id])
      expect(contacten.find((c) => c.id === eerste)?.isPrimary).toBe(false)
    })

    it('weigert een contactpersoon zonder achternaam', async () => {
      const res = await api()
        .post(`/api/customers/${klantA}/contacts`).set('Cookie', cookie)
        .send({ firstName: 'Zonder' }).expect(400)
      expect(JSON.stringify(res.body.error.details)).toContain('achternaam')
    })

    it('zet een contactpersoon op inactief en ontneemt dan het hoofdcontact', async () => {
      const contacten = await prisma.unscoped.contactPerson.findMany({
        where: { customerId: klantA, isPrimary: true },
      })
      const res = await api()
        .post(`/api/customers/${klantA}/contacts/${contacten[0].id}/deactivate`)
        .set('Cookie', cookie).expect(200)
      expect(res.body.isActive).toBe(false)
      expect(res.body.isPrimary).toBe(false)
    })

    it('geeft 404 bij een contactpersoon van een andere klant', async () => {
      // Een aangepast id in de URL levert niets op.
      await api()
        .patch(`/api/customers/${klantB}/contacts/${eerste}`).set('Cookie', cookie)
        .send({ phone: '0612345678' }).expect(404)
    })
  })

  describe('adressen', () => {
    let factuur = ''
    let aflever = ''

    it('maakt het eerste adres van een soort vanzelf het standaardadres', async () => {
      const res = await api()
        .post(`/api/customers/${klantA}/addresses`).set('Cookie', cookie)
        .send({ type: 'INVOICE', street: 'Voorbeeldstraat', houseNumber: '1', postalCode: '8000AA', city: 'Zwolle' })
        .expect(201)
      factuur = res.body.id
      expect(res.body.isDefault).toBe(true)
      // Nederlandse postcode netjes weggeschreven.
      expect(res.body.postalCode).toBe('8000 AA')
    })

    it('geeft het standaardadres door aan een nieuw adres van dezelfde soort', async () => {
      const tweede = await api()
        .post(`/api/customers/${klantA}/addresses`).set('Cookie', cookie)
        .send({ type: 'INVOICE', street: 'Nieuweweg', postalCode: '1011 AB', city: 'Amsterdam', isDefault: true })
        .expect(201)

      const adressen = await prisma.unscoped.address.findMany({ where: { customerId: klantA, type: 'INVOICE' } })
      expect(adressen.filter((a) => a.isDefault).map((a) => a.id)).toEqual([tweede.body.id])
    })

    it('houdt soorten uit elkaar: een afleveradres raakt het factuuradres niet', async () => {
      const res = await api()
        .post(`/api/customers/${klantA}/addresses`).set('Cookie', cookie)
        .send({ type: 'DELIVERY', street: 'Magazijnweg', postalCode: '8000 BB', city: 'Zwolle' })
        .expect(201)
      aflever = res.body.id
      expect(res.body.isDefault).toBe(true)

      const factuurStandaard = await prisma.unscoped.address.count({
        where: { customerId: klantA, type: 'INVOICE', isDefault: true },
      })
      expect(factuurStandaard).toBe(1)
    })

    it('weigert een onmogelijke Nederlandse postcode', async () => {
      const res = await api()
        .post(`/api/customers/${klantA}/addresses`).set('Cookie', cookie)
        .send({ type: 'DELIVERY', street: 'Testweg', postalCode: '12', city: 'Zwolle' })
        .expect(400)
      expect(JSON.stringify(res.body.error.details)).toContain('1234 AB')
    })

    it('laat een buitenlandse postcode met rust', async () => {
      const res = await api()
        .post(`/api/customers/${klantA}/addresses`).set('Cookie', cookie)
        .send({ type: 'DELIVERY', street: 'Rue de Test', postalCode: 'B-1000', city: 'Brussel', country: 'BE' })
        .expect(201)
      expect(res.body.postalCode).toBe('B-1000')
    })

    it('verwijdert een adres dat nergens gebruikt wordt', async () => {
      const los = await api()
        .post(`/api/customers/${klantA}/addresses`).set('Cookie', cookie)
        .send({ type: 'DELIVERY', street: 'Verkeerd ingetikt', postalCode: '9999 ZZ', city: 'Nergens' })
        .expect(201)
      await api().delete(`/api/customers/${klantA}/addresses/${los.body.id}`).set('Cookie', cookie).expect(204)
      expect(await prisma.unscoped.address.count({ where: { id: los.body.id } })).toBe(0)
    })

    it('weigert een adres te verwijderen dat aan een order hangt', async () => {
      await prisma.unscoped.order.create({
        data: { number: `ORD-${tag}`, customerId: klantA, deliveryAddressId: aflever },
      })

      const res = await api()
        .delete(`/api/customers/${klantA}/addresses/${aflever}`).set('Cookie', cookie).expect(409)
      expect(res.body.error.message).toContain('1 order')
      expect(res.body.error.message).toContain('niet verwijderd')

      // En het adres staat er nog, dus de order weet nog waar het heen ging.
      expect(await prisma.unscoped.address.count({ where: { id: aflever } })).toBe(1)
    })

    it('geeft 404 bij een adres van een andere klant', async () => {
      await api()
        .delete(`/api/customers/${klantB}/addresses/${factuur}`).set('Cookie', cookie).expect(404)
    })
  })
})
