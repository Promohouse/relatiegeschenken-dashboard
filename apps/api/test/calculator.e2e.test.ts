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
 * De offertecalculator tegen de echte database: staffels, prijsregels,
 * klantafspraken, drukstaffels, btw en voorraad in samenhang.
 */
describe('offertecalculator', () => {
  let app: INestApplication
  let prisma: InstanceType<typeof PrismaService>
  const tag = `calc-${randomUUID().slice(0, 8)}`
  const wachtwoord = 'een-voldoende-lang-wachtwoord'
  let cookie = ''
  let ikId = ''
  let supplierId = ''
  let productId = ''
  let variantId = ''
  let klantId = ''
  let printOptionId = ''
  let regelId = ''

  const api = () => request(app.getHttpServer())
  const reken = (body: Record<string, unknown>) =>
    api().post('/api/quotes/calculate').set('Cookie', cookie).send({ productId, quantity: 250, ...body })

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
    app = moduleRef.createNestApplication({ bodyParser: false })
    configureApp(app)
    await app.init()
    prisma = app.get(PrismaService)

    const recht = await prisma.unscoped.permission.upsert({
      where: { key: 'quotes:view' }, update: {},
      create: { key: 'quotes:view', module: 'quotes', action: 'view' },
    })
    const rol = await prisma.unscoped.role.create({
      data: { key: `${tag}-rol`, name: 'Verkoop', permissions: { create: [{ permissionId: recht.id }] } },
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

    // De testdatabase is alleen gemigreerd, niet geseed: basisgegevens die de
    // calculator nodig heeft maken we hier zelf aan.
    const methode = await prisma.unscoped.printMethod.create({
      data: { key: `${tag}-zeefdruk`, name: 'Zeefdruk' },
    })
    const positie = await prisma.unscoped.printPosition.create({
      data: { key: `${tag}-front`, name: 'Voorzijde', sort: 10 },
    })
    // Het standaardtarief is referentiedata; idempotent, dus geen opruimen.
    await prisma.unscoped.vatRate.upsert({
      where: { code: 'NL21' }, update: {},
      create: { code: 'NL21', name: 'Nederland 21%', percentage: 21, isDefault: true },
    })

    const product = await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-1001`,
        name: 'Thermosbeker Calc',
        variants: { create: [{ sku: `${tag}-1001-03`, colorName: 'zwart' }] },
        suppliers: {
          create: [{
            supplierId,
            supplierArticleNumber: `S-${tag}`,
            purchasePrice: '4.8500',
            isPreferred: true,
            purchaseTiers: {
              create: [
                { minQuantity: 1, unitPrice: '4.8500' },
                { minQuantity: 250, unitPrice: '4.3165' },
                { minQuantity: 1000, unitPrice: '4.0000' },
              ],
            },
          }],
        },
        printOptions: {
          create: [{
            printMethodId: methode.id,
            printPositionId: positie.id,
            maxColors: 4,
            setupCost: '25.0000',
            priceTiers: {
              create: [
                { colors: 1, minQuantity: 1, unitPrice: '0.7000', setupCost: '31.5000' },
                { colors: 1, minQuantity: 250, unitPrice: '0.4400', setupCost: '31.5000' },
                { colors: 2, minQuantity: 250, unitPrice: '0.6600', setupCost: '45.0000' },
              ],
            },
          }],
        },
      },
      include: { variants: true, printOptions: true },
    })
    productId = product.id
    variantId = product.variants[0].id
    printOptionId = product.printOptions[0].id

    // Een margeregel van 110% op dit ene product, en bewust niet GLOBAL:
    // een algemene regel geldt voor elk artikel in de database en verstoort
    // dan tests die juist bewijzen dat er zonder regel geen prijs is.
    regelId = (await prisma.unscoped.priceRule.create({
      data: { scope: 'PRODUCT', productId: product.id, marginPercent: '110.00', priority: 1000 },
    })).id
  }, 60000)

  afterAll(async () => {
    if (regelId) await prisma.unscoped.priceRule.deleteMany({ where: { id: regelId } })
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

  it('kiest de inkoopstaffel die bij het aantal hoort', async () => {
    const res = await reken({}).expect(200)

    expect(res.body.purchaseTierMinQuantity).toBe(250)
    expect(res.body.unitPurchasePrice).toBe('4.3165')
    // 110% marge op de inkoop.
    expect(res.body.unitSalePrice).toBe('9.0647')
    expect(res.body.priceOrigin).toBe('RULE')
    expect(res.body.subtotalExclVat).toBe('2266.18')
    expect(res.body.marginPercent).toBe('52.38')
  })

  it('toont de prijs per stuk inclusief alles', async () => {
    const res = await reken({}).expect(200)
    // Zonder bedrukking is dat gelijk aan de verkoopprijs per stuk.
    expect(res.body.allInUnitPrice).toBe('9.0647')

    const metDruk = await reken({ printOptionIds: [printOptionId], printColors: [1] }).expect(200)
    // Mét bedrukking hoger, want drukwerk en instelkosten tellen mee.
    expect(Number(metDruk.body.allInUnitPrice)).toBeGreaterThan(9.0647)
    expect(Number(metDruk.body.allInUnitPrice).toFixed(2)).toBe(
      (Number(metDruk.body.subtotalExclVat) / 250).toFixed(2),
    )
  })

  it('verschuift mee met het aantal', async () => {
    const klein = await reken({ quantity: 100 }).expect(200)
    const groot = await reken({ quantity: 1000 }).expect(200)

    expect(klein.body.purchaseTierMinQuantity).toBe(1)
    expect(klein.body.unitPurchasePrice).toBe('4.8500')
    expect(groot.body.purchaseTierMinQuantity).toBe(1000)
    expect(groot.body.unitPurchasePrice).toBe('4.0000')
  })

  it('laat een klantprijsafspraak voorgaan, met uitleg', async () => {
    await prisma.unscoped.customerPriceAgreement.create({
      data: { customerId: klantId, productId, minQuantity: 100, unitPrice: '7.5000' },
    })

    const res = await reken({ customerId: klantId }).expect(200)
    expect(res.body.priceOrigin).toBe('AGREEMENT')
    expect(res.body.priceOriginLabel).toContain('gaat voor op elke prijsregel')
    expect(res.body.unitSalePrice).toBe('7.5000')
    // De inkoop blijft de staffel, dus de marge is lager dan met de regel.
    expect(res.body.marginPercent).toBe('42.45')
  })

  it('rekent bedrukking met de staffel voor dat aantal kleuren', async () => {
    const res = await reken({ printOptionIds: [printOptionId], printColors: [2] }).expect(200)

    const positie = res.body.printPositions[0]
    expect(positie.methodName).toBe('Zeefdruk')
    expect(positie.positionName).toBe('Voorzijde')
    expect(positie.colors).toBe(2)
    expect(positie.unitPurchaseCost).toBe('0.6600')
    expect(positie.setupPurchaseCost).toBe('45.0000')
    // Standaard dezelfde marge als op het artikel.
    expect(positie.marginPercent).toBe('52.38')
    expect(res.body.warnings).toHaveLength(0)
  })

  it('waarschuwt als er geen drukstaffel is in plaats van een prijs te verzinnen', async () => {
    const res = await reken({ printOptionIds: [printOptionId], printColors: [2], quantity: 50 }).expect(200)

    expect(res.body.printPositions[0].unitPurchaseCost).toBe('0.0000')
    expect(res.body.warnings.join(' ')).toContain('geen drukstaffel')
    expect(res.body.warnings.join(' ')).toContain('vul de prijs met de hand in')
  })

  it('weigert meer kleuren dan de bedrukking aankan', async () => {
    const res = await reken({ printOptionIds: [printOptionId], printColors: [8] }).expect(422)
    expect(res.body.error.message).toContain('hoogstens 4 kleuren')
  })

  it('weigert een bedrukoptie van een ander product', async () => {
    // Mét leverancier én een eigen prijsregel, anders struikelt de calculatie
    // al eerder over een ontbrekende prijs en bewijst deze test niets.
    const ander = await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-9999`,
        name: 'Ander product',
        suppliers: { create: [{ supplierId, supplierArticleNumber: `A-${tag}`, purchasePrice: '2.0000' }] },
      },
    })
    const anderRegelId = (await prisma.unscoped.priceRule.create({
      data: { scope: 'PRODUCT', productId: ander.id, marginPercent: '110.00', priority: 1000 },
    })).id
    const res = await api()
      .post('/api/quotes/calculate').set('Cookie', cookie)
      .send({ productId: ander.id, quantity: 10, printOptionIds: [printOptionId] })
      .expect(422)
    expect(res.body.error.message).toContain('hoort niet bij dit product')

    await prisma.unscoped.priceRule.deleteMany({ where: { id: anderRegelId } })
  })

  it('herberekent de marge bij een handmatige prijs', async () => {
    const res = await reken({ manualUnitSalePrice: '6.00' }).expect(200)

    expect(res.body.priceOrigin).toBe('MANUAL')
    expect(res.body.priceOriginLabel).toContain('Handmatig')
    // De berekende prijs blijft zichtbaar naast de ingevoerde.
    expect(res.body.calculatedUnitSalePrice).toBe('9.0647')
    expect(res.body.effectiveUnitPrice).toBe('6.0000')
    expect(res.body.marginPercent).toBe('28.06')
  })

  it('meldt het als de prijs onder de inkoop zakt', async () => {
    const res = await reken({ manualUnitSalePrice: '3.00' }).expect(200)
    expect(res.body.belowCost).toBe(true)
    expect(Number(res.body.marginAmount)).toBeLessThan(0)
  })

  it('rekent btw volgens het ingestelde tarief en het regime', async () => {
    const binnenland = await reken({}).expect(200)
    expect(binnenland.body.vatRate).toBe('21')
    expect(binnenland.body.vatAmount).toBe('475.90')

    const verlegd = await reken({ vatRegime: 'EU_REVERSE_CHARGE' }).expect(200)
    expect(verlegd.body.vatAmount).toBe('0.00')
    expect(verlegd.body.totalInclVat).toBe(verlegd.body.subtotalExclVat)
  })

  it('waarschuwt als er minder voorraad is dan gevraagd', async () => {
    const verbinding = await prisma.unscoped.supplierConnection.create({
      data: {
        supplierId, key: `${tag}-conn`, connectorKey: 'midocean-api', transport: 'REST',
        config: { environment: 'test' },
      },
    })
    await prisma.unscoped.supplierStock.create({
      data: {
        connectionId: verbinding.id,
        sku: `${tag}-1001-03`,
        variantId,
        quantity: 40,
        firstArrivalDate: new Date('2026-12-01'),
        firstArrivalQuantity: 2000,
      },
    })

    const res = await reken({ quantity: 250 }).expect(200)
    const melding = res.body.warnings.join(' ')
    expect(melding).toContain('40 op voorraad')
    expect(melding).toContain('250 gevraagd')
    expect(melding).toContain('2000')

    // Genoeg voorraad: geen melding.
    const klein = await reken({ quantity: 10 }).expect(200)
    expect(klein.body.warnings.join(' ')).not.toContain('op voorraad')

    await prisma.unscoped.supplierStock.deleteMany({ where: { connectionId: verbinding.id } })
    await prisma.unscoped.supplierConnection.delete({ where: { id: verbinding.id } })
  })

  describe('drukprijs volgens de leverancier', () => {
    // De prijsstructuur van midocean, niet onze eigen staffels: vijf
    // prijstypes waarvan er twee van het logoformaat afhangen (ADR-0016).
    let connectionId = ''

    beforeAll(async () => {
      const verbinding = await prisma.unscoped.supplierConnection.create({
        data: {
          supplierId, key: `${tag}-druk`, connectorKey: 'midocean-api', transport: 'REST',
          config: { environment: 'test' },
        },
      })
      connectionId = verbinding.id

      await prisma.unscoped.supplierPrintManipulation.create({
        data: { connectionId, code: 'B', description: 'Medium', pricePerPiece: '0.1200' },
      })
      // Techniek P3 zoals hij op 29-10-2026 in hun prijslijst stond.
      await prisma.unscoped.supplierPrintTechnique.create({
        data: {
          connectionId,
          code: 'P3',
          name: 'Tampondruk',
          pricingType: 'NumberOfColours',
          setup: '27.5000',
          setupRepeat: '12.5000',
          nextColourCostIndicator: true,
          varCosts: [{
            rangeId: null, areaFrom: 0, areaTo: 0,
            scales: [
              { minimumQuantity: 1, price: '0,98', nextPrice: '0,54' },
              { minimumQuantity: 250, price: '0,26', nextPrice: '0,15' },
              { minimumQuantity: 1000, price: '0,19', nextPrice: '0,11' },
            ],
          }],
        },
      })

      await prisma.unscoped.product.update({
        where: { id: productId },
        data: { printManipulationCode: 'B' },
      })
      await prisma.unscoped.productPrintOption.updateMany({
        where: { productId },
        data: { supplierTechniqueCode: 'P3' },
      })
    })

    afterAll(async () => {
      await prisma.unscoped.productPrintOption.updateMany({
        where: { productId }, data: { supplierTechniqueCode: null },
      })
      await prisma.unscoped.supplierConnection.deleteMany({ where: { id: connectionId } })
    })

    it('rekent de drukprijs zoals de leverancier dat doet', async () => {
      const res = await reken({ printOptionIds: [printOptionId], printColors: [2] }).expect(200)
      const positie = res.body.printPositions[0]

      // Met de hand nagerekend uit hun prijslijst: staffel vanaf 250 geeft
      // 0,26 voor de eerste kleur en 0,15 voor de tweede. Dat is
      // 250*0,26 + 250*0,15 = 102,50 drukwerk, plus 250*0,12 = 30 handling,
      // samen 132,50 oftewel 0,53 per stuk. Setup 27,50 maal twee kleuren.
      expect(positie.unitPurchaseCost).toBe('0.5300')
      expect(positie.setupPurchaseCost).toBe('55.0000')
      expect(res.body.warnings).toHaveLength(0)
    })

    it('gebruikt de goedkopere vervolgkleurprijs, ook met indicator "true"', async () => {
      // De handleiding noemt "X"; de echte lijst zegt "true". Met alleen de
      // X-controle zou elke kleur de volle prijs kosten: 250*0,26*2 = 130.
      const een = await reken({ printOptionIds: [printOptionId], printColors: [1] }).expect(200)
      const twee = await reken({ printOptionIds: [printOptionId], printColors: [2] }).expect(200)

      const eenKleur = Number(een.body.printPositions[0].unitPurchaseCost)
      const tweeKleuren = Number(twee.body.printPositions[0].unitPurchaseCost)
      // De tweede kleur kost 0,15 en niet nog eens 0,26.
      expect(Number((tweeKleuren - eenKleur).toFixed(4))).toBe(0.15)
    })

    it('leest een staffeldrempel met duizendtalpunt goed', async () => {
      // Zonder die behandeling zou "1.000" als 1 gelezen worden en gold de
      // scherpste prijs al bij het eerste exemplaar.
      const klein = await reken({ printOptionIds: [printOptionId], printColors: [1], quantity: 10 }).expect(200)
      const groot = await reken({ printOptionIds: [printOptionId], printColors: [1], quantity: 1000 }).expect(200)

      expect(Number(klein.body.printPositions[0].unitPurchaseCost)).toBeCloseTo(0.98 + 0.12, 4)
      expect(Number(groot.body.printPositions[0].unitPurchaseCost)).toBeCloseTo(0.19 + 0.12, 4)
    })

    it('waarschuwt bij het prijstype dat niet gedocumenteerd is', async () => {
      await prisma.unscoped.supplierPrintTechnique.update({
        where: { connectionId_code: { connectionId, code: 'P3' } },
        data: {
          pricingType: 'Area',
          varCosts: [{ rangeId: null, areaFrom: 0, areaTo: 0, scales: [{ minimumQuantity: 1, price: '0,011' }] }],
        },
      })
      try {
        const res = await reken({
          printOptionIds: [printOptionId], printColors: [1], printAreaCm2: [150],
        }).expect(200)

        // 250 * 0,011 * 150 cm2 = 412,50 druk, plus 30 handling: 1,77 per stuk.
        expect(res.body.printPositions[0].unitPurchaseCost).toBe('1.7700')
        expect(res.body.warnings.join(' ')).toContain('per vierkante centimeter')
        expect(res.body.warnings.join(' ')).toContain('afgeleid')
      } finally {
        await prisma.unscoped.supplierPrintTechnique.update({
          where: { connectionId_code: { connectionId, code: 'P3' } },
          data: { pricingType: 'NumberOfColours' },
        })
      }
    })

    it('meldt het als een prijs per oppervlak zonder formaat gevraagd wordt', async () => {
      await prisma.unscoped.supplierPrintTechnique.update({
        where: { connectionId_code: { connectionId, code: 'P3' } },
        data: { pricingType: 'Area' },
      })
      try {
        const res = await reken({ printOptionIds: [printOptionId], printColors: [1] }).expect(200)
        expect(res.body.warnings.join(' ')).toContain('kon niet berekend worden')
        expect(res.body.printPositions[0].unitPurchaseCost).toBe('0.0000')
      } finally {
        await prisma.unscoped.supplierPrintTechnique.update({
          where: { connectionId_code: { connectionId, code: 'P3' } },
          data: { pricingType: 'NumberOfColours' },
        })
      }
    })
  })

  it('weigert te rekenen zonder prijsregel', async () => {
    // Een ander product, dus zonder de productregel hierboven.
    const kaal = await prisma.unscoped.product.create({
      data: {
        articleNumber: `${tag}-8888`,
        name: 'Zonder regel',
        suppliers: { create: [{ supplierId, supplierArticleNumber: `X-${tag}`, purchasePrice: '2.0000' }] },
      },
    })

    const res = await api()
      .post('/api/quotes/calculate').set('Cookie', cookie)
      .send({ productId: kaal.id, quantity: 10 })
      .expect(422)
    expect(res.body.error.message).toContain('geen prijsregel')
  })

  it('laat zonder quotes:view niet rekenen', async () => {
    const email = `${tag}-zonder@test.local`
    const zonder = await maakGebruikerMetWachtwoord(app, { email, name: 'Zonder', password: wachtwoord })
    const login = await api().post('/api/auth/sign-in/email').send({ email, password: wachtwoord }).expect(200)
    const andersCookie = ((login.headers['set-cookie'] as unknown as string[]) ?? [])
      .map((c) => c.split(';')[0]).join('; ')

    await api()
      .post('/api/quotes/calculate').set('Cookie', andersCookie)
      .send({ productId, quantity: 10 }).expect(403)

    await prisma.unscoped.session.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.account.deleteMany({ where: { userId: zonder.id } })
    await prisma.unscoped.user.deleteMany({ where: { id: zonder.id } })
  })
})
