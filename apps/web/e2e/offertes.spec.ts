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

  test('rekent een regel door in het venster en voegt hem pas daarna toe', async ({ page }) => {
    await logIn(page)
    await page.goto('/offertes')
    await page.getByRole('link', { name: /^OFF-/ }).first().click()

    await page.getByRole('button', { name: 'Regel berekenen' }).click()
    const venster = page.getByRole('dialog')
    await expect(venster).toBeVisible()

    // De klant ligt vast op die van de offerte; er valt niets te kiezen.
    await expect(venster.getByLabel('Klant', { exact: true })).toHaveCount(0)

    await venster.getByLabel('Product').fill('DEMO-1001')
    await venster.getByRole('button', { name: 'Zoeken' }).click()
    await venster.getByLabel('Aantal', { exact: true }).fill('250')
    await venster.getByRole('checkbox').first().check()
    await venster.getByRole('button', { name: 'Doorrekenen' }).click()

    // Eerst het resultaat zien, met de marge erbij.
    await expect(venster.getByText('Prijs per stuk', { exact: true })).toBeVisible()
    await expect(venster.getByText(/% van de verkoopprijs/)).toBeVisible()
    // En zolang er niet op toevoegen geklikt is, staat er niets op de offerte.
    await expect(page.locator('table tbody tr')).toHaveCount(0)

    await venster.getByRole('button', { name: 'Toevoegen aan offerte' }).click()
    await expect(venster).toBeHidden()

    const regels = page.locator('table tbody tr')
    await expect(regels).toHaveCount(1)
    await expect(regels.first()).toContainText('Thermosbeker Rivo 350 ml')
    await expect(regels.first()).toContainText('250')

    // De totalen staan onder de tabel en zijn de optelling van de regels.
    await expect(page.getByText('Totaal inclusief btw')).toBeVisible()
    await expect(page.getByText(/Inkoopwaarde .* · marge .*%/)).toBeVisible()
  })

  test('sluit het venster zonder iets toe te voegen', async ({ page }) => {
    await logIn(page)
    await page.goto('/offertes')
    await page.getByRole('link', { name: /^OFF-/ }).first().click()

    // Expliciet wachten tot de tabel er staat: `count()` wacht niet, en dan
    // tel je de regels van een pagina die nog aan het laden is.
    const regels = page.locator('table tbody tr')
    await expect(regels).toHaveCount(1)

    await page.getByRole('button', { name: 'Regel berekenen' }).click()
    const venster = page.getByRole('dialog')
    await venster.getByLabel('Product').fill('DEMO-1001')
    await venster.getByRole('button', { name: 'Zoeken' }).click()
    await venster.getByRole('button', { name: 'Doorrekenen' }).click()
    await expect(venster.getByText('Prijs per stuk', { exact: true })).toBeVisible()

    // Escape hoort te werken; dat regelt het dialog-element zelf.
    await page.keyboard.press('Escape')
    await expect(venster).toBeHidden()
    await expect(regels).toHaveCount(1)
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
