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

describe('gebruikersbeheer', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `gb-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let beheerRol = ''
  let kijkRol = ''
  const opgeruimd: string[] = []

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['users:view', 'users:create', 'users:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: 'users', action: key.split(':')[1] },
        }),
      ),
    )
    beheerRol = (await prisma.unscoped.role.create({
      data: { key: `${tag}-beheer`, name: 'Testbeheer', permissions: { create: rechten.map((p) => ({ permissionId: p.id })) } },
    })).id
    kijkRol = (await prisma.unscoped.role.create({
      data: {
        key: `${tag}-kijk`, name: 'Alleen kijken',
        permissions: { create: [{ permissionId: rechten[0].id }] },
      },
    })).id

    const email = `${tag}-ik@test.local`
    const ik = await maakGebruikerMetWachtwoord(app, { email, name: 'Testbeheerder', password: wachtwoord })
    ikId = ik.id
    opgeruimd.push(ikId)
    await prisma.unscoped.userRole.create({ data: { userId: ikId, roleId: beheerRol } })

    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')
  }, 60000)

  afterAll(async () => {
    const ids = [...opgeruimd]
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: { in: ids } } })
    await prisma.unscoped.account.deleteMany({ where: { userId: { in: ids } } })
    await prisma.unscoped.session.deleteMany({ where: { userId: { in: ids } } })
    await prisma.unscoped.user.deleteMany({ where: { id: { in: ids } } })
    await prisma.unscoped.role.deleteMany({ where: { id: { in: [beheerRol, kijkRol] } } })
    await app?.close()
  })

  it('toont de rollen met hun rechten', async () => {
    const res = await api().get('/api/roles').set('Cookie', cookie).expect(200)
    const rol = res.body.find((r: { key: string }) => r.key === `${tag}-beheer`)
    expect(rol.permissions).toContain('users:update')
    expect(rol.permissions).toEqual([...rol.permissions].sort())
  })

  let nieuweId = ''

  it('maakt een gebruiker aan met een rol en een beginwachtwoord', async () => {
    const res = await api()
      .post('/api/users').set('Cookie', cookie)
      .send({
        name: 'Nieuwe Collega',
        email: `${tag}-collega@test.local`,
        password: 'beginwachtwoord-2026',
        roleKeys: [`${tag}-kijk`],
      })
      .expect(201)

    nieuweId = res.body.id
    opgeruimd.push(nieuweId)
    expect(res.body.email).toBe(`${tag}-collega@test.local`)
    expect(res.body.roles.map((r: { key: string }) => r.key)).toEqual([`${tag}-kijk`])
    expect(res.body.isActive).toBe(true)
  })

  it('laat die gebruiker meteen inloggen', async () => {
    await api()
      .post('/api/auth/sign-in/email')
      .send({ email: `${tag}-collega@test.local`, password: 'beginwachtwoord-2026' })
      .expect(200)
  })

  it('weigert een tweede gebruiker met hetzelfde e-mailadres', async () => {
    const res = await api()
      .post('/api/users').set('Cookie', cookie)
      .send({ name: 'Dubbel', email: `${tag}-collega@test.local`, password: 'beginwachtwoord-2026' })
      .expect(409)
    expect(res.body.error.message).toContain('bestaat al')
  })

  it('weigert een te kort wachtwoord', async () => {
    const res = await api()
      .post('/api/users').set('Cookie', cookie)
      .send({ name: 'Kort', email: `${tag}-kort@test.local`, password: 'kort' })
      .expect(400)
    expect(JSON.stringify(res.body.error.details)).toContain('12 tekens')
  })

  it('weigert een onbekende rol', async () => {
    const res = await api()
      .post('/api/users').set('Cookie', cookie)
      .send({
        name: 'Onbekende Rol',
        email: `${tag}-x@test.local`,
        password: 'beginwachtwoord-2026',
        roleKeys: ['bestaat-niet'],
      })
      .expect(404)
    expect(res.body.error.message).toContain('bestaat-niet')
    // En er blijft geen half aangemaakte gebruiker achter.
    expect(
      await prisma.unscoped.user.count({ where: { email: `${tag}-x@test.local` } }),
    ).toBe(0)
  })

  it('wijzigt naam en rollen, en legt het verschil vast', async () => {
    const res = await api()
      .patch(`/api/users/${nieuweId}`).set('Cookie', cookie)
      .send({ name: 'Nieuwe Collega-Jansen', roleKeys: [`${tag}-kijk`, `${tag}-beheer`] })
      .expect(200)

    expect(res.body.name).toBe('Nieuwe Collega-Jansen')
    expect(res.body.roles.map((r: { key: string }) => r.key).sort()).toEqual(
      [`${tag}-beheer`, `${tag}-kijk`].sort(),
    )

    const audit = await prisma.unscoped.auditLog.findFirstOrThrow({
      where: { entity: 'User', entityId: nieuweId, action: 'UPDATE' },
      orderBy: { occurredAt: 'desc' },
    })
    expect(Object.keys(audit.diff as object).sort()).toEqual(['name', 'roles'])
  })

  it('laat je jezelf niet op inactief zetten', async () => {
    const res = await api().post(`/api/users/${ikId}/deactivate`).set('Cookie', cookie).expect(422)
    expect(res.body.error.message).toContain('jezelf niet')
  })

  it('zet een andere gebruiker op inactief en weer terug', async () => {
    const uit = await api().post(`/api/users/${nieuweId}/deactivate`).set('Cookie', cookie).expect(200)
    expect(uit.body.isActive).toBe(false)

    const aan = await api().post(`/api/users/${nieuweId}/activate`).set('Cookie', cookie).expect(200)
    expect(aan.body.isActive).toBe(true)
  })

  it('laat niet toe dat de laatste beheerder zijn rechten kwijtraakt', async () => {
    // De collega heeft er net beheerrechten bij gekregen; die eerst weghalen,
    // zodat alleen ikzelf nog beheerder ben.
    await api().patch(`/api/users/${nieuweId}`).set('Cookie', cookie)
      .send({ roleKeys: [`${tag}-kijk`] }).expect(200)

    const res = await api().patch(`/api/users/${ikId}`).set('Cookie', cookie)
      .send({ roleKeys: [] }).expect(422)
    expect(res.body.error.message).toContain('users:update')

    // De wijziging is teruggerold: ik ben nog steeds beheerder.
    const ik = await api().get(`/api/users/${ikId}`).set('Cookie', cookie).expect(200)
    expect(ik.body.roles.map((r: { key: string }) => r.key)).toContain(`${tag}-beheer`)
  })

  it('staat het wel toe zodra iemand anders de beheerrechten heeft', async () => {
    await api().patch(`/api/users/${nieuweId}`).set('Cookie', cookie)
      .send({ roleKeys: [`${tag}-beheer`] }).expect(200)

    await api().patch(`/api/users/${ikId}`).set('Cookie', cookie)
      .send({ roleKeys: [] }).expect(200)

    // Terugzetten, anders faalt de opruiming hieronder op rechten.
    await prisma.unscoped.userRole.create({ data: { userId: ikId, roleId: beheerRol } })
  })

  it('zoekt op naam en e-mailadres', async () => {
    const res = await api().get(`/api/users?search=${tag}-collega`).set('Cookie', cookie).expect(200)
    expect(res.body.items).toHaveLength(1)
    expect(res.body.items[0].id).toBe(nieuweId)
  })
})
