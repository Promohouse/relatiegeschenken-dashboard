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

/**
 * Margeregels: het vastleggen ervan en wat ze met een calculatie doen.
 *
 * Let op het ontbreken van een actieve GLOBAL-regel in deze test. Vitest
 * draait testbestanden parallel en een algemene regel geldt voor elk artikel
 * in de database, dus zou hij de prijstests in andere bestanden omgooien. De
 * werking wordt daarom bewezen op een eigen leverancier en een eigen klant,
 * die precies dezelfde weg door de engine lopen.
 */
describe('margeregels', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `marge-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let supplierId = ''
  let productId = ''
  let klantId = ''
  let printOptionId = ''

  const api = () => request(app.getHttpServer())
  const reken = (body: Record<string, unknown>) =>
    api().post('/api/quotes/calculate').set('Cookie', cookie)
      .send({ productId, quantity: 250, printOptionIds: [printOptionId], printColors: [1], ...body })

  /** De marge op de bedrukking in de uitkomst van een calculatie. */
  const drukmarge = (res: { body: { printPositions: { marginPercent: string }[] } }) =>
    res.body.printPositions[0].marginPercent

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const rechten = await Promise.all(
      ['settings:view', 'settings:update', 'quotes:view'].map((key) =>
        prisma.unscoped.permission.upsert({
          where: { key }, update: {},
          create: { key, module: key.split(':')[0], action: key.split(':')[1] },
        }),
      ),
    )
    const rol = await prisma.unscoped.role.create({
      data: {
        key: `${tag}-rol`, name: 'Beheer',
        permissions: { create: rechten.map((r) => ({ permissionId: r.id })) },
      },
    })
    const email = `${tag}@test.local`
    const ik = await maakGebruikerMetWachtwoord(app, { email, name: 'Tester', password: wachtwoord })
    ikId = ik.id
    await prisma.unscoped.userRole.create({ data: { userId: ikId, roleId: rol.id } })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    cookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    supplierId = (await prisma.unscoped.supplier.create({ data: { code: tag, name: `${tag} Leverancier` } })).id
    klantId = (await prisma.unscoped.customer.create({ data: { number: uniqueNumber(), name: `${tag} Klant` } })).id

    const methode = await prisma.unscoped.printMethod.create({
      data: { key: `${tag}-zeefdruk`, name: 'Zeefdruk' },
    })
    const positie = await prisma.unscoped.printPosition.create({
      data: { key: `${tag}-front`, name: 'Voorzijde', sort: 10 },
    })
    await prisma.unscoped.vatRate.upsert({
      where: { code: 'NL21' }, update: {},
      create: { code: 'NL21', name: 'Nederland 21%', percentage: 21, isDefault: true },
    })

    const product = await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-1001`,
        name: 'Beker met opdruk',
        suppliers: {
          create: [{ supplierId, supplierArticleNumber: `S-${tag}`, purchasePrice: '5.0000', isPreferred: true }],
        },
        printOptions: {
          create: [{
            printMethodId: methode.id,
            printPositionId: positie.id,
            maxColors: 4,
            setupCost: '30.0000',
            priceTiers: { create: [{ colors: 1, minQuantity: 1, unitPrice: '0.5000', setupCost: '30.0000' }] },
          }],
        },
      },
      include: { printOptions: true },
    })
    productId = product.id
    printOptionId = product.printOptions[0].id
  }, 60000)

  afterAll(async () => {
    await prisma.unscoped.priceRule.deleteMany({
      where: { OR: [{ supplierId }, { customerId: klantId }, { productId }] },
    })
    await prisma.unscoped.customerPriceAgreement.deleteMany({ where: { customerId: klantId } })
    await prisma.unscoped.productSupplier.deleteMany({ where: { supplierId } })
    await prisma.unscoped.product.deleteMany({ where: { articleNumber: { startsWith: tag } } })
    await prisma.unscoped.supplier.deleteMany({ where: { id: supplierId } })
    await prisma.unscoped.printMethod.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.printPosition.deleteMany({ where: { key: { startsWith: tag } } })
    await prisma.unscoped.customer.deleteMany({ where: { id: klantId } })
    await prisma.unscoped.userRole.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.account.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.session.deleteMany({ where: { userId: ikId } })
    await prisma.unscoped.user.deleteMany({ where: { id: ikId } })
    await prisma.unscoped.role.deleteMany({ where: { key: { startsWith: tag } } })
    await app?.close()
  })

  describe('vastleggen', () => {
    it('weigert een bereik zonder datgene waar het over gaat', async () => {
      const res = await api().post('/api/price-rules').set('Cookie', cookie)
        .send({ scope: 'CUSTOMER', marginPercent: '40' }).expect(400)
      expect(JSON.stringify(res.body)).toContain('Kies een klant')
    })

    it('weigert 100% marge op de verkoopprijs, maar laat 110% opslag toe', async () => {
      // Honderd procent van de verkoopprijs zou een oneindige prijs zijn. Als
      // opslag op de inkoop is 110% juist de gewoonste zaak; één percentage,
      // twee betekenissen, en precies daarom zegt de regel het nu zelf.
      await api().post('/api/price-rules').set('Cookie', cookie)
        .send({ scope: 'SUPPLIER', supplierId, marginBasis: 'SALE', marginPercent: '100' })
        .expect(400)

      const opslag = await api().post('/api/price-rules').set('Cookie', cookie)
        .send({ scope: 'SUPPLIER', supplierId, marginBasis: 'COST', marginPercent: '110' })
        .expect(201)
      // 110% opslag op de inkoop is 52,38% van de verkoopprijs. Die
      // omrekening staat in de uitkomst, zodat niemand hem zelf hoeft te doen.
      expect(opslag.body.saleMarginPercent).toBe('52.38')
      await prisma.unscoped.priceRule.deleteMany({ where: { id: opslag.body.id } })
    })

    it('weigert een doel dat niet bestaat', async () => {
      const res = await api().post('/api/price-rules').set('Cookie', cookie)
        .send({ scope: 'CUSTOMER', customerId: randomUUID(), marginPercent: '40' }).expect(422)
      expect(res.body.error.message).toContain('bestaat niet')
    })

    it('legt een standaardregel vast met een geldigheidsvenster', async () => {
      // Bewust vooruit gezet: zo verstoort hij geen enkele andere test, en
      // het laat meteen zien dat een actieve regel toch niet hoeft te gelden.
      const volgendJaar = new Date(Date.UTC(new Date().getUTCFullYear() + 1, 0, 1))
      const res = await api().post('/api/price-rules').set('Cookie', cookie)
        .send({
          scope: 'GLOBAL', marginBasis: 'SALE', marginPercent: '42,50', printMarginPercent: '60',
          validFrom: volgendJaar.toISOString(), note: `${tag} standaard`,
        }).expect(201)

      expect(res.body.scope).toBe('GLOBAL')
      expect(res.body.targetName).toBeNull()
      expect(res.body.marginPercent).toBe('42.5')
      expect(res.body.printMarginPercent).toBe('60')
      expect(res.body.marginBasis).toBe('SALE')
      // Al een marge op de verkoopprijs: dan is er niets om te rekenen.
      expect(res.body.saleMarginPercent).toBe('42.50')
      expect(res.body.isActive).toBe(true)
      // Actief, maar nog niet van kracht. Dat verschil moet zichtbaar zijn.
      expect(res.body.appliesToday).toBe(false)

      await prisma.unscoped.priceRule.deleteMany({ where: { id: res.body.id } })
    })

    it('zet een regel op inactief in plaats van hem te verwijderen', async () => {
      const gemaakt = await api().post('/api/price-rules').set('Cookie', cookie)
        .send({ scope: 'SUPPLIER', supplierId, marginPercent: '30' }).expect(201)

      const uit = await api().patch(`/api/price-rules/${gemaakt.body.id}/deactivate`)
        .set('Cookie', cookie).expect(200)
      expect(uit.body.isActive).toBe(false)
      expect(uit.body.appliesToday).toBe(false)

      // Hij bestaat nog: een prijs van gisteren moet navraagbaar blijven.
      expect(await prisma.unscoped.priceRule.findUnique({ where: { id: gemaakt.body.id } })).not.toBeNull()
      await prisma.unscoped.priceRule.deleteMany({ where: { id: gemaakt.body.id } })
    })

    it('laat een wijziging van alleen de marge de rest met rust', async () => {
      const gemaakt = await api().post('/api/price-rules').set('Cookie', cookie)
        .send({
          scope: 'SUPPLIER', supplierId, marginBasis: 'SALE',
          marginPercent: '30', priority: 7, isActive: true,
        })
        .expect(201)

      const gewijzigd = await api().patch(`/api/price-rules/${gemaakt.body.id}`)
        .set('Cookie', cookie).send({ marginPercent: '35' }).expect(200)

      // Zonder handgeschreven wijzigingsschema zou `.default()` priority op
      // 100 terugzetten; dat is het lek dat bij de betalingsvoorwaarden zat.
      expect(gewijzigd.body.marginPercent).toBe('35')
      expect(gewijzigd.body.priority).toBe(7)
      expect(gewijzigd.body.isActive).toBe(true)

      await prisma.unscoped.priceRule.deleteMany({ where: { id: gemaakt.body.id } })
    })

    it('laat zonder settings:update niet wijzigen', async () => {
      const email = `${tag}-zonder@test.local`
      const zonder = await maakGebruikerMetWachtwoord(app, { email, name: 'Zonder', password: wachtwoord })
      const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
      const andersCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
        .map((c) => c.split(';')[0]).join('; ')

      await api().post('/api/price-rules').set('Cookie', andersCookie)
        .send({ scope: 'SUPPLIER', supplierId, marginPercent: '30' }).expect(403)
      await api().get('/api/price-rules').set('Cookie', andersCookie).expect(403)

      await prisma.unscoped.session.deleteMany({ where: { userId: zonder.id } })
      await prisma.unscoped.account.deleteMany({ where: { userId: zonder.id } })
      await prisma.unscoped.user.deleteMany({ where: { id: zonder.id } })
    })
  })

  describe('werking in de calculatie', () => {
    let leveranciersregel = ''

    beforeAll(async () => {
      // De regel die hier de rol van "standaardmarge" speelt. Een echte
      // GLOBAL-regel zou parallelle tests omgooien; de weg door de engine is
      // dezelfde.
      leveranciersregel = (await prisma.unscoped.priceRule.create({
        data: {
          scope: 'SUPPLIER', supplierId, marginBasis: 'SALE',
          marginPercent: '40.00', printMarginPercent: '60.00', priority: 1000,
        },
      })).id
    })

    afterAll(async () => {
      await prisma.unscoped.priceRule.deleteMany({ where: { id: leveranciersregel } })
    })

    it('rekent met de ingestelde marge op het artikel', async () => {
      const res = await reken({}).expect(200)
      // 40% marge op de verkoopprijs: 5,00 / (1 - 0,40) = 8,3333.
      expect(res.body.unitSalePrice).toBe('8.3333')
      expect(res.body.unitPurchasePrice).toBe('5.0000')
      // De marge op de regel is hoger dan 40%, want het drukwerk draagt hier
      // 60%. Regelmarge en artikelmarge zijn niet hetzelfde getal zodra er
      // bedrukking bij komt; daar is dit veld de optelsom van.
      expect(Number(res.body.marginPercent)).toBeGreaterThan(40)
    })

    it('rekent de bedrukking met de ingestelde drukmarge, niet met die van het artikel', async () => {
      const res = await reken({}).expect(200)
      // 60% op het drukwerk, naast 40% op het artikel: dat is precies wat
      // zonder dit veld niet apart in te stellen was.
      expect(drukmarge(res)).toBe('60.00')
      // 0,50 / (1 - 0,60) = 1,25 per stuk, instelkosten 30 / 0,40 = 75.
      expect(res.body.printPositions[0].unitSalePrice).toBe('1.2500')
      expect(res.body.printPositions[0].setupSaleCost).toBe('75.0000')
    })

    it('laat een klantregel voorgaan op de algemene regel', async () => {
      const klantregel = await prisma.unscoped.priceRule.create({
        data: {
          scope: 'CUSTOMER', customerId: klantId, marginBasis: 'SALE',
          marginPercent: '25.00', priority: 500,
        },
      })
      try {
        const res = await reken({ customerId: klantId }).expect(200)
        // 5,00 / (1 - 0,25) = 6,6667.
        expect(res.body.unitSalePrice).toBe('6.6667')

        // En dit is de afspraak die hier gemaakt is: een klantregel die niets
        // over drukwerk zegt haalt de algemene drukmarge niet weg. Anders zou
        // het instellen van een klantkorting stilletjes het drukwerk raken.
        expect(drukmarge(res)).toBe('60.00')
      } finally {
        await prisma.unscoped.priceRule.deleteMany({ where: { id: klantregel.id } })
      }
    })

    it('laat een klantregel ook een eigen drukmarge zetten', async () => {
      const klantregel = await prisma.unscoped.priceRule.create({
        data: {
          scope: 'CUSTOMER', customerId: klantId, marginBasis: 'SALE',
          marginPercent: '25.00', printMarginPercent: '35.00', priority: 500,
        },
      })
      try {
        const res = await reken({ customerId: klantId }).expect(200)
        expect(drukmarge(res)).toBe('35.00')
      } finally {
        await prisma.unscoped.priceRule.deleteMany({ where: { id: klantregel.id } })
      }
    })

    it('laat een klantprijsafspraak de drukmarge met rust', async () => {
      // Een afspraak gaat over wat een stuk kost, niet over wat bedrukken
      // kost. Zonder deze scheiding zou het drukwerk de marge van de
      // afspraak volgen en dus bijna niets opleveren.
      const afspraak = await prisma.unscoped.customerPriceAgreement.create({
        data: { customerId: klantId, productId, minQuantity: 100, unitPrice: '5.5000' },
      })
      try {
        const res = await reken({ customerId: klantId }).expect(200)
        expect(res.body.priceOrigin).toBe('AGREEMENT')
        // Op het artikel levert de afspraak maar 9,09% op (5,50 op 5,00)...
        expect(res.body.unitSalePrice).toBe('5.5000')
        // ...en juist daarom mag het drukwerk die marge niet overnemen.
        expect(drukmarge(res)).toBe('60.00')
      } finally {
        await prisma.unscoped.customerPriceAgreement.deleteMany({ where: { id: afspraak.id } })
      }
    })

    it('laat een handmatige drukmarge voorgaan op de ingestelde', async () => {
      const res = await reken({ printMarginPercent: '10' }).expect(200)
      expect(drukmarge(res)).toBe('10.00')
    })

    it('rekent een drukmarge op inkoopbasis om naar de verkoopprijs', async () => {
      // 110% opslag op de inkoop is 52,38% van de verkoopprijs. Het drukwerk
      // rekent altijd met dat laatste, dus moet de omrekening hier gebeuren
      // en niet in het scherm.
      const opInkoop = await prisma.unscoped.priceRule.create({
        data: {
          scope: 'PRODUCT', productId, marginBasis: 'COST',
          marginPercent: '110.00', printMarginPercent: '110.00', priority: 1,
        },
      })
      try {
        const res = await reken({}).expect(200)
        expect(res.body.unitSalePrice).toBe('10.5000')
        expect(drukmarge(res)).toBe('52.38')
      } finally {
        await prisma.unscoped.priceRule.deleteMany({ where: { id: opInkoop.id } })
      }
    })

    it('volgt het artikel als geen enkele regel iets over drukwerk zegt', async () => {
      const zonder = await prisma.unscoped.priceRule.update({
        where: { id: leveranciersregel }, data: { printMarginPercent: null },
      })
      try {
        const res = await reken({}).expect(200)
        expect(drukmarge(res)).toBe('40.00')
      } finally {
        await prisma.unscoped.priceRule.update({
          where: { id: zonder.id }, data: { printMarginPercent: '60.00' },
        })
      }
    })
  })
})
