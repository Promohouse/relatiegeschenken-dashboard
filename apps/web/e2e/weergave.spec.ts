import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Lichte en donkere weergave, en de bedrijfsgegevens die in het scherm en op
 * documenten komen.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

/**
 * De keuze staat bij de gebruiker en blijft dus staan. Vooraf op SYSTEM
 * zetten, zodat deze test niet afhangt van wat een vorige run of iemands
 * handmatige klik heeft achtergelaten.
 */
test.beforeAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  await db.user.updateMany({ where: { email: DEMO.email }, data: { themePreference: 'SYSTEM' } })
  await db.$disconnect()
})

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  await db.user.updateMany({ where: { email: DEMO.email }, data: { themePreference: 'SYSTEM' } })
  await db.$disconnect()
})

test.describe.configure({ mode: 'serial' })

test.describe('weergave', () => {
  test('schakelt tussen licht en donker, en onthoudt de keuze', async ({ page }) => {
    await logIn(page)

    // Zonder keuze volgt het scherm het besturingssysteem: geen data-theme.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/)

    await page.getByRole('button', { name: 'Donker' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // De ondergrond is werkelijk donker, niet alleen het kenmerk.
    const kleur = await page.evaluate(() =>
      getComputedStyle(document.body).getPropertyValue('--color-ground').trim(),
    )
    expect(kleur).toBe('#141715')

    // Na herladen staat hij er nog: de keuze komt van de server.
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: 'Licht' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
  })

  test('toont het logo dat bij de weergave hoort', async ({ page }) => {
    await logIn(page)

    await page.getByRole('button', { name: 'Licht' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.locator('.logo-op-licht').first()).toBeVisible()
    await expect(page.locator('.logo-op-donker').first()).toBeHidden()

    await page.getByRole('button', { name: 'Donker' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.locator('.logo-op-donker').first()).toBeVisible()
    await expect(page.locator('.logo-op-licht').first()).toBeHidden()
  })

  test('toont en bewaart de bedrijfsgegevens', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Instellingen' }).click()

    await expect(page.getByRole('heading', { name: 'Bedrijfsgegevens' })).toBeVisible()
    await expect(page.getByText('KvK 08079411 · btw NL815249135B01')).toBeVisible()

    // Wijzigen en terugzetten, zodat de omgeving blijft kloppen.
    await page.getByLabel('Telefoon').fill('055 111 11 11')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByRole('heading', { name: 'Bedrijfsgegevens' })).toBeVisible()
    await expect(page.getByLabel('Telefoon')).toHaveValue('055 111 11 11')

    await page.getByLabel('Telefoon').fill('055 578 88 05')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByLabel('Telefoon')).toHaveValue('055 578 88 05')
  })

  test('wijst een btw-nummer met de verkeerde vorm af bij het veld', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/instellingen')

    await page.getByLabel('Btw-nummer').fill('NL123')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByText('Een Nederlands btw-nummer ziet eruit als NL123456789B01')).toBeVisible()

    await page.getByLabel('Btw-nummer').fill('NL815249135B01')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByRole('heading', { name: 'Bedrijfsgegevens' })).toBeVisible()
  })

  test('onderhoudt de verzendwijzen voor de calculator', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/instellingen')

    await expect(page.getByRole('heading', { name: 'Verzendwijzen' })).toBeVisible()
    await expect(page.getByLabel('Naam verzendwijze 1')).toHaveValue('Pakket')
    await expect(page.getByLabel('Kostprijs verzendwijze 1')).toHaveValue('9,50')

    // Een tarief wijzigen hoort geen nieuwe versie van de software te vragen.
    await page.getByLabel('Kostprijs verzendwijze 1').fill('11,25')
    await page.getByRole('button', { name: 'Verzendwijzen opslaan' }).click()
    await expect(page.getByText('Opgeslagen.')).toBeVisible()

    await page.reload()
    await expect(page.getByLabel('Kostprijs verzendwijze 1')).toHaveValue('11,25')

    // En in de calculator staat het nieuwe bedrag in de keuzelijst.
    await page.goto('/calculator')
    await page.getByLabel('Product').fill('DEMO-1001')
    await page.getByRole('button', { name: 'Zoeken' }).click()
    await expect(page.getByLabel('Verzendwijze')).toContainText('Pakket — kost € 11,25')

    // Terugzetten, anders werkt de calculatortest met een ander bedrag.
    await page.goto('/beheer/instellingen')
    await page.getByLabel('Kostprijs verzendwijze 1').fill('9,50')
    await page.getByRole('button', { name: 'Verzendwijzen opslaan' }).click()
    await expect(page.getByText('Opgeslagen.')).toBeVisible()
  })
})
