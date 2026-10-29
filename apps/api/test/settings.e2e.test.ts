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

describe('bedrijfsgegevens en weergave', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `set-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['settings:view', 'settings:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: 'settings', action: key.split(':')[1] },
        }),
      ),
    )
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-rol`, name: 'Beheer',
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
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.auditLog.deleteMany({ where: { entity: 'Setting', entityId: 'company' } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.setting.deleteMany({ where: { key: { startsWith: 'company.' } } })
    await app?.close()
  })

  const volledig = {
    name: 'Promohouse BV',
    street: 'Weegschaalstraat 5',
    postalCode: '7324 BE',
    city: 'Apeldoorn',
    country: 'Nederland',
    phone: '055 578 88 05',
    email: 'info@promohouse.nl',
    website: 'www.promohouse.nl',
    chamberOfCommerce: '08079411',
    vatNumber: 'NL815249135B01',
    iban: 'NL39 RABO 0172495423',
    slogan: 'verrassend anders',
    logoLight: '/merk/promohouse-donker.png',
    logoDark: '/merk/promohouse-licht.png',
  }

  it('slaat de gegevens op en haalt de spaties uit het IBAN', async () => {
    const res = await api()
      .patch('/api/settings/company').set('Cookie', cookie).send(volledig).expect(200)

    expect(res.body.name).toBe('Promohouse BV')
    // Zonder spaties, zodat een betaalbestand hem kan gebruiken.
    expect(res.body.iban).toBe('NL39RABO0172495423')
    expect(res.body.vatNumber).toBe('NL815249135B01')
  })

  it('laat iedereen die is ingelogd de gegevens lezen', async () => {
    const email = `${tag}-kijker@test.local`
    const kijker = await maakGebruikerMetWachtwoord(app, { email, name: 'Kijker', password: wachtwoord })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    const kijkCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    // Lezen mag: de naam staat in de kop van het scherm en op elk document.
    const res = await api().get('/api/settings/company').set('Cookie', kijkCookie).expect(200)
    expect(res.body.name).toBe('Promohouse BV')
    // Wijzigen niet.
    await api().patch('/api/settings/company').set('Cookie', kijkCookie).send(volledig).expect(403)

    await prisma.unscoped.session.deleteMany({ where: { userId: kijker.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: kijker.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: kijker.id } })
  })

  it('controleert de vorm van een Nederlands btw-nummer en een IBAN', async () => {
    const btw = await api()
      .patch('/api/settings/company').set('Cookie', cookie)
      .send({ ...volledig, vatNumber: 'NL123' }).expect(400)
    expect(btw.body.error.details[0].melding).toContain('NL123456789B01')

    const iban = await api()
      .patch('/api/settings/company').set('Cookie', cookie)
      .send({ ...volledig, iban: 'niet-een-iban' }).expect(400)
    expect(iban.body.error.details[0].veld).toBe('iban')
  })

  it('laat een buitenlands btw-nummer met rust', async () => {
    // Daar zijn te veel varianten van om een fout af te dwingen die er geen is.
    const res = await api()
      .patch('/api/settings/company').set('Cookie', cookie)
      .send({ ...volledig, vatNumber: 'BE0123456789' }).expect(200)
    expect(res.body.vatNumber).toBe('BE0123456789')

    await api().patch('/api/settings/company').set('Cookie', cookie).send(volledig).expect(200)
  })

  it('weigert een lege bedrijfsnaam', async () => {
    const res = await api()
      .patch('/api/settings/company').set('Cookie', cookie)
      .send({ ...volledig, name: '' }).expect(400)
    expect(res.body.error.details[0].melding).toBe('Vul een bedrijfsnaam in')
  })

  it('legt elke wijziging in het auditlog vast, met oud en nieuw', async () => {
    await api()
      .patch('/api/settings/company').set('Cookie', cookie)
      .send({ ...volledig, phone: '055 000 00 00' }).expect(200)

    const regel = await prisma.unscoped.auditLog.findFirst({
      where: { entity: 'Setting', entityId: 'company' },
      orderBy: { occurredAt: 'desc' },
    })
    const diff = regel?.diff as Record<string, { van: unknown; naar: unknown }> | null
    expect(diff?.phone).toEqual({ van: '055 578 88 05', naar: '055 000 00 00' })
    expect(regel?.userId).toBe(ikId)

    await api().patch('/api/settings/company').set('Cookie', cookie).send(volledig).expect(200)
  })
})

describe('themavoorkeur', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `thema-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const email = `${tag}@test.local`
    const ik = await maakGebruikerMetWachtwoord(app, { email, name: 'Tester', password: wachtwoord })
    ikId = ik.id
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await app?.close()
  })

  it('begint op de instelling van het besturingssysteem', async () => {
    const res = await api().get('/api/me').set('Cookie', cookie).expect(200)
    expect(res.body.themePreference).toBe('SYSTEM')
  })

  it('onthoudt de keuze bij de gebruiker, niet in de browser', async () => {
    await api().patch('/api/me/theme').set('Cookie', cookie).send({ theme: 'DARK' }).expect(200)

    // Een nieuwe sessie op een ander apparaat ziet dezelfde keuze.
    const login = await api()
      .post('/api/auth/sign-in/email')
      .send({ email: `${tag}@test.local`, password: wachtwoord })
      .expect(200)
    const anderApparaat = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    const res = await api().get('/api/me').set('Cookie', anderApparaat).expect(200)
    expect(res.body.themePreference).toBe('DARK')
  })

  it('weigert een weergave die niet bestaat', async () => {
    await api().patch('/api/me/theme').set('Cookie', cookie).send({ theme: 'PAARS' }).expect(400)
  })

  it('vraagt om inloggen', async () => {
    await api().patch('/api/me/theme').send({ theme: 'LIGHT' }).expect(401)
  })
})
