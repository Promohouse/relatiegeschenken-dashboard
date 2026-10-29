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

describe('tekstsjablonen', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `tpl-${randomUUID().slice(0, 8)}`
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

    await prisma.unscoped.documentTemplate.create({
      data: {
        key: `${tag}-intro`,
        kind: 'QUOTE_INTRO',
        name: 'Testinleiding',
        body: 'Beste {{contact.naam}}, hierbij offerte {{offerte.nummer}}.',
        isSystem: false,
      },
    })
    await prisma.unscoped.documentTemplate.create({
      data: {
        key: `${tag}-regel`,
        kind: 'QUOTE_LINE',
        name: 'Testregel',
        body: '{{product.naam}} ({{product.artikelnummer}})',
        isSystem: false,
      },
    })
  }, 60000)

  afterAll(async () => {
    const ids = (await prisma.unscoped.documentTemplate.findMany({
      where: { key: { startsWith: tag } }, select: { id: true },
    })).map((t) => t.id)
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await prisma.unscoped.documentTemplate.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  it('geeft per sjabloon de velden die erin mogen', async () => {
    const res = await api().get(`/api/templates/${tag}-intro`).set('Cookie', cookie).expect(200)

    const namen = res.body.variables.map((v: { naam: string }) => v.naam)
    expect(namen).toContain('offerte.nummer')
    expect(namen).toContain('contact.aanhef')
    // Productvelden horen bij een regel, niet bij de inleiding.
    expect(namen).not.toContain('product.naam')

    // Elk veld heeft uitleg en een voorbeeld, want het scherm toont ze.
    expect(res.body.variables[0]).toHaveProperty('uitleg')
    expect(res.body.variables[0]).toHaveProperty('voorbeeld')
  })

  it('toont hoe de tekst eruitziet met voorbeeldwaarden', async () => {
    const res = await api().get(`/api/templates/${tag}-intro`).set('Cookie', cookie).expect(200)
    expect(res.body.preview.body).toBe('Beste Erik Groothedde, hierbij offerte OFF-2026-00042.')
    expect(res.body.preview.body).not.toContain('{{')
  })

  it('kent de productvelden bij een regelsjabloon', async () => {
    const res = await api().get(`/api/templates/${tag}-regel`).set('Cookie', cookie).expect(200)
    expect(res.body.preview.body).toBe('BASICS (AR1253)')
  })

  it('slaat een gewijzigde tekst op', async () => {
    const res = await api()
      .patch(`/api/templates/${tag}-intro`).set('Cookie', cookie)
      .send({
        name: 'Testinleiding',
        body: 'Hallo {{contact.naam}} van {{klant.naam}}, offerte {{offerte.nummer}}.',
      })
      .expect(200)

    expect(res.body.preview.body).toContain('Bouwgroep Nederland BV')
  })

  it('weigert een veld dat niet bestaat, met de naam erbij', async () => {
    // Dit is het hele punt van de controle: een typefout hoort hier op te
    // vallen en niet op de offerte van een klant.
    const res = await api()
      .patch(`/api/templates/${tag}-intro`).set('Cookie', cookie)
      .send({ name: 'Testinleiding', body: 'Beste {{klnat.naam}},' })
      .expect(400)

    expect(res.body.error.details[0].veld).toBe('body')
    expect(res.body.error.details[0].melding).toContain('{{klnat.naam}}')
  })

  it('weigert een veld dat bij een ander soort sjabloon hoort', async () => {
    const res = await api()
      .patch(`/api/templates/${tag}-intro`).set('Cookie', cookie)
      .send({ name: 'Testinleiding', body: 'Over {{product.naam}}' })
      .expect(400)
    expect(res.body.error.details[0].melding).toContain('{{product.naam}}')
  })

  it('controleert ook het onderwerp van een e-mail', async () => {
    const mail = await prisma.unscoped.documentTemplate.create({
      data: {
        key: `${tag}-mail`, kind: 'QUOTE_EMAIL', name: 'Testmail',
        subject: 'Offerte {{offerte.nummer}}', body: 'Tekst', isSystem: false,
      },
    })
    const res = await api()
      .patch(`/api/templates/${tag}-mail`).set('Cookie', cookie)
      .send({ name: 'Testmail', subject: 'Offerte {{bestaat.niet}}', body: 'Tekst' })
      .expect(400)
    expect(res.body.error.details[0].veld).toBe('subject')

    await prisma.unscoped.documentTemplate.delete({ where: { id: mail.id } })
  })

  it('legt een wijziging in het auditlog vast', async () => {
    await api()
      .patch(`/api/templates/${tag}-regel`).set('Cookie', cookie)
      .send({ name: 'Testregel', body: '{{product.naam}} in {{product.kleur}}' })
      .expect(200)

    const sjabloon = await prisma.unscoped.documentTemplate.findUniqueOrThrow({
      where: { key: `${tag}-regel` },
    })
    const regel = await prisma.unscoped.auditLog.findFirst({
      where: { entity: 'DocumentTemplate', entityId: sjabloon.id },
      orderBy: { occurredAt: 'desc' },
    })
    const diff = regel?.diff as Record<string, { van: unknown; naar: unknown }> | null
    expect(Object.keys(diff ?? {})).toContain('body')
    expect(regel?.userId).toBe(ikId)
  })

  it('laat zonder settings-recht niets wijzigen', async () => {
    const email = `${tag}-zonder@test.local`
    const zonder = await maakGebruikerMetWachtwoord(app, { email, name: 'Zonder', password: wachtwoord })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    const andersCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    await api().get('/api/templates').set('Cookie', andersCookie).expect(403)
    await api()
      .patch(`/api/templates/${tag}-intro`).set('Cookie', andersCookie)
      .send({ name: 'x', body: 'y' }).expect(403)

    await prisma.unscoped.session.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: zonder.id } })
  })
})
