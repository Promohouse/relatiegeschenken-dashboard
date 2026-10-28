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

describe('betalingsvoorwaarden', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `bt-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let klantId = ''

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['settings:view', 'settings:update', 'customers:view', 'customers:create', 'customers:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: key.split(':')[0], action: key.split(':')[1] },
        }),
      ),
    )
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-beheer`, name: 'Testbeheer',
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

    const klant = await api()
      .post('/api/customers').set('Cookie', cookie)
      .send({ name: `${tag} Testklant BV` }).expect(201)
    klantId = klant.body.id
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: ikId } })
    if (klantId) {
      await prisma.unscoped.auditLog.deleteMany({ where: { entityId: klantId } })
      await prisma.unscoped.customer.deleteMany({ where: { id: klantId } })
    }
    const termen = await prisma.unscoped.paymentTerm.findMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: { in: termen.map((t) => t.id) } } })
    await prisma.unscoped.paymentTerm.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  let termijnId = ''

  it('maakt een voorwaarde aan en beschrijft hem voor een document', async () => {
    const res = await api()
      .post('/api/payment-terms').set('Cookie', cookie)
      .send({ key: `${tag}_eom`, name: 'Einde maand plus 30', days: 30, endOfMonth: true, sort: 500 })
      .expect(201)

    termijnId = res.body.id
    expect(res.body.description).toBe('30 dagen na einde maand')
    expect(res.body.customerCount).toBe(0)
    expect(res.body.isDefault).toBe(false)
  })

  it('weigert een tweede voorwaarde met dezelfde sleutel', async () => {
    const res = await api()
      .post('/api/payment-terms').set('Cookie', cookie)
      .send({ key: `${tag}_eom`, name: 'Nog een keer', days: 10 })
      .expect(409)
    expect(res.body.error.message).toContain(`${tag}_eom`)
  })

  it('weigert een vooruitbetaling boven honderd procent bij het veld zelf', async () => {
    const res = await api()
      .post('/api/payment-terms').set('Cookie', cookie)
      .send({ key: `${tag}_fout`, name: 'Te veel', days: 0, prepaymentPercent: '120' })
      .expect(400)
    expect(res.body.error.details).toEqual([
      { veld: 'prepaymentPercent', melding: 'Meer dan 100% vooruit kan niet' },
    ])
  })

  it('houdt hoogstens één standaard over als er een nieuwe wordt aangewezen', async () => {
    const voor = await api().get('/api/payment-terms').set('Cookie', cookie).expect(200)
    const oudeStandaard = voor.body.find((t: { isDefault: boolean }) => t.isDefault)

    await api()
      .patch(`/api/payment-terms/${termijnId}`).set('Cookie', cookie)
      .send({ isDefault: true }).expect(200)

    const na = await api().get('/api/payment-terms').set('Cookie', cookie).expect(200)
    const standaarden = na.body.filter((t: { isDefault: boolean }) => t.isDefault)
    expect(standaarden).toHaveLength(1)
    expect(standaarden[0].id).toBe(termijnId)

    // Terugzetten, zodat de seedstandaard weer klopt voor andere tests.
    if (oudeStandaard) {
      await api()
        .patch(`/api/payment-terms/${oudeStandaard.id}`).set('Cookie', cookie)
        .send({ isDefault: true }).expect(200)
    }
  })

  it('weigert de standaard uit te zetten zonder een andere aan te wijzen', async () => {
    const lijst = await api().get('/api/payment-terms').set('Cookie', cookie).expect(200)
    const standaard = lijst.body.find((t: { isDefault: boolean }) => t.isDefault)

    const res = await api()
      .patch(`/api/payment-terms/${standaard.id}`).set('Cookie', cookie)
      .send({ isDefault: false }).expect(422)
    expect(res.body.error.message).toContain('Zet eerst een andere')
  })

  it('koppelt een voorwaarde aan een klant en toont die bij de klant', async () => {
    await api()
      .patch(`/api/customers/${klantId}`).set('Cookie', cookie)
      .send({ paymentTermId: termijnId }).expect(200)

    const klant = await api().get(`/api/customers/${klantId}`).set('Cookie', cookie).expect(200)
    expect(klant.body.paymentTermId).toBe(termijnId)
    expect(klant.body.paymentTermName).toBe('Einde maand plus 30')
    expect(klant.body.paymentTermIsDefault).toBe(false)

    const termijn = await api().get(`/api/payment-terms/${termijnId}`).set('Cookie', cookie).expect(200)
    expect(termijn.body.customerCount).toBe(1)
  })

  it('laat een wijziging van één veld de rest ongemoeid', async () => {
    // Niet academisch: met een `.partial()`-schema zette een wijziging van de
    // naam ook endOfMonth, sort en de standaardvlag terug op hun beginwaarde.
    const voor = await api().get(`/api/payment-terms/${termijnId}`).set('Cookie', cookie).expect(200)
    await api()
      .patch(`/api/payment-terms/${termijnId}`).set('Cookie', cookie)
      .send({ name: 'Einde maand plus 30 dagen' }).expect(200)

    const na = await api().get(`/api/payment-terms/${termijnId}`).set('Cookie', cookie).expect(200)
    expect(na.body.name).toBe('Einde maand plus 30 dagen')
    expect(na.body.endOfMonth).toBe(voor.body.endOfMonth)
    expect(na.body.sort).toBe(voor.body.sort)
    expect(na.body.days).toBe(voor.body.days)
    expect(na.body.isActive).toBe(voor.body.isActive)
  })

  it('weigert een voorwaarde op inactief te zetten die klanten hebben', async () => {
    const res = await api()
      .patch(`/api/payment-terms/${termijnId}`).set('Cookie', cookie)
      .send({ isActive: false }).expect(422)
    expect(res.body.error.message).toContain('1 klant')

    // En de voorwaarde staat nog gewoon aan: de transactie is teruggerold.
    const na = await api().get(`/api/payment-terms/${termijnId}`).set('Cookie', cookie).expect(200)
    expect(na.body.isActive).toBe(true)
  })

  it('weigert een voorwaarde te verwijderen die klanten hebben', async () => {
    const res = await api()
      .delete(`/api/payment-terms/${termijnId}`).set('Cookie', cookie)
      .expect(409)
    expect(res.body.error.message).toContain('kan niet verwijderd worden')
  })

  it('weigert een klant aan een inactieve voorwaarde te koppelen', async () => {
    const uit = await api()
      .post('/api/payment-terms').set('Cookie', cookie)
      .send({ key: `${tag}_uit`, name: 'Niet meer in gebruik', days: 7, isActive: false })
      .expect(201)

    const res = await api()
      .patch(`/api/customers/${klantId}`).set('Cookie', cookie)
      .send({ paymentTermId: uit.body.id }).expect(422)
    expect(res.body.error.message).toContain('staat op inactief')
  })

  it('valt bij een klant zonder eigen voorwaarde terug op de standaard', async () => {
    await api()
      .patch(`/api/customers/${klantId}`).set('Cookie', cookie)
      .send({ paymentTermId: '' }).expect(200)

    const klant = await api().get(`/api/customers/${klantId}`).set('Cookie', cookie).expect(200)
    expect(klant.body.paymentTermId).toBeNull()
    expect(klant.body.paymentTermIsDefault).toBe(true)
    // De naam is die van de standaard: het scherm toont wat er echt geldt.
    expect(klant.body.paymentTermName).not.toBeNull()
  })

  it('verwijdert een voorwaarde die niemand heeft, en weigert de standaard', async () => {
    const los = await api()
      .post('/api/payment-terms').set('Cookie', cookie)
      .send({ key: `${tag}_los`, name: 'Ongebruikt', days: 21 }).expect(201)
    await api().delete(`/api/payment-terms/${los.body.id}`).set('Cookie', cookie).expect(204)

    const lijst = await api().get('/api/payment-terms').set('Cookie', cookie).expect(200)
    const standaard = lijst.body.find((t: { isDefault: boolean }) => t.isDefault)
    const res = await api().delete(`/api/payment-terms/${standaard.id}`).set('Cookie', cookie).expect(422)
    expect(res.body.error.message).toContain('standaard')
  })

  it('geeft de keuzelijst ook aan iemand die alleen klanten mag zien', async () => {
    // Een verkoper kiest een voorwaarde bij een klant, maar beheert de
    // instellingen niet.
    const kijkRecht = await prisma.unscoped.permission.findUniqueOrThrow({ where: { key: 'customers:view' } })
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-verkoop`, name: 'Alleen klanten zien',
        permissions: { create: [{ permissionId: kijkRecht.id }] },
      },
    })
    const email = `${tag}-verkoop@test.local`
    const verkoper = await maakGebruikerMetWachtwoord(app, { email, name: 'Verkoper', password: wachtwoord })
    await prisma.unscoped.userRole.create({ data: { userId: verkoper.id, roleId: rol.id } })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    const verkoopCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    const kies = await api().get('/api/payment-terms/selectable').set('Cookie', verkoopCookie).expect(200)
    expect(kies.body.length).toBeGreaterThan(0)
    expect(kies.body.every((t: { isActive: boolean }) => t.isActive)).toBe(true)

    // De beheerlijst blijft dicht.
    await api().get('/api/payment-terms').set('Cookie', verkoopCookie).expect(403)

    await prisma.unscoped.userRole.deleteMany({ where: { userId: verkoper.id } })
    await prisma.unscoped.session.deleteMany({ where: { userId: verkoper.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: verkoper.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: verkoper.id } })
  })

  it('laat zonder settings-recht niets wijzigen', async () => {
    const ander = `${tag}-zonder@test.local`
    const zonder = await maakGebruikerMetWachtwoord(app, { email: ander, name: 'Zonder recht', password: wachtwoord })
    const login = await api().post('/api/auth/sign-in/email').send({ email: ander, password: wachtwoord }).expect(200)
    const andersCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    await api().get('/api/payment-terms').set('Cookie', andersCookie).expect(403)
    await api()
      .post('/api/payment-terms').set('Cookie', andersCookie)
      .send({ key: `${tag}_nope`, name: 'Mag niet', days: 1 }).expect(403)

    await prisma.unscoped.session.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: zonder.id } })
  })
})
