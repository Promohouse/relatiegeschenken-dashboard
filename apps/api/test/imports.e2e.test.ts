import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { Test } from '@nestjs/testing'
import { maakGebruikerMetWachtwoord } from './helpers'
import { PRODUCT_ANTWOORD } from './fixtures/midocean'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { PrismaService } = await import('../src/core/prisma/prisma.service')
const { CredentialsService } = await import('../src/core/connectors/credentials.service')
const { MidoceanConnector } = await import('../src/core/connectors/midocean/midocean.connector')
const { ConnectorRegistry } = await import('../src/core/connectors/connector.registry')

/**
 * De importpijplijn tegen de echte database, met een gestubde midocean.
 *
 * Wat hier bewezen moet worden: een proefimport schrijft niets, een echte
 * import legt de ruwe data vast, ongewijzigde data levert geen werk op, en
 * een artikel dat uit de bron verdwijnt wordt nooit verwijderd.
 */
describe('importpijplijn', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `imp-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let supplierId = ''
  let connectionId = ''
  const verbinding = `${tag}-midocean`

  /** Wat de gestubde midocean teruggeeft; per test aan te passen. */
  let antwoord: unknown = PRODUCT_ANTWOORD

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const stub = new MidoceanConnector(async () => ({
      ok: true, status: 200, statusText: 'stub',
      json: async () => antwoord,
    }) as Response)

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(MidoceanConnector)
      .useValue(stub)
      .compile()

    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['imports:view', 'imports:create'].map((key) =>
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
      data: { code: tag, name: `${tag} midocean` },
    })).id

    const credentials = new Uint8Array(app.get(CredentialsService).encrypt({ apiKey: 'test-sleutel' }))
    connectionId = (await prisma.unscoped.supplierConnection.create({
      data: {
        supplierId,
        key: verbinding,
        connectorKey: 'midocean-api',
        transport: 'REST',
        config: { environment: 'test', language: 'nl' },
        credentials,
        isActive: true,
        capabilities: { create: [{ capability: 'CATALOG', priority: 10 }] },
      },
    })).id
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.supplierConnection.deleteMany({ where: { supplierId } })
    await prisma.unscoped.productSupplier.deleteMany({ where: { supplierId } })
    await prisma.unscoped.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.unscoped.supplier.deleteMany({ where: { id: supplierId } })
    await prisma.unscoped.auditLog.deleteMany({ where: { entity: 'ImportRun' } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  const start = (body: Record<string, unknown>) =>
    api().post('/api/imports/run').set('Cookie', cookie).send({ connectionKey: verbinding, capability: 'CATALOG', ...body })

  it('toont de koppeling met wat er aan code voor bestaat', async () => {
    const res = await api().get('/api/imports/connections').set('Cookie', cookie).expect(200)
    const mijn = res.body.find((c: { key: string }) => c.key === verbinding)

    expect(mijn.hasCredentials).toBe(true)
    expect(mijn.environment).toBe('test')
    expect(mijn.capabilities).toEqual([
      { capability: 'CATALOG', isEnabled: true, schedule: null, hasConnector: true },
    ])
  })

  it('heeft geen enkele connector die kan bestellen', async () => {
    // De harde grens uit ADR-0013 en regel 13: bestellen gaat buiten het
    // platform om. Geen vlag, geen uitgeschakelde functie - er is simpelweg
    // geen code die het kan. Deze test valt om zodra iemand dat verandert.
    const registry = app.get(ConnectorRegistry)
    for (const connector of registry.list()) {
      expect(connector.capabilities).not.toContain('PLACE_ORDER')
      expect(connector.capabilities).not.toContain('ORDER_STATUS')
    }
  })

  let proefRun = ''

  it('schrijft bij een proefimport niets weg', async () => {
    const res = await start({ dryRun: true }).expect(201)
    proefRun = res.body.importRunId

    expect(res.body.dryRun).toBe(true)
    expect(res.body.status).toBe('SUCCESS')
    expect(res.body.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0, missing: 0 })

    // Geen ruwe rij: anders zou een tweede proefimport niets meer melden.
    expect(await prisma.unscoped.rawSupplierProduct.count({ where: { connectionId } })).toBe(0)
    // En zeker geen product.
    expect(await prisma.unscoped.product.count({ where: { articleNumber: 'AR1804' } })).toBe(0)
  })

  it('toont per artikel wat er zou veranderen', async () => {
    const res = await api().get(`/api/imports/runs/${proefRun}/changes`).set('Cookie', cookie).expect(200)

    expect(res.body).toHaveLength(1)
    const wijziging = res.body[0]
    expect(wijziging).toMatchObject({ changeType: 'CREATE', externalId: 'AR1804', status: 'PENDING' })
    expect(wijziging.diff.name).toEqual({ van: null, naar: 'ARCONOT' })
    expect(wijziging.diff.material).toEqual({ van: null, naar: 'PU' })
    expect(wijziging.diff.varianten.naar).toEqual(['AR1804-03', 'AR1804-06'])
  })

  it('geeft dezelfde uitkomst bij een tweede proefimport', async () => {
    // Zou de proefimport de ruwe data wegschrijven, dan was dit "unchanged".
    const res = await start({ dryRun: true }).expect(201)
    expect(res.body.summary).toMatchObject({ created: 1, unchanged: 0 })
  })

  it('legt bij een echte import de ruwe data vast', async () => {
    const res = await start({ dryRun: false }).expect(201)
    expect(res.body.dryRun).toBe(false)
    expect(res.body.summary).toMatchObject({ created: 1 })

    const rauw = await prisma.unscoped.rawSupplierProduct.findMany({ where: { connectionId } })
    expect(rauw).toHaveLength(1)
    expect(rauw[0].externalId).toBe('AR1804')
    expect(rauw[0].hash).toHaveLength(64)

    // De catalogus is nog steeds niet aangeraakt: dat gebeurt pas na
    // beoordeling van de voorgestelde wijzigingen (ADR-0004).
    expect(await prisma.unscoped.product.count({ where: { articleNumber: 'AR1804' } })).toBe(0)

    const verbindingNa = await prisma.unscoped.supplierConnection.findUniqueOrThrow({ where: { id: connectionId } })
    expect(verbindingNa.lastRunAt).not.toBeNull()
  })

  it('blijft het verschil melden zolang het niet is toegepast', async () => {
    // Een gelijke hash betekent alleen dat de leverancier niets wijzigde. Het
    // product bestaat bij ons nog niet, dus het voorstel blijft staan.
    const res = await start({ dryRun: false }).expect(201)
    expect(res.body.summary).toMatchObject({ created: 1, updated: 0, unchanged: 0 })
  })

  it('ziet een wijziging in de brondata wel', async () => {
    antwoord = [{ ...PRODUCT_ANTWOORD[0], product_name: 'ARCONOT GEWIJZIGD' }]
    try {
      const res = await start({ dryRun: true }).expect(201)
      expect(res.body.summary).toMatchObject({ created: 1, unchanged: 0 })
    } finally {
      antwoord = PRODUCT_ANTWOORD
    }
  })

  describe('met het product al in de catalogus', () => {
    let productId = ''

    beforeAll(async () => {
      productId = (await prisma.unscoped.product.create({
        data: {
          articleNumber: `${tag}-AR1804`,
          name: 'Oude naam',
          material: 'PU',
          suppliers: {
            create: [{ supplierId, supplierArticleNumber: 'AR1804', purchasePrice: '1.0000' }],
          },
          variants: { create: [{ sku: `${tag}-AR1804-03` }] },
        },
      })).id
    })

    it('stelt alleen de velden voor die werkelijk verschillen', async () => {
      // Het artikel is nu pas aan een product gekoppeld; de brondata is sinds
      // de vorige import niet gewijzigd. Zonder de koppelingscontrole zou de
      // hash dit overslaan en zou deze wijziging nooit voorgesteld worden.
      const res = await start({ dryRun: true }).expect(201)
      expect(res.body.summary).toMatchObject({ created: 0, updated: 1, missing: 0 })

      const changes = await api()
        .get(`/api/imports/runs/${res.body.importRunId}/changes`).set('Cookie', cookie).expect(200)
      const diff = changes.body[0].diff

      expect(changes.body[0]).toMatchObject({ changeType: 'UPDATE', entityId: productId })
      expect(diff.name).toEqual({ van: 'Oude naam', naar: 'ARCONOT' })
      // Materiaal was al PU en staat er dus niet bij.
      expect(diff.material).toBeUndefined()
      expect(diff.varianten.naar).toEqual(['AR1804-03', 'AR1804-06'])
      expect(diff.varianten.van).toEqual([`${tag}-AR1804-03`])
    })

    it('stelt voor een verdwenen artikel inactief voor, en verwijdert nooit', async () => {
      const verdwenen = await prisma.unscoped.product.create({
        data: {
          articleNumber: `${tag}-OUD123`,
          name: 'Uit de collectie',
          suppliers: {
            create: [{ supplierId, supplierArticleNumber: 'OUD123', purchasePrice: '1.0000' }],
          },
        },
      })

      const res = await start({ dryRun: true }).expect(201)
      expect(res.body.summary.missing).toBe(1)

      const changes = await api()
        .get(`/api/imports/runs/${res.body.importRunId}/changes`).set('Cookie', cookie).expect(200)
      const voorstel = changes.body.find((c: { externalId: string }) => c.externalId === 'OUD123')

      expect(voorstel.diff.isActive).toEqual({ van: true, naar: false })
      expect(voorstel.diff.reden.naar).toContain('verwijdert nooit een product')

      // En het product staat er nog, gewoon actief: een voorstel is geen daad.
      const naLoop = await prisma.unscoped.product.findUnique({ where: { id: verdwenen.id } })
      expect(naLoop?.isActive).toBe(true)
    })
  })

  describe('weigeringen', () => {
    it('weigert een koppeling die niet bestaat', async () => {
      await api()
        .post('/api/imports/run').set('Cookie', cookie)
        .send({ connectionKey: 'bestaat-niet', capability: 'CATALOG' })
        .expect(404)
    })

    it('weigert een capability die uit staat', async () => {
      const cap = await prisma.unscoped.supplierConnectionCapability.create({
        data: { connectionId, capability: 'INVENTORY', isEnabled: false },
      })
      const res = await start({ capability: 'INVENTORY' }).expect(422)
      expect(res.body.error.message).toContain('staat uit')
      await prisma.unscoped.supplierConnectionCapability.delete({ where: { id: cap.id } })
    })

    it('weigert een capability die de koppeling niet heeft', async () => {
      const res = await start({ capability: 'SHIPPING' }).expect(422)
      expect(res.body.error.message).toContain('heeft geen SHIPPING')
    })

    it('weigert een productiesleutel op een niet-productieomgeving', async () => {
      await prisma.unscoped.supplierConnection.update({
        where: { id: connectionId },
        data: { config: { environment: 'production' } },
      })
      try {
        const res = await start({ dryRun: true }).expect(422)
        expect(res.body.error.message).toContain('productieomgeving van de leverancier')
      } finally {
        await prisma.unscoped.supplierConnection.update({
          where: { id: connectionId },
          data: { config: { environment: 'test', language: 'nl' } },
        })
      }
    })

    it('weigert een koppeling die uit staat', async () => {
      await prisma.unscoped.supplierConnection.update({ where: { id: connectionId }, data: { isActive: false } })
      try {
        const res = await start({ dryRun: true }).expect(422)
        expect(res.body.error.message).toContain('staat uit')
      } finally {
        await prisma.unscoped.supplierConnection.update({ where: { id: connectionId }, data: { isActive: true } })
      }
    })

    it('legt een mislukte import vast in plaats van hem stil te laten vallen', async () => {
      await prisma.unscoped.supplierConnection.update({
        where: { id: connectionId }, data: { credentials: null },
      })
      try {
        await start({ dryRun: true }).expect(422)
        const runs = await api().get('/api/imports/runs').set('Cookie', cookie).expect(200)
        const laatste = runs.body[0]
        expect(laatste.status).toBe('FAILED')
        expect(laatste.errorSummary).toContain('geen credentials opgeslagen')
      } finally {
        const credentials = new Uint8Array(app.get(CredentialsService).encrypt({ apiKey: 'test-sleutel' }))
        await prisma.unscoped.supplierConnection.update({
          where: { id: connectionId }, data: { credentials },
        })
      }
    })

    it('laat zonder imports-recht niets starten', async () => {
      const email = `${tag}-zonder@test.local`
      const zonder = await maakGebruikerMetWachtwoord(app, { email, name: 'Zonder', password: wachtwoord })
      const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
      const andersCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
        .map((c) => c.split(';')[0]).join('; ')

      await api()
        .post('/api/imports/run').set('Cookie', andersCookie)
        .send({ connectionKey: verbinding, capability: 'CATALOG' }).expect(403)
      await api().get('/api/imports/runs').set('Cookie', andersCookie).expect(403)

      await prisma.unscoped.session.deleteMany({ where: { userId: zonder.id } })
      await prisma.unscoped.account.deleteMany({ where: { userId: zonder.id } })
      await prisma.unscoped.user.deleteMany({ where: { id: zonder.id } })
    })
  })
})
