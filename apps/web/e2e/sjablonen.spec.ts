import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Tekstsjablonen beheren. Gebruikt het systeemsjabloon voor de inleiding en
 * zet de tekst achteraf terug.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
let origineel = ''

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.beforeAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  const sjabloon = await db.documentTemplate.findUniqueOrThrow({ where: { key: 'quote.intro' } })
  origineel = sjabloon.body
  await db.$disconnect()
})

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  await db.documentTemplate.update({ where: { key: 'quote.intro' }, data: { body: origineel } })
  await db.auditLog.deleteMany({ where: { entity: 'DocumentTemplate' } })
  await db.$disconnect()
})

test.describe.configure({ mode: 'serial' })

/** De lijst met velden naast de tekst; de tekst zelf bevat ze ook. */
const veldenlijst = (page: Page) =>
  page.locator('aside', { has: page.getByRole('heading', { name: 'Velden die je kunt gebruiken' }) })

test.describe('tekstsjablonen', () => {
  test('toont de sjablonen met een voorbeeld van de tekst', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Tekstsjablonen' }).click()

    await expect(page.getByRole('heading', { name: 'Tekstsjablonen' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Inleiding op de offerte' })).toBeVisible()
    // De voorbeeldweergave heeft de velden al ingevuld.
    await expect(page.getByText(/OFF-2026-00042/).first()).toBeVisible()
  })

  test('toont de beschikbare velden, en alleen die van dit soort', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/sjablonen/quote.intro')

    const velden = veldenlijst(page)
    await expect(velden.getByText('{{offerte.nummer}}')).toBeVisible()
    await expect(velden.getByText('{{contact.aanhef}}')).toBeVisible()
    // Productvelden horen bij een regel, niet bij de inleiding.
    await expect(velden.getByText('{{product.naam}}')).toHaveCount(0)
  })

  test('kent bij een regelsjabloon wel de productvelden', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/sjablonen/quote.line')

    const velden = veldenlijst(page)
    await expect(velden.getByText('{{product.naam}}')).toBeVisible()
    await expect(velden.getByText('{{bedrukking.techniek}}')).toBeVisible()
    // En de proefweergave vult ze in.
    await expect(page.getByText(/BASICS \(AR1253\)/)).toBeVisible()
  })

  test('waarschuwt tijdens het typen bij een veld dat niet bestaat', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/sjablonen/quote.intro')

    await page.getByLabel('Tekst').fill('Beste {{klnat.naam}},')
    await expect(page.getByText(/Onbekend veld: \{\{klnat.naam\}\}/)).toBeVisible()

    // En opslaan wordt geweigerd, met de melding bij het veld.
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByText(/Onbekend veld: \{\{klnat.naam\}\}/).first()).toBeVisible()
    await expect(page).toHaveURL(/sjablonen\/quote.intro/)
  })

  test('slaat een gewijzigde tekst op', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/sjablonen/quote.intro')

    await page.getByLabel('Tekst').fill('{{contact.aanhef}},\n\nHierbij offerte {{offerte.nummer}}.')
    // De proefweergave loopt mee tijdens het typen.
    await expect(page.getByText('Geachte heer Groothedde,')).toBeVisible()

    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByRole('heading', { name: 'Tekstsjablonen' })).toBeVisible()

    await page.goto('/beheer/sjablonen/quote.intro')
    await expect(page.getByLabel('Tekst')).toHaveValue(/Hierbij offerte/)
  })
})
