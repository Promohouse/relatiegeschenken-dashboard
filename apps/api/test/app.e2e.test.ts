import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import request from 'supertest'
import type { INestApplication } from '@nestjs/common'
import { Controller, Get, Module } from '@nestjs/common'
import { Test } from '@nestjs/testing'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { AppModule } = await import('../src/app.module')
const { configureApp } = await import('../src/configure-app')
const { ConflictError, NotFoundError } = await import('../src/core/errors/domain-errors')

/** Alleen voor deze test: endpoints die een fout gooien, om de vertaling te zien. */
@Controller('test-fouten')
class FoutController {
  @Get('niet-gevonden')
  nietGevonden(): never {
    throw new NotFoundError('Klant 42 bestaat niet.')
  }

  @Get('conflict')
  conflict(): never {
    throw new ConflictError('Nummer is al uitgegeven.', { veld: 'number' })
  }

  @Get('onveranderlijk')
  onveranderlijk(): never {
    throw new Error(
      '\nInvalid `db.quoteVersion.update()` invocation:\n\n' +
        'Offerteversie abc is vastgezet op 2026-10-28 en kan niet worden gewijzigd (ADR-0007).',
    )
  }

  @Get('onbekend')
  onbekend(): never {
    throw new Error('connect ECONNREFUSED 10.0.0.5:5432 wachtwoord=geheim')
  }
}

@Module({ imports: [AppModule], controllers: [FoutController] })
class TestModule {}

describe('api-fundament', () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [TestModule] }).compile()
    app = moduleRef.createNestApplication()
    configureApp(app)
    await app.init()
  }, 30000)

  afterAll(async () => {
    await app?.close()
  })

  it('start met dependency injection werkend', () => {
    // Faalt dit, dan staat de decorator-metadata in vitest niet goed.
    expect(app).toBeDefined()
  })

  it('geeft de gezondheid terug met een werkende databaseverbinding', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200)
    expect(res.body.status).toBe('ok')
    expect(res.body.database).toBe('ok')
    expect(res.body.environment).toBe('test')
    expect(typeof res.body.demoMode).toBe('boolean')
    expect(res.body.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('zet alles achter het voorvoegsel /api', async () => {
    await request(app.getHttpServer()).get('/health').expect(404)
  })

  it('geeft een onbekende route terug in onze eigen foutvorm', async () => {
    const res = await request(app.getHttpServer()).get('/api/bestaat-niet').expect(404)
    expect(res.body.error.code).toBe('NIET_GEVONDEN')
    expect(res.body.error.requestId).toMatch(/[0-9a-f-]{36}/)
  })

  it('vertaalt een domeinfout naar de juiste status', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-fouten/niet-gevonden').expect(404)
    expect(res.body.error.code).toBe('NIET_GEVONDEN')
    expect(res.body.error.message).toBe('Klant 42 bestaat niet.')
  })

  it('geeft details mee bij een conflict', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-fouten/conflict').expect(409)
    expect(res.body.error.code).toBe('CONFLICT')
    expect(res.body.error.details).toEqual({ veld: 'number' })
  })

  it('laat de melding van een databasetrigger doorkomen als 409', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-fouten/onveranderlijk').expect(409)
    expect(res.body.error.code).toBe('ONVERANDERLIJK')
    expect(res.body.error.message).toContain('vastgezet')
    expect(res.body.error.message).not.toContain('db.quoteVersion.update')
  })

  it('laat bij een onbekende fout niets uit de interne oorzaak zien', async () => {
    const res = await request(app.getHttpServer()).get('/api/test-fouten/onbekend').expect(500)
    expect(res.body.error.code).toBe('INTERNE_FOUT')
    expect(JSON.stringify(res.body)).not.toContain('ECONNREFUSED')
    expect(JSON.stringify(res.body)).not.toContain('geheim')
  })

  it('geeft de respectheader voor een meegegeven request-id terug', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/bestaat-niet')
      .set('x-request-id', 'eigen-id-123')
      .expect(404)
    expect(res.body.error.requestId).toBe('eigen-id-123')
  })

  it('publiceert OpenAPI met de uit Zod gegenereerde schemas', async () => {
    const res = await request(app.getHttpServer()).get('/docs/openapi.json').expect(200)
    expect(res.body.info.title).toBe('Relatiegeschenken Hub API')
    // Het Health-schema komt uit Zod en is dus niet handmatig natypt.
    const health = res.body.components.schemas.Health
    expect(health).toBeDefined()
    expect(Object.keys(health.properties)).toContain('database')
    expect(res.body.paths['/api/health']).toBeDefined()
  })
})
