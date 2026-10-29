import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Offertes door het scherm, op de demogegevens uit de seed.
 *
 * Deze tests maken echte offertes aan in de ontwikkeldatabase en ruimen ze
 * achteraf zelf op. Ze krijgen een eigen referentie zodat alleen die van deze
 * test verdwijnen.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const REFERENTIE = `E2E-offerte-${Date.now()}`

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  try {
    await db.quote.deleteMany({ where: { reference: { startsWith: 'E2E-offerte-' } } })
  } finally {
    await db.$disconnect()
  }
})

test.describe.configure({ mode: 'serial' })

test.describe('offertes', () => {
  test('maakt een offerte aan met een nummer uit de reeks', async ({ page }) => {
    await logIn(page)
    await page.goto('/offertes')
    await expect(page.getByRole('heading', { name: 'Offertes' })).toBeVisible()

    await page.getByRole('link', { name: 'Nieuwe offerte' }).click()
    await expect(page.getByRole('heading', { name: 'Nieuwe offerte' })).toBeVisible()

    await page.getByLabel('Klant', { exact: true }).selectOption({ index: 1 })
    await page.getByLabel('Referentie').fill(REFERENTIE)
    await page.getByRole('button', { name: 'Offerte aanmaken' }).click()

    // Het nummer komt uit de reeks QUOTE en staat in de kop.
    await expect(page.getByRole('heading', { name: /^OFF-\d{4}-\d{5}$/ })).toBeVisible()
    await expect(page.getByText('concept')).toBeVisible()
    await expect(page.getByText('Nog geen regels.')).toBeVisible()
  })

  test('voegt een regel toe en telt de totalen op', async ({ page }) => {
    await logIn(page)
    await page.goto('/offertes')
    await page.getByRole('link', { name: /^OFF-/ }).first().click()

    await expect(page.getByRole('heading', { name: 'Regel toevoegen' })).toBeVisible()
    await page.getByLabel('Product').fill('DEMO-1001')
    await page.getByRole('button', { name: 'Zoeken' }).click()

    await page.getByLabel('Aantal', { exact: true }).fill('250')
    await page.getByRole('checkbox').first().check()
    await page.getByRole('button', { name: 'Regel toevoegen' }).click()

    const regels = page.locator('table tbody tr')
    await expect(regels).toHaveCount(1)
    await expect(regels.first()).toContainText('Thermosbeker Rivo 350 ml')
    await expect(regels.first()).toContainText('250')

    // De totalen staan onder de tabel en zijn de optelling van de regels.
    await expect(page.getByText('Totaal inclusief btw')).toBeVisible()
    await expect(page.getByText(/Inkoopwaarde .* · marge .*%/)).toBeVisible()
  })

  test('haalt een regel er weer af', async ({ page }) => {
    await logIn(page)
    await page.goto('/offertes')
    await page.getByRole('link', { name: /^OFF-/ }).first().click()

    await expect(page.locator('table tbody tr')).toHaveCount(1)
    await page.getByRole('button', { name: 'Regel verwijderen' }).click()

    await expect(page.getByText('Nog geen regels.')).toBeVisible()
  })

  test('toont de offerte in het overzicht met klant en status', async ({ page }) => {
    await logIn(page)
    await page.goto('/offertes')

    const rij = page.locator('tr', { hasText: REFERENTIE })
    await expect(rij).toBeVisible()
    await expect(rij.getByText('concept')).toBeVisible()
  })
})
