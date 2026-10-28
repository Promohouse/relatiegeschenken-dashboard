import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Het beoordelingsscherm, met een import die al gedraaid heeft.
 *
 * De gegevens worden rechtstreeks klaargezet: een koppeling, een afgeronde
 * import, de vastgelegde brondata van midocean en een voorgestelde wijziging.
 * Daardoor is er geen netwerk nodig - het toepassen leest de opgeslagen
 * payload en vertaalt die met dezelfde connector die hem ophaalde.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const TAG = `e2e-imp-${Date.now()}`

const PAYLOAD = {
  master_code: `${TAG}-AR9999`,
  product_name: 'TESTBEKER',
  short_description: 'Testbeker voor de e2e-test',
  material: 'RVS',
  country_of_origin: 'CN',
  printable: 'yes',
  dimensions: '10X8 CM',
  variants: [
    {
      variant_id: '99000001',
      sku: `${TAG}-AR9999-03`,
      color_description: 'black',
      color_code: '03',
      gtin: '8719941099991',
      category_level1: 'Drinkware',
      digital_assets: [],
    },
  ],
}

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

const db = () => createPrismaClient(process.env.DATABASE_URL, 1)

test.beforeAll(async () => {
  const prisma = db()
  const leverancier = await prisma.supplier.create({ data: { code: TAG, name: `${TAG} Testleverancier` } })
  const verbinding = await prisma.supplierConnection.create({
    data: {
      supplierId: leverancier.id,
      key: `${TAG}-koppeling`,
      connectorKey: 'midocean-api',
      transport: 'REST',
      config: { environment: 'test' },
      isActive: true,
      notes: 'Koppeling van de e2e-test.',
      capabilities: { create: [{ capability: 'CATALOG', priority: 10 }] },
    },
  })

  const run = await prisma.importRun.create({
    data: {
      connectionId: verbinding.id,
      capability: 'CATALOG',
      status: 'SUCCESS',
      dryRun: false,
      finishedAt: new Date(),
      itemsSeen: 1,
      itemsChanged: 1,
      log: { created: 1, updated: 0, unchanged: 0, missing: 0 },
    },
  })

  await prisma.rawSupplierProduct.create({
    data: {
      connectionId: verbinding.id,
      externalId: PAYLOAD.master_code,
      payload: PAYLOAD,
      hash: 'e2e-vaste-hash',
      importRunId: run.id,
    },
  })

  await prisma.stagedChange.create({
    data: {
      importRunId: run.id,
      entityType: 'Product',
      externalId: PAYLOAD.master_code,
      changeType: 'CREATE',
      diff: {
        name: { van: null, naar: 'TESTBEKER' },
        material: { van: null, naar: 'RVS' },
        varianten: { van: null, naar: [`${TAG}-AR9999-03`] },
      },
    },
  })

  await prisma.$disconnect()
})

test.afterAll(async () => {
  const prisma = db()
  const koppelingen = await prisma.productSupplier.findMany({
    where: { supplier: { code: TAG } },
    select: { productId: true },
  })
  const productIds = koppelingen.map((k) => k.productId)

  await prisma.auditLog.deleteMany({ where: { entityId: { in: productIds } } })
  await prisma.productSupplier.deleteMany({ where: { supplier: { code: TAG } } })
  await prisma.productVariant.deleteMany({ where: { productId: { in: productIds } } })
  await prisma.product.deleteMany({ where: { id: { in: productIds } } })
  await prisma.product.deleteMany({ where: { articleNumber: { startsWith: TAG } } })
  // De import, de ruwe data en de wijzigingen hangen aan de koppeling en gaan
  // mee als die weg is.
  await prisma.supplierConnection.deleteMany({ where: { key: { startsWith: TAG } } })
  await prisma.supplier.deleteMany({ where: { code: TAG } })
  await prisma.$disconnect()
})

test.describe.configure({ mode: 'serial' })

test.describe('imports', () => {
  test('toont de koppelingen met wat er wel en niet kan', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Imports' }).click()

    // Exact, anders matcht "Laatste imports" ook: een naam zonder exact
    // zoekt op deeltekst.
    await expect(page.getByRole('heading', { name: 'Imports', exact: true })).toBeVisible()
    await expect(page.getByText(`${TAG}-koppeling`)).toBeVisible()

    // midocean uit de seed: PLACE_ORDER staat er wel bij, doorgestreept, met
    // de uitleg dat er geen code voor is (ADR-0013).
    await expect(
      page.getByTitle('Gedocumenteerd, maar er is geen code die dit uitvoert').first(),
    ).toBeVisible()
    // Drie leveranciers hebben hem; alle drie doorgestreept.
    await expect(page.getByText('PLACE_ORDER').first()).toBeVisible()
  })

  test('toont de gedraaide import in het overzicht', async ({ page }) => {
    await logIn(page)
    await page.goto('/imports')

    const rij = page.locator('tr', { hasText: `${TAG} Testleverancier` })
    await expect(rij).toContainText('SUCCESS')
    await expect(rij).toContainText('CATALOG')
  })

  test('toont per artikel wat er zou veranderen', async ({ page }) => {
    await logIn(page)
    await page.goto('/imports')
    await page.locator('tr', { hasText: `${TAG} Testleverancier` }).getByRole('link').click()

    await expect(page.getByRole('heading', { name: /Testleverancier/ })).toBeVisible()
    await expect(page.getByText('1 nog te beoordelen')).toBeVisible()

    // Eén voorstel, met het artikelnummer van de leverancier erop. Niet op
    // losse tekst selecteren: het variantnummer bevat het artikelnummer.
    const voorstel = page.getByRole('listitem').filter({ hasText: PAYLOAD.master_code })
    await expect(voorstel).toHaveCount(1)
    await expect(voorstel.getByText('nieuw', { exact: true })).toBeVisible()

    // Het verschil per veld, met de Nederlandse veldnaam.
    await expect(voorstel.getByText('Materiaal')).toBeVisible()
    await expect(voorstel.getByText('RVS')).toBeVisible()
    await expect(voorstel.getByText(`erbij: ${TAG}-AR9999-03`)).toBeVisible()
  })

  test('maakt het product aan bij toepassen', async ({ page }) => {
    await logIn(page)
    await page.goto('/imports')
    await page.locator('tr', { hasText: `${TAG} Testleverancier` }).getByRole('link').click()
    await expect(page.getByText('1 nog te beoordelen')).toBeVisible()

    await page.getByRole('button', { name: 'Toepassen' }).click()
    await expect(page.getByText('toegepast')).toBeVisible()

    // En het product staat er echt, met variant en leverancierskoppeling.
    const prisma = db()
    const product = await prisma.product.findFirst({
      where: { articleNumber: PAYLOAD.master_code },
      include: { variants: true, suppliers: true },
    })
    expect(product?.name).toBe('TESTBEKER')
    expect(product?.material).toBe('RVS')
    expect(product?.variants).toHaveLength(1)
    expect(product?.variants[0].colorCode).toBe('03')
    expect(product?.suppliers[0].supplierArticleNumber).toBe(PAYLOAD.master_code)
    await prisma.$disconnect()
  })

  test('weigert dezelfde wijziging een tweede keer', async ({ page }) => {
    await logIn(page)
    await page.goto('/imports')
    await page.locator('tr', { hasText: `${TAG} Testleverancier` }).getByRole('link').click()

    // De knop is weg zodra de wijziging is toegepast.
    await expect(page.getByRole('button', { name: 'Toepassen' })).toHaveCount(0)
    await expect(page.getByText('toegepast')).toBeVisible()
  })
})
