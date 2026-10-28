import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Gebruikersbeheer vanuit het scherm: aanmaken, rollen toekennen, wijzigen en
 * op inactief zetten. De aangemaakte gebruikers worden achteraf opgeruimd.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const TAG = `e2e-gb-${Date.now()}`
const NIEUW_EMAIL = `${TAG}@test.local`
const NIEUW_WACHTWOORD = 'beginwachtwoord-2026'

async function logIn(page: Page, email = DEMO.email, wachtwoord = DEMO.wachtwoord) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(email)
  await page.getByLabel('Wachtwoord').fill(wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  // Wachten tot het dashboard er echt is: anders racet de volgende navigatie
  // tegen het doorsturen na het inloggen.
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  const gebruikers = await db.user.findMany({
    where: { email: { startsWith: TAG } },
    select: { id: true },
  })
  const ids = gebruikers.map((g) => g.id)
  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await db.session.deleteMany({ where: { userId: { in: ids } } })
    await db.account.deleteMany({ where: { userId: { in: ids } } })
    await db.userRole.deleteMany({ where: { userId: { in: ids } } })
    await db.user.deleteMany({ where: { id: { in: ids } } })
  }
  await db.$disconnect()
})

test.describe.configure({ mode: 'serial' })

test.describe('gebruikersbeheer', () => {
  test('toont de gebruikers met hun rollen', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Gebruikers' }).click()

    await expect(page.getByRole('heading', { name: 'Gebruikers' })).toBeVisible()
    // Scherp selecteren: het e-mailadres staat ook in de zijbalk.
    await expect(page.locator('tbody').getByText('beheerder@demo.local')).toBeVisible()
    // Rollen staan als label bij de gebruiker.
    // Exact matchen: de rij bevat ook de naam "Demo Verkoop" en het adres
    // verkoop@demo.local. Alleen het rollabel is precies "Verkoop".
    await expect(
      page.locator('tr', { hasText: 'Demo Verkoop' }).getByText('Verkoop', { exact: true }),
    ).toBeVisible()
    // En de rollen met hun aantal rechten staan eronder.
    await expect(page.getByRole('heading', { name: 'Rollen en rechten' })).toBeVisible()
  })

  test('maakt een gebruiker aan met een rol', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/gebruikers')
    await page.getByRole('link', { name: 'Nieuwe gebruiker' }).click()

    await page.getByLabel('Naam').fill('Testcollega Jansen')
    await page.getByLabel('E-mailadres').fill(NIEUW_EMAIL)
    await page.getByLabel('Beginwachtwoord').fill(NIEUW_WACHTWOORD)
    await page.getByRole('checkbox', { name: /Verkoop/ }).check()
    await page.getByRole('button', { name: 'Gebruiker aanmaken' }).click()

    await expect(page.getByRole('heading', { name: 'Gebruikers' })).toBeVisible()
    const rij = page.locator('tr', { hasText: 'Testcollega Jansen' })
    await expect(rij).toBeVisible()
    await expect(rij.getByText('Verkoop', { exact: true })).toBeVisible()
  })

  test('weigert een te kort beginwachtwoord bij het veld zelf', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/gebruikers/nieuw')
    await page.getByLabel('Naam').fill('Te Kort')
    await page.getByLabel('E-mailadres').fill(`${TAG}-kort@test.local`)
    await page.getByLabel('Beginwachtwoord').fill('kort')
    await page.getByRole('button', { name: 'Gebruiker aanmaken' }).click()

    await expect(page.getByText('Een wachtwoord is minstens 12 tekens')).toBeVisible()
  })

  test('de nieuwe gebruiker kan inloggen en ziet alleen wat hij mag', async ({ page }) => {
    await logIn(page, NIEUW_EMAIL, NIEUW_WACHTWOORD)
    await expect(page.getByRole('heading', { name: /Welkom/ })).toBeVisible()

    const zijbalk = page.getByRole('complementary')
    // Verkoop mag klanten zien, maar geen gebruikers beheren.
    await expect(zijbalk.getByRole('link', { name: 'Klanten' })).toBeVisible()
    await expect(zijbalk.getByRole('link', { name: 'Gebruikers' })).toHaveCount(0)

    // En rechtstreeks naar de URL gaan helpt niet.
    await page.goto('/beheer/gebruikers')
    await expect(page).toHaveURL('http://localhost:3100/')
  })

  test('wijzigt de rollen van een gebruiker', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/gebruikers')
    await page.getByRole('link', { name: 'Testcollega Jansen' }).click()

    await page.getByRole('checkbox', { name: /Inkoop/ }).check()
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()

    const rij = page.locator('tr', { hasText: 'Testcollega Jansen' })
    await expect(rij.getByText('Inkoop', { exact: true })).toBeVisible()
    await expect(rij.getByText('Verkoop', { exact: true })).toBeVisible()
  })

  test('zet een gebruiker op inactief', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/gebruikers')
    await page.getByRole('link', { name: 'Testcollega Jansen' }).click()
    await expect(page.getByRole('heading', { name: 'Testcollega Jansen' })).toBeVisible()

    await page.getByRole('button', { name: 'Op inactief zetten' }).click()
    await expect(page.getByRole('button', { name: 'Weer activeren' })).toBeVisible()
  })

  test('laat je jezelf niet op inactief zetten', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/gebruikers')
    await page.getByRole('link', { name: 'Demo Beheerder' }).click()

    await expect(page.getByText('jezelf niet op inactief')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Op inactief zetten' })).toHaveCount(0)
  })
})
