import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Contactpersonen en adressen beheren vanuit het scherm.
 *
 * De klant en een order worden rechtstreeks in de database gezet: die zijn
 * hier opstelling, geen onderwerp. De test ruimt alles achteraf zelf op.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const TAG = `E2E-CA-${Date.now()}`
let klantId = ''
let vastAdresId = ''

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.beforeAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  const klant = await db.customer.create({
    data: { number: `${TAG}`.slice(-12), name: `${TAG} Klant` },
  })
  klantId = klant.id

  // Een adres dat aan een order hangt: dat mag straks niet verwijderd worden.
  const adres = await db.address.create({
    data: {
      customerId: klantId, type: 'DELIVERY', label: 'Vast adres',
      street: 'Gebruiktestraat', houseNumber: '7', postalCode: '1000 AA', city: 'Amsterdam',
      isDefault: true,
    },
  })
  vastAdresId = adres.id
  await db.order.create({
    data: { number: `ORD-${TAG}`, customerId: klantId, deliveryAddressId: vastAdresId },
  })
  await db.$disconnect()
})

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  await db.order.deleteMany({ where: { customerId: klantId } })
  await db.auditLog.deleteMany({ where: { entityId: klantId } })
  await db.customer.deleteMany({ where: { id: klantId } })
  await db.$disconnect()
})

test.describe.configure({ mode: 'serial' })

test.describe('contactpersonen en adressen', () => {
  test('voegt een contactpersoon toe als hoofdcontact', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}`)

    await page.locator('section', { hasText: 'Contactpersonen' }).getByRole('link', { name: 'Toevoegen' }).click()
    await expect(page.getByRole('heading', { name: 'Contactpersoon toevoegen' })).toBeVisible()

    await page.getByLabel('Voornaam').fill('Anne')
    await page.getByLabel('Achternaam').fill('de Vries')
    await page.getByLabel('Functie').fill('Inkoop')
    await page.getByLabel('E-mailadres').fill('anne@voorbeeld.nl')
    await page.getByLabel('Hoofdcontact voor deze klant').check()
    await page.getByRole('button', { name: 'Contactpersoon toevoegen' }).click()

    await expect(page.getByText('Anne de Vries')).toBeVisible()
    await expect(page.getByText('hoofdcontact')).toBeVisible()
  })

  test('geeft het hoofdcontact door aan een nieuwe contactpersoon', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}`)
    await page.locator('section', { hasText: 'Contactpersonen' }).getByRole('link', { name: 'Toevoegen' }).click()

    await page.getByLabel('Voornaam').fill('Bram')
    await page.getByLabel('Achternaam').fill('Jansen')
    await page.getByLabel('Hoofdcontact voor deze klant').check()
    await page.getByRole('button', { name: 'Contactpersoon toevoegen' }).click()

    // Precies één hoofdcontact, en dat is de nieuwe.
    const sectie = page.locator('section', { hasText: 'Contactpersonen' })
    await expect(sectie.getByText('hoofdcontact')).toHaveCount(1)
    await expect(sectie.locator('li', { hasText: 'Bram Jansen' }).getByText('hoofdcontact')).toBeVisible()
  })

  test('wijst een contactpersoon zonder achternaam af bij het veld', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}/contactpersonen/nieuw`)
    await page.getByLabel('Voornaam').fill('Zonder')
    await page.getByRole('button', { name: 'Contactpersoon toevoegen' }).click()
    await expect(page.getByText('Vul een achternaam in')).toBeVisible()
  })

  test('zet een contactpersoon op inactief', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}`)
    await page
      .locator('li', { hasText: 'Anne de Vries' })
      .getByRole('link')
      .first()
      .click()

    // Eerst echt op de contactpagina zijn: de klantpagina heeft een knop met
    // precies dezelfde tekst, voor de klant zelf.
    await expect(page.getByRole('heading', { name: 'Anne de Vries' })).toBeVisible()
    await page.getByRole('button', { name: 'Op inactief zetten' }).click()
    await expect(page.getByRole('button', { name: 'Weer activeren' })).toBeVisible()

    await page.goto(`/klanten/${klantId}`)
    await expect(
      page.locator('li', { hasText: 'Anne de Vries' }).getByText('inactief'),
    ).toBeVisible()
  })

  test('voegt een adres toe en normaliseert de postcode', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}`)
    await page.locator('section', { hasText: 'Adressen' }).getByRole('link', { name: 'Toevoegen' }).click()

    await page.getByLabel('Soort adres').selectOption('INVOICE')
    await page.getByLabel('Omschrijving').fill('Administratie')
    await page.getByLabel('Straat').fill('Boekhoudlaan')
    await page.getByLabel('Huisnummer').fill('12')
    await page.getByLabel('Postcode').fill('8011ab')
    await page.getByLabel('Plaats').fill('Zwolle')
    await page.getByRole('button', { name: 'Adres toevoegen' }).click()

    // Netjes weggeschreven als 8011 AB, ook al is het aan elkaar ingetikt.
    await expect(page.getByText('8011 AB Zwolle')).toBeVisible()
  })

  test('weigert een onmogelijke Nederlandse postcode', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}/adressen/nieuw`)
    await page.getByLabel('Straat').fill('Testweg')
    await page.getByLabel('Postcode').fill('12')
    await page.getByLabel('Plaats').fill('Zwolle')
    await page.getByRole('button', { name: 'Adres toevoegen' }).click()
    await expect(page.getByText('Een Nederlandse postcode ziet eruit als 1234 AB')).toBeVisible()
  })

  test('verwijdert een adres dat nergens gebruikt wordt', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}/adressen/nieuw`)
    await page.getByLabel('Straat').fill('Verkeerd ingetikt')
    await page.getByLabel('Postcode').fill('9999 ZZ')
    await page.getByLabel('Plaats').fill('Nergens')
    await page.getByRole('button', { name: 'Adres toevoegen' }).click()

    await page
      .locator('li', { hasText: 'Verkeerd ingetikt' })
      .getByRole('link')
      .first()
      .click()
    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Verwijderen' }).click()

    await expect(page.getByText('Verkeerd ingetikt')).toHaveCount(0)
  })

  test('weigert een adres te verwijderen dat aan een order hangt', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten/${klantId}/adressen/${vastAdresId}`)

    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Verwijderen' }).click()

    await expect(page.getByText(/gebruikt bij 1 order/)).toBeVisible()
    await expect(page.getByText(/niet verwijderd/)).toBeVisible()
    // En je staat nog op het adres, dat er dus nog is.
    await expect(page.getByLabel('Straat')).toHaveValue('Gebruiktestraat')
  })
})
