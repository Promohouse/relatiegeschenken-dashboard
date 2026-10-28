import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Klanten aanmaken, wijzigen en op inactief zetten vanuit het scherm.
 *
 * Deze tests schrijven in de ontwikkeldatabase. Daarom ruimen ze achteraf hun
 * eigen gegevens op, rechtstreeks via de database: er is bewust geen
 * verwijder-endpoint, want klanten horen niet verwijderd te worden.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const TAG = `E2E-${Date.now()}`

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  const klanten = await db.customer.findMany({
    where: { name: { startsWith: TAG } },
    select: { id: true },
  })
  const ids = klanten.map((k) => k.id)
  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await db.customer.deleteMany({ where: { id: { in: ids } } })
  }
  await db.$disconnect()
})

test.describe.configure({ mode: 'serial' })

test.describe('klanten beheren', () => {
  test('maakt een klant aan vanuit het scherm', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Nieuwe klant' }).click()

    await expect(page.getByRole('heading', { name: 'Nieuwe klant' })).toBeVisible()
    await page.getByLabel('Bedrijfsnaam').fill(`${TAG} Installatietechniek`)
    await page.getByLabel('Btw-nummer').fill('NL123456789B01')
    await page.getByLabel('E-mailadres').fill('Inkoop@Voorbeeld.NL')
    await page.getByLabel('Telefoon').fill('038 123 4567')
    await page.getByRole('button', { name: 'Klant aanmaken' }).click()

    // Na opslaan sta je op de detailpagina van de nieuwe klant.
    await expect(page.getByRole('heading', { name: `${TAG} Installatietechniek` })).toBeVisible()
    await expect(page.getByText(/Klantnummer \d+/)).toBeVisible()
    await expect(page.getByText('NL123456789B01')).toBeVisible()
    // De api normaliseert het e-mailadres naar kleine letters.
    await expect(page.getByText('inkoop@voorbeeld.nl')).toBeVisible()
  })

  test('toont de nieuwe klant in het overzicht', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten?search=${encodeURIComponent(TAG)}`)
    await expect(page.getByRole('link', { name: new RegExp(TAG) })).toBeVisible()
  })

  test('wijst een lege bedrijfsnaam af bij het veld zelf', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten/nieuw')
    await page.getByLabel('Bedrijfsnaam').fill('A')
    await page.getByRole('button', { name: 'Klant aanmaken' }).click()

    await expect(page.getByText('Vul een bedrijfsnaam in')).toBeVisible()
    // Je blijft op het formulier, met wat je al had ingevuld.
    await expect(page.getByLabel('Bedrijfsnaam')).toHaveValue('A')
  })

  test('controleert de vorm van een Nederlands btw-nummer', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten/nieuw')
    await page.getByLabel('Bedrijfsnaam').fill(`${TAG} Fout btw`)
    await page.getByLabel('Btw-nummer').fill('NL12345')
    await page.getByRole('button', { name: 'Klant aanmaken' }).click()

    await expect(page.getByText(/NL123456789B01/)).toBeVisible()
  })

  test('wijzigt gegevens van een bestaande klant', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten?search=${encodeURIComponent(TAG)}`)
    await page.getByRole('link', { name: new RegExp(TAG) }).first().click()

    await page.getByRole('link', { name: 'Bewerken' }).click()
    await expect(page.getByRole('heading', { name: 'Klantgegevens wijzigen' })).toBeVisible()

    await page.getByLabel('Telefoon').fill('020 999 8877')
    await page.getByLabel('Interne opmerkingen').fill('Belt liever op dinsdagochtend.')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()

    await expect(page.getByText('020 999 8877')).toBeVisible()
    await expect(page.getByText('Belt liever op dinsdagochtend.')).toBeVisible()
  })

  test('zet een klant op inactief en weer terug', async ({ page }) => {
    await logIn(page)
    await page.goto(`/klanten?search=${encodeURIComponent(TAG)}`)
    await page.getByRole('link', { name: new RegExp(TAG) }).first().click()

    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Op inactief zetten' }).click()

    await expect(page.getByText('inactief')).toBeVisible()
    // De klant is er nog: niets wordt verwijderd.
    await expect(page.getByText(/Klantnummer \d+/)).toBeVisible()

    await page.getByRole('button', { name: 'Weer activeren' }).click()
    await expect(page.getByRole('button', { name: 'Op inactief zetten' })).toBeVisible()
  })
})
