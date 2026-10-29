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
const { lockQuoteVersion, allowLockedQuoteChanges } = await import('@rgh/db')

/**
 * De offerte als document, tegen de echte database.
 *
 * Wat hier bewezen moet worden: een regel is een bewaarde calculatie, de
 * prijzen staan los van het product zodra ze er staan (harde regel 3), de
 * totalen zijn de optelling van de regels (ADR-0005), en een vastgezette
 * versie wijzigt niet meer (ADR-0007).
 */
describe('offertes', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `off-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let supplierId = ''
  let productId = ''
  let klantId = ''
  let printOptionId = ''
  let regelId = ''
  const gemaakteOffertes: string[] = []

  const api = () => request(app.getHttpServer())

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['quotes:view', 'quotes:create', 'quotes:update'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: 'quotes', action: key.split(':')[1] },
        }),
      ),
    )
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-rol`, name: 'Verkoop',
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

    // De testdatabase is alleen gemigreerd, niet geseed.
    await prisma.unscoped.numberSequence.upsert({
      where: { key_year: { key: 'QUOTE', year: new Date().getFullYear() } },
      update: {},
      create: {
        key: 'QUOTE', year: new Date().getFullYear(),
        format: 'OFF-{year}-{counter:5}', lastValue: 0,
      },
    })
    await prisma.unscoped.vatRate.upsert({
      where: { code: 'NL21' }, update: {},
      create: { code: 'NL21', name: 'Nederland 21%', percentage: 21, isDefault: true },
    })

    supplierId = (await prisma.unscoped.supplier.create({
      data: { code: tag, name: `${tag} Leverancier` },
    })).id
    klantId = (await prisma.unscoped.customer.create({
      data: { number: uniqueNumber(), name: `${tag} Klant` },
    })).id

    const methode = await prisma.unscoped.printMethod.create({
      data: { key: `${tag}-zeefdruk`, name: 'Zeefdruk' },
    })
    const positie = await prisma.unscoped.printPosition.create({
      data: { key: `${tag}-front`, name: 'Voorzijde', sort: 10 },
    })

    const product = await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-1001`,
        name: 'Thermosbeker Offerte',
        suppliers: {
          create: [{
            supplierId, supplierArticleNumber: `S-${tag}`,
            purchasePrice: '5.0000', isPreferred: true,
          }],
        },
        printOptions: {
          create: [{
            printMethodId: methode.id,
            printPositionId: positie.id,
            maxColors: 4,
            setupCost: '30.0000',
            priceTiers: {
              create: [{ colors: 1, minQuantity: 1, unitPrice: '0.5000', setupCost: '30.0000' }],
            },
          }],
        },
      },
      include: { printOptions: true },
    })
    productId = product.id
    printOptionId = product.printOptions[0].id

    regelId = (await prisma.unscoped.priceRule.create({
      data: {
        scope: 'PRODUCT', productId: product.id, marginBasis: 'SALE',
        marginPercent: '40.00', priority: 1000,
      },
    })).id
  }, 60000)

  afterAll(async () => {
    // Offerteversies zijn onveranderlijk zodra ze vastgezet zijn; opruimen
    // vraagt daarom het ontsnappingsluik uit @rgh/db.
    if (gemaakteOffertes.length > 0) {
      await prisma.unscoped.$transaction(async (tx) => {
        await allowLockedQuoteChanges(tx)
        await tx.quote.deleteMany({ where: { id: { in: gemaakteOffertes } } })
      })
    }
    await prisma.unscoped.priceRule.deleteMany({ where: { id: regelId } })
    await prisma.unscoped.productSupplier.deleteMany({ where: { supplierId } })
    await prisma.unscoped.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.unscoped.supplier.deleteMany({ where: { id: supplierId } })
    await prisma.unscoped.printMethod.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.printPosition.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.customer.deleteMany({ where: { id: klantId } })
    await prisma.unscoped.auditLog.deleteMany({ where: { entityId: { in: gemaakteOffertes } } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  async function maakOfferte(body: Record<string, unknown> = {}) {
    const res = await api().post('/api/quotes').set('Cookie', cookie)
      .send({ customerId: klantId, ...body }).expect(201)
    gemaakteOffertes.push(res.body.id)
    return res.body
  }

  it('geeft een nummer uit de reeks en een lege eerste versie', async () => {
    const offerte = await maakOfferte({ reference: 'Kerstpakket 2026' })

    expect(offerte.number).toMatch(new RegExp(`^OFF-${new Date().getFullYear()}-\\d{5}$`))
    expect(offerte.status).toBe('DRAFT')
    expect(offerte.customerName).toContain(tag)
    expect(offerte.currentVersion.versionNumber).toBe(1)
    expect(offerte.currentVersion.lines).toEqual([])
    expect(offerte.currentVersion.totalInclVat).toBe('0.00')
    // De geldigheidsduur komt uit de instellingen; zonder instelling 30 dagen.
    expect(offerte.currentVersion.validUntil).not.toBeNull()
  })

  it('nummert doorlopend', async () => {
    const eerste = await maakOfferte()
    const tweede = await maakOfferte()

    const nummer = (n: string) => Number(n.split('-').at(-1))
    expect(nummer(tweede.number)).toBe(nummer(eerste.number) + 1)
  })

  it('weigert een offerte op een inactieve klant', async () => {
    const inactief = await prisma.unscoped.customer.create({
      data: { number: uniqueNumber(), name: `${tag} Gestopt`, isActive: false },
    })
    try {
      const res = await api().post('/api/quotes').set('Cookie', cookie)
        .send({ customerId: inactief.id }).expect(422)
      expect(res.body.error.message).toContain('inactief')
    } finally {
      await prisma.unscoped.customer.delete({ where: { id: inactief.id } })
    }
  })

  it('weigert een contactpersoon van een andere klant', async () => {
    const andere = await prisma.unscoped.customer.create({
      data: { number: uniqueNumber(), name: `${tag} Ander` },
    })
    const contact = await prisma.unscoped.contactPerson.create({
      data: { customerId: andere.id, firstName: 'Piet', lastName: 'Jansen' },
    })
    try {
      const res = await api().post('/api/quotes').set('Cookie', cookie)
        .send({ customerId: klantId, contactPersonId: contact.id }).expect(422)
      expect(res.body.error.message).toContain('hoort niet bij deze klant')
    } finally {
      await prisma.unscoped.contactPerson.delete({ where: { id: contact.id } })
      await prisma.unscoped.customer.delete({ where: { id: andere.id } })
    }
  })

  describe('regels', () => {
    it('bewaart de calculatie als regel, met de bedrukking erbij', async () => {
      const offerte = await maakOfferte()

      const res = await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({
          productId, quantity: 250,
          printOptionIds: [printOptionId], printColors: [1],
        }).expect(201)

      const regel = res.body.currentVersion.lines[0]
      expect(regel.lineNumber).toBe(1)
      expect(regel.productName).toBe('Thermosbeker Offerte')
      expect(regel.quantity).toBe(250)
      // 40% marge op de verkoopprijs: 5,00 / 0,6 = 8,3333.
      expect(regel.unitSalePrice).toBe('8.3333')
      expect(regel.unitPurchasePrice).toBe('5.0000')
      expect(regel.printJobs).toHaveLength(1)
      expect(regel.printJobs[0].printMethodName).toBe('Zeefdruk')
      expect(regel.printJobs[0].colors).toBe(1)
    })

    it('telt de offertetotalen op uit de regels', async () => {
      const offerte = await maakOfferte()
      await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 100 }).expect(201)
      const res = await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 250 }).expect(201)

      const versie = res.body.currentVersion
      const regels = versie.lines
      expect(regels).toHaveLength(2)

      // Het totaal is de som van de al afgeronde regelbedragen (ADR-0005),
      // niet een nieuwe som vanaf de stuksprijzen.
      const som = regels.reduce((t: number, r: { lineSubtotalExclVat: string }) =>
        t + Number(r.lineSubtotalExclVat), 0)
      expect(Number(versie.subtotalExclVat)).toBeCloseTo(som, 2)
      expect(Number(versie.totalInclVat)).toBeCloseTo(
        Number(versie.subtotalExclVat) + Number(versie.vatAmount), 2,
      )
      expect(versie.marginPercent).toBe('40.00')
    })

    it('laat een latere prijswijziging de offerte met rust', async () => {
      // Harde regel 3: de regel kopieert prijzen bij aanmaak naar eigen
      // kolommen. Zonder dat zou een inkoopprijswijziging met terugwerkende
      // kracht in een uitgebrachte offerte lopen.
      const offerte = await maakOfferte()
      const gemaakt = await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 250 }).expect(201)
      const voor = gemaakt.body.currentVersion.lines[0]

      await prisma.unscoped.productSupplier.updateMany({
        where: { supplierId }, data: { purchasePrice: '9.0000' },
      })
      try {
        const na = await api().get(`/api/quotes/${offerte.id}`).set('Cookie', cookie).expect(200)
        expect(na.body.currentVersion.lines[0].unitPurchasePrice).toBe(voor.unitPurchasePrice)
        expect(na.body.currentVersion.lines[0].unitSalePrice).toBe(voor.unitSalePrice)
      } finally {
        await prisma.unscoped.productSupplier.updateMany({
          where: { supplierId }, data: { purchasePrice: '5.0000' },
        })
      }
    })

    it('prijst voor de klant van de offerte en niet voor een meegestuurde', async () => {
      // Een klantprijsafspraak van deze klant hoort mee te tellen, ook al
      // staat er geen klant in de invoer van de regel.
      const offerte = await maakOfferte()
      const afspraak = await prisma.unscoped.customerPriceAgreement.create({
        data: { customerId: klantId, productId, minQuantity: 1, unitPrice: '6.0000' },
      })
      try {
        const res = await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
          .send({ productId, quantity: 250 }).expect(201)

        expect(res.body.currentVersion.lines[0].unitSalePrice).toBe('6.0000')
      } finally {
        await prisma.unscoped.customerPriceAgreement.delete({ where: { id: afspraak.id } })
      }
    })

    it('haalt een regel eraf en telt opnieuw op', async () => {
      const offerte = await maakOfferte()
      const met = await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 250 }).expect(201)
      const regel = met.body.currentVersion.lines[0]

      const zonder = await api()
        .delete(`/api/quotes/${offerte.id}/lines/${regel.id}`)
        .set('Cookie', cookie).expect(200)

      expect(zonder.body.currentVersion.lines).toEqual([])
      expect(zonder.body.currentVersion.subtotalExclVat).toBe('0.00')
    })

    it('weigert een regel van een andere offerte te verwijderen', async () => {
      const eerste = await maakOfferte()
      const tweede = await maakOfferte()
      const met = await api().post(`/api/quotes/${eerste.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 10 }).expect(201)

      await api()
        .delete(`/api/quotes/${tweede.id}/lines/${met.body.currentVersion.lines[0].id}`)
        .set('Cookie', cookie).expect(404)
    })
  })

  describe('vastgezette versie', () => {
    it('weigert wijzigen met een melding die te plaatsen is', async () => {
      const offerte = await maakOfferte()
      await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 250 }).expect(201)

      await prisma.unscoped.$transaction(async (tx) => {
        await lockQuoteVersion(tx, offerte.currentVersion.id)
      })

      const res = await api().post(`/api/quotes/${offerte.id}/lines`).set('Cookie', cookie)
        .send({ productId, quantity: 100 }).expect(422)

      // De databasetriggers weigeren het ook, maar die melding is voor een
      // gebruiker niet te plaatsen.
      expect(res.body.error.message).toContain('vastgezet')
      expect(res.body.error.message).toContain('nieuwe versie')
    })

    it('toont dat de versie vastgezet is', async () => {
      const offerte = await maakOfferte()
      await prisma.unscoped.$transaction(async (tx) => {
        await lockQuoteVersion(tx, offerte.currentVersion.id)
      })

      const res = await api().get(`/api/quotes/${offerte.id}`).set('Cookie', cookie).expect(200)
      expect(res.body.currentVersion.lockedAt).not.toBeNull()
      expect(res.body.currentVersion.sentAt).not.toBeNull()
    })
  })

  it('laat zonder quotes:create geen offerte aanmaken', async () => {
    const email = `${tag}-kijker@test.local`
    const kijker = await maakGebruikerMetWachtwoord(app, { email, name: 'Kijker', password: wachtwoord })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    const kijkCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    await api().post('/api/quotes').set('Cookie', kijkCookie).send({ customerId: klantId }).expect(403)

    await prisma.unscoped.session.deleteMany({ where: { userId: kijker.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: kijker.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: kijker.id } })
  })
})
