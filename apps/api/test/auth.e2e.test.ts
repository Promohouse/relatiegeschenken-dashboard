import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import { Controller, Get, Module, type INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { Public, RequirePermission } = await import('../src/core/auth/auth.decorators')
const { PrismaService } = await import('../src/core/prisma/prisma.service')

@Controller('test-beveiligd')
class BeveiligdController {
  @Get('open')
  @Public()
  open() {
    return { ok: true }
  }

  @Get('met-recht')
  @RequirePermission('customers:view')
  metRecht() {
    return { ok: true }
  }

  @Get('zwaar-recht')
  @RequirePermission('customers:view', 'orders:approve')
  zwaarRecht() {
    return { ok: true }
  }

  /** Bewust zonder declaratie, om te bewijzen dat de guard dichtslaat. */
  @Get('vergeten')
  vergeten() {
    return { ok: true }
  }
}

@Module({ imports: [AppModule], controllers: [BeveiligdController] })
class TestModule {}

describe('authenticatie en rechten', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const email = `auth-${randomUUID()}@test.local`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let userId = ''
  let roleId = ''

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    // Rol met één recht, zodat het verschil tussen mogen en niet mogen te zien is.
    const permissie = await prisma.unscoped.permission.upsert({
      where: { key: 'customers:view' },
      update: {},
      create: { key: 'customers:view', module: 'customers', action: 'view' },
    })
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `test-rol-${randomUUID()}`,
        name: 'Testrol',
        permissions: { create: [{ permissionId: permissie.id }] },
      },
    })
    roleId = rol.id
  }, 40000)

  afterAll(async () => {
    if (userId) {
      await prisma.unscoped.userRole.deleteMany({ where: { userId } })
      await prisma.unscoped.user.deleteMany({ where: { id: userId } })
    }
    await prisma.unscoped.role.deleteMany({ where: { id: roleId } })
    await app?.close()
  })

  it('maakt bij registreren een gebruiker in onze eigen users-tabel', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password: wachtwoord, name: 'Testmedewerker' })

    expect([200, 201]).toContain(res.status)

    const user = await prisma.unscoped.user.findUniqueOrThrow({ where: { email } })
    userId = user.id
    expect(user.name).toBe('Testmedewerker')
    // Eén gebruikerstabel: geen tweede administratie om synchroon te houden.
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(user.twoFactorEnabled).toBe(false)

    // Het wachtwoord staat gehasht bij de inloggegevens, niet bij de gebruiker.
    const account = await prisma.unscoped.account.findFirstOrThrow({ where: { userId: user.id } })
    expect(account.password).toBeTruthy()
    expect(account.password).not.toContain(wachtwoord)
  })

  it('geeft bij inloggen een sessiecookie', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password: wachtwoord })
      .expect(200)

    const cookies = res.headers['set-cookie'] as unknown as string[] | undefined
    expect(cookies?.length).toBeGreaterThan(0)
    cookie = (cookies ?? []).map((c) => c.split(';')[0]).join('; ')
    expect(cookie).toContain('session')
  })

  it('weigert inloggen met een verkeerd wachtwoord', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password: 'dit-is-niet-het-wachtwoord' })
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('laat een publieke route door zonder inloggen', async () => {
    await request(app.getHttpServer()).get('/api/test-beveiligd/open').expect(200)
    await request(app.getHttpServer()).get('/api/health').expect(200)
  })

  it('weigert een beveiligde route zonder sessie', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-beveiligd/met-recht').expect(401)
    expect(res.body.error.code).toBe('NIET_INGELOGD')
  })

  it('weigert een ingelogde gebruiker zonder het vereiste recht', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/test-beveiligd/met-recht')
      .set('Cookie', cookie)
      .expect(403)
    expect(res.body.error.code).toBe('GEEN_RECHTEN')
    expect(res.body.error.message).toContain('customers:view')
  })

  it('laat de route door zodra de rol is toegekend', async () => {
    await prisma.unscoped.userRole.create({ data: { userId, roleId } })
    await request(app.getHttpServer())
      .get('/api/test-beveiligd/met-recht')
      .set('Cookie', cookie)
      .expect(200)
  })

  it('weigert nog steeds als één van meerdere rechten ontbreekt', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/test-beveiligd/zwaar-recht')
      .set('Cookie', cookie)
      .expect(403)
    expect(res.body.error.message).toContain('orders:approve')
  })

  it('slaat dicht bij een route die geen permissie declareert', async () => {
    // Beveiliging vergeten moet opvallen, niet doorglippen.
    const res = await request(app.getHttpServer())
      .get('/api/test-beveiligd/vergeten')
      .set('Cookie', cookie)
      .expect(403)
    expect(res.body.error.message).toContain('@RequirePermission')
  })

  it('weigert een gedeactiveerd account', async () => {
    await prisma.unscoped.user.update({ where: { id: userId }, data: { isActive: false } })
    const res = await request(app.getHttpServer())
      .get('/api/test-beveiligd/met-recht')
      .set('Cookie', cookie)
      .expect(403)
    expect(res.body.error.message).toContain('gedeactiveerd')
    await prisma.unscoped.user.update({ where: { id: userId }, data: { isActive: true } })
  })

  it('weigert een vervalste sessiecookie', async () => {
    await request(app.getHttpServer())
      .get('/api/test-beveiligd/met-recht')
      .set('Cookie', 'better-auth.session_token=verzonnen-token')
      .expect(401)
  })
})
