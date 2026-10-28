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

describe('klanten', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `klant-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'

  let beheerderCookie = ''
  let kijkerCookie = ''
  const opgeruimd: string[] = []
  let rolId = ''
  let leesRolId = ''

  async function inloggen(email: string): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password: wachtwoord })
      .expect(200)
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? []
    return cookies.map((c) => c.split(';')[0]).join('; ')
  }

  async function maakGebruiker(email: string, roleId: string) {
    await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password: wachtwoord, name: 'Testgebruiker' })
    const user = await prisma.unscoped.user.findUniqueOrThrow({ where: { email } })
    await prisma.unscoped.userRole.create({ data: { userId: user.id, roleId } })
    opgeruimd.push(user.id)
    return user.id
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    // Een omgeving zonder nummerreeks kan geen klantnummer uitgeven; de
    // service weigert dan terecht. Hier zetten we hem klaar.
    await prisma.unscoped.numberSequence.upsert({
      where: { key_year: { key: 'CUSTOMER', year: 0 } },
      update: {},
      create: { key: 'CUSTOMER', year: 0, format: '{counter:5}', lastValue: 10000 },
    })

    const rechten = await Promise.all(
      ['customers:view', 'customers:create', 'customers:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key },
          update: {},
          create: { key, module: 'customers', action: key.split(':')[1] },
        }),
      ),
    )

    rolId = (await prisma.unscoped.role.create({
      data: {
        key: `${tag}-beheer`,
        name: 'Testbeheer',
        permissions: { create: rechten.map((p) => ({ permissionId: p.id })) },
      },
    })).id

    leesRolId = (await prisma.unscoped.role.create({
      data: { key: `${tag}-leeg`, name: 'Zonder rechten' },
    })).id

    await maakGebruiker(`${tag}-beheer@test.local`, rolId)
    await maakGebruiker(`${tag}-kijker@test.local`, leesRolId)
    beheerderCookie = await inloggen(`${tag}-beheer@test.local`)
    kijkerCookie = await inloggen(`${tag}-kijker@test.local`)
  }, 60000)

  afterAll(async () => {
    const klanten = await prisma.unscoped.customer.findMany({
      where: { name: { startsWith: tag } }, select: { id: true },
    })
    const ids = klanten.map((k) => k.id)
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await prisma.unscoped.customer.deleteMany({ where: { id: { in: ids } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: { in: opgeruimd } } })
    await prisma.unscoped.user.deleteMany({ where: { id: { in: opgeruimd } } })
    await prisma.unscoped.role.deleteMany({ where: { id: { in: [rolId, leesRolId] } } })
    await app?.close()
  })

  it('weigert zonder inloggen en zonder het juiste recht', async () => {
    await request(app.getHttpServer()).get('/api/customers').expect(401)
    const res = await request(app.getHttpServer())
      .get('/api/customers').set('Cookie', kijkerCookie).expect(403)
    expect(res.body.error.message).toContain('customers:view')
  })

  it('maakt een klant aan en geeft zelf het klantnummer uit', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/customers')
      .set('Cookie', beheerderCookie)
      .send({ name: `${tag} Bouwgroep BV`, vatNumber: 'NL001234567B01', email: 'Inkoop@Voorbeeld.NL' })
      .expect(201)

    expect(res.body.number).toMatch(/^\d{5}$/)
    expect(res.body.name).toBe(`${tag} Bouwgroep BV`)
    // Het e-mailadres is genormaliseerd naar kleine letters.
    expect(res.body.email).toBe('inkoop@voorbeeld.nl')
    expect(res.body.isActive).toBe(true)
    expect(res.body.contacts).toEqual([])

    const audit = await prisma.unscoped.auditLog.findFirstOrThrow({
      where: { entity: 'Customer', entityId: res.body.id, action: 'CREATE' },
    })
    expect(audit.userId).toBeTruthy()
  })

  it('weigert een klant zonder bruikbare naam, met de fout per veld', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/customers').set('Cookie', beheerderCookie)
      .send({ name: 'A' }).expect(400)
    expect(res.body.error.code).toBe('ONGELDIGE_INVOER')
    expect(JSON.stringify(res.body.error.details)).toContain('bedrijfsnaam')
  })

  it('controleert de vorm van een Nederlands btw-nummer', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/customers').set('Cookie', beheerderCookie)
      .send({ name: `${tag} Fout btw`, vatNumber: 'NL12345' }).expect(400)
    expect(JSON.stringify(res.body.error.details)).toContain('NL123456789B01')
  })

  it('laat een buitenlands btw-nummer met rust', async () => {
    await request(app.getHttpServer())
      .post('/api/customers').set('Cookie', beheerderCookie)
      .send({ name: `${tag} Belgische klant`, vatNumber: 'BE0123456789' }).expect(201)
  })

  it('zoekt op naam, nummer en e-mailadres', async () => {
    await request(app.getHttpServer())
      .post('/api/customers').set('Cookie', beheerderCookie)
      .send({ name: `${tag} Zorgcentrum` }).expect(201)

    const opNaam = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag} Zorg`).set('Cookie', beheerderCookie).expect(200)
    expect(opNaam.body.items).toHaveLength(1)
    expect(opNaam.body.items[0].name).toContain('Zorgcentrum')

    const nummer = opNaam.body.items[0].number
    const opNummer = await request(app.getHttpServer())
      .get(`/api/customers?search=${nummer}`).set('Cookie', beheerderCookie).expect(200)
    expect(opNummer.body.items.some((k: { number: string }) => k.number === nummer)).toBe(true)
  })

  it('pagineert en sorteert', async () => {
    const eerste = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag}&pageSize=2&page=1&sort=name&direction=asc`)
      .set('Cookie', beheerderCookie).expect(200)

    expect(eerste.body.items).toHaveLength(2)
    expect(eerste.body.total).toBeGreaterThanOrEqual(3)
    expect(eerste.body.pageCount).toBeGreaterThanOrEqual(2)

    const namen = eerste.body.items.map((k: { name: string }) => k.name)
    expect([...namen].sort()).toEqual(namen)

    const tweede = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag}&pageSize=2&page=2`)
      .set('Cookie', beheerderCookie).expect(200)
    expect(tweede.body.items[0]?.id).not.toBe(eerste.body.items[0].id)
  })

  it('wijzigt gegevens en legt alleen het verschil vast', async () => {
    const lijst = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag} Zorg`).set('Cookie', beheerderCookie)
    const id = lijst.body.items[0].id

    await request(app.getHttpServer())
      .patch(`/api/customers/${id}`).set('Cookie', beheerderCookie)
      .send({ phone: '038 123 4567', notes: 'Belt liever op dinsdag.' }).expect(200)

    const audit = await prisma.unscoped.auditLog.findFirstOrThrow({
      where: { entityId: id, action: 'UPDATE' },
      orderBy: { occurredAt: 'desc' },
    })
    const diff = audit.diff as Record<string, { van: unknown; naar: unknown }>
    expect(Object.keys(diff).sort()).toEqual(['notes', 'phone'])
    expect(diff.phone.naar).toBe('038 123 4567')
  })

  it('zet een klant op inactief in plaats van hem te verwijderen', async () => {
    const lijst = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag} Zorg`).set('Cookie', beheerderCookie)
    const id = lijst.body.items[0].id

    const uit = await request(app.getHttpServer())
      .post(`/api/customers/${id}/deactivate`).set('Cookie', beheerderCookie).expect(200)
    expect(uit.body.isActive).toBe(false)

    // De klant bestaat nog, maar valt buiten het actieve overzicht.
    const actief = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag} Zorg&status=active`).set('Cookie', beheerderCookie)
    expect(actief.body.items).toHaveLength(0)

    const inactief = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag} Zorg&status=inactive`).set('Cookie', beheerderCookie)
    expect(inactief.body.items).toHaveLength(1)

    await request(app.getHttpServer())
      .post(`/api/customers/${id}/activate`).set('Cookie', beheerderCookie).expect(200)
  })

  it('geeft 404 bij een onbekende klant', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/customers/00000000-0000-0000-0000-000000000000')
      .set('Cookie', beheerderCookie).expect(404)
    expect(res.body.error.code).toBe('NIET_GEVONDEN')
  })

  it('weigert wijzigen voor wie alleen mag kijken', async () => {
    await prisma.unscoped.role.update({
      where: { id: leesRolId },
      data: {
        permissions: {
          create: [{ permissionId: (await prisma.unscoped.permission.findUniqueOrThrow({ where: { key: 'customers:view' } })).id }],
        },
      },
    })
    const lijst = await request(app.getHttpServer())
      .get(`/api/customers?search=${tag}`).set('Cookie', kijkerCookie).expect(200)
    expect(lijst.body.items.length).toBeGreaterThan(0)

    await request(app.getHttpServer())
      .patch(`/api/customers/${lijst.body.items[0].id}`)
      .set('Cookie', kijkerCookie).send({ phone: '0612345678' }).expect(403)
  })
})
