import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Rollen en rechten beheren vanuit het scherm.
 *
 * De weigeringen die de database moet bewaken - de laatste beheerrechten
 * weghalen, een rol verwijderen die iemand heeft - staan in de api-tests.
 * Hier gaat het om het raster en de knoppen.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const TAG = `e2e-rol-${Date.now()}`

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  const rollen = await db.role.findMany({ where: { key: { startsWith: TAG } }, select: { id: true } })
  const ids = rollen.map((r) => r.id)
  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await db.userRole.deleteMany({ where: { roleId: { in: ids } } })
    await db.role.deleteMany({ where: { id: { in: ids } } })
  }
  await db.$disconnect()
})

/** De rij in de lijst: de sleutel staat in een <p> binnen de linkerkolom van de rij. */
const rolRij = (page: Page, sleutel: string) =>
  page.getByText(sleutel, { exact: true }).locator('../..')

test.describe.configure({ mode: 'serial' })

test.describe('rollen', () => {
  test('toont de bestaande rollen met hun aantal rechten', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Rollen' }).click()

    await expect(page.getByRole('heading', { name: 'Rollen' })).toBeVisible()
    await expect(page.getByText('Beheerder', { exact: true })).toBeVisible()
    // De beheerdersrol heeft alle 84 rechten uit de seed.
    await expect(page.getByText('84 rechten')).toBeVisible()
    await expect(page.getByText('systeemrol').first()).toBeVisible()
  })

  test('maakt een rol aan met het rechtenraster', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/rollen')
    await page.getByRole('link', { name: 'Nieuwe rol' }).click()

    await page.getByLabel('Naam').fill('Magazijn')
    await page.getByLabel('Sleutel').fill(`${TAG}-magazijn`)
    await page.getByLabel('Omschrijving').fill('Handelt leveringen af')

    // Eén recht los, en een hele module in één klik.
    await page.getByRole('row', { name: /Klanten/ }).getByRole('checkbox', { name: 'bekijken' }).check()
    await page.getByRole('row', { name: /Documenten/ }).getByRole('button', { name: 'alles aan' }).click()

    await page.getByRole('button', { name: 'Rol aanmaken' }).click()

    await expect(page.getByRole('heading', { name: 'Rollen' })).toBeVisible()
    const rij = rolRij(page, `${TAG}-magazijn`)
    await expect(rij).toContainText('Magazijn')
    await expect(rij).toContainText('Handelt leveringen af')
    // Eén los recht plus de zes van Documenten.
    await expect(rij).toContainText('7 rechten')
  })

  test('toont hoeveel rechten er aangevinkt staan tijdens het bewerken', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/rollen')
    await page.getByRole('link', { name: 'Magazijn' }).click()

    await expect(page.getByText(/7 van 84 rechten aangevinkt/)).toBeVisible()
    await expect(page.getByText('Nog aan niemand toegekend')).toBeVisible()
    // De sleutel ligt vast zodra de rol bestaat.
    await expect(page.getByRole('textbox', { name: 'Sleutel' })).toHaveCount(0)
  })

  test('wijzigt de rechten van een rol', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/rollen')
    await page.getByRole('link', { name: 'Magazijn' }).click()

    await page.getByRole('row', { name: /Documenten/ }).getByRole('button', { name: 'alles uit' }).click()
    await expect(page.getByText(/1 van 84 rechten aangevinkt/)).toBeVisible()

    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByRole('heading', { name: 'Rollen' })).toBeVisible()
    await expect(rolRij(page, `${TAG}-magazijn`)).toContainText('1 recht')
  })

  test('laat een systeemrol wel aanpassen maar niet verwijderen', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/rollen')
    await page.getByRole('link', { name: 'Verkoop', exact: true }).click()

    await expect(page.getByText('Systeemrol: wel aan te passen, niet te verwijderen.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Verwijderen' })).toHaveCount(0)
  })

  test('verwijdert een rol die van niemand is', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/rollen')
    await page.getByRole('link', { name: 'Magazijn' }).click()

    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Verwijderen' }).click()

    await expect(page.getByRole('heading', { name: 'Rollen' })).toBeVisible()
    await expect(page.getByText(`${TAG}-magazijn`)).toHaveCount(0)
  })
})
