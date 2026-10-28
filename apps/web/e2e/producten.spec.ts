import { expect, test, type Page } from '@playwright/test'

/**
 * De productcatalogus door het scherm. Gebruikt de demoproducten uit de seed,
 * dus er wordt niets aangemaakt en niets opgeruimd.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.describe.configure({ mode: 'serial' })

test.describe('producten', () => {
  test('toont de catalogus met leverancier en inkoopprijs', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Producten' }).click()

    await expect(page.getByRole('heading', { name: 'Producten' })).toBeVisible()
    const rij = page.locator('tr', { hasText: 'Thermosbeker Rivo 350 ml' })
    await expect(rij).toContainText('DEMO-1001')
    await expect(rij).toContainText('midocean')
    await expect(rij).toContainText('€')
  })

  test('zoekt op naam en op artikelnummer', async ({ page }) => {
    await logIn(page)
    await page.goto('/producten')

    await page.getByLabel('Producten zoeken').fill('balpen')
    await page.getByRole('button', { name: 'Zoeken' }).click()
    await expect(page.getByText('1 product gevonden voor “balpen”')).toBeVisible()

    await page.goto('/producten?search=DEMO-1003')
    await expect(page.locator('tbody tr')).toHaveCount(1)
    await expect(page.getByRole('link', { name: 'Katoenen shopper 180 g' })).toBeVisible()
  })

  test('filtert op actief en inactief', async ({ page }) => {
    await logIn(page)
    await page.goto('/producten')

    await page.getByRole('link', { name: 'Inactief', exact: true }).click()
    await expect(page.getByText('Geen producten gevonden')).toBeVisible()

    await page.getByRole('link', { name: 'Actief', exact: true }).click()
    await expect(page.locator('tbody tr').first()).toBeVisible()
  })

  test('sorteert op artikelnummer', async ({ page }) => {
    await logIn(page)
    await page.goto('/producten')

    await page.getByRole('link', { name: 'Artikelnummer' }).click()
    const eerste = page.locator('tbody tr').first()
    await expect(eerste).toContainText('DEMO-1001')

    await page.getByRole('link', { name: /Artikelnummer/ }).click()
    await expect(page.locator('tbody tr').first()).toContainText('DEMO-1004')
  })

  test('toont het detail met varianten, staffels en bedrukopties', async ({ page }) => {
    await logIn(page)
    await page.goto('/producten')
    await page.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).click()

    await expect(page.getByRole('heading', { name: 'Thermosbeker Rivo 350 ml' })).toBeVisible()

    // Leveranciersblok met staffels.
    const leveranciers = page.locator('section', {
      has: page.getByRole('heading', { name: 'Leveranciers en inkoopstaffels' }),
    })
    await expect(leveranciers).toContainText('midocean')
    await expect(leveranciers).toContainText('voorkeur')
    await expect(leveranciers).toContainText('vanaf 100:')

    // Varianten met hun status.
    const varianten = page.locator('section', { has: page.getByRole('heading', { name: 'Varianten' }) })
    await expect(varianten.getByText('leverbaar').first()).toBeVisible()

    // Bedrukopties uit de seed.
    await expect(page.getByRole('heading', { name: 'Bedrukopties' })).toBeVisible()
  })

  test('zegt onbekend als de leverancier geen voorraad meldde', async ({ page }) => {
    await logIn(page)
    await page.goto('/producten')
    await page.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).click()

    const varianten = page.locator('section', { has: page.getByRole('heading', { name: 'Varianten' }) })
    // Onbekend is iets anders dan nul, en dat hoort te zien te zijn.
    await expect(varianten.getByText('onbekend').first()).toBeVisible()
    await expect(page.getByText('Op voorraad')).toBeVisible()
    await expect(
      page.getByText(/Voorraad is wat de leverancier laatst meldde, geen toezegging/),
    ).toBeVisible()
  })

  test('geeft een duidelijke pagina voor een product dat niet bestaat', async ({ page }) => {
    await logIn(page)
    const res = await page.goto('/producten/00000000-0000-0000-0000-000000000000')
    expect(res?.status()).toBe(404)
  })
})
