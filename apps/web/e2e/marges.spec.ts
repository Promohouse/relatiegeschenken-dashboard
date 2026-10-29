import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Margeregels instellen vanuit het scherm.
 *
 * Deze tests schrijven in de ontwikkeldatabase en ruimen hun eigen regels
 * achteraf op. De standaardmarge wordt bewust alleen gelezen en niet
 * gewijzigd: die geldt voor élk artikel, dus zou een wijziging de
 * calculatortests omgooien.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const NOTITIE = `E2E-marge-${Date.now()}`

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
    await db.priceRule.deleteMany({ where: { note: { startsWith: 'E2E-marge-' } } })
  } finally {
    await db.$disconnect()
  }
})

test.describe.configure({ mode: 'serial' })

test.describe('marges', () => {
  test('toont de standaardmarge als deel van de verkoopprijs', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/marges')

    await expect(page.getByRole('heading', { name: 'Marges' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Standaardmarge' })).toBeVisible()

    // De demoregel staat op 110% opslag op de inkoop. Dat is 52,38% van de
    // verkoopprijs, en dát is het getal waar in deze handel op gestuurd wordt.
    const standaard = page.locator('table').first()
    await expect(standaard.getByText('52.38%')).toBeVisible()
    await expect(standaard.getByText('110% opslag')).toBeVisible()
    await expect(standaard.getByText('volgt artikel')).toBeVisible()
  })

  test('rekent de twee manieren voor je om tijdens het invullen', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/marges/nieuw')

    // Standaard staat de keuze op de marge op de verkoopprijs, want zo praat
    // de verkoop erover.
    await page.getByLabel('Op het artikel').fill('40')
    await expect(page.getByText('Dat is 66.67% opslag op de inkoop.')).toBeVisible()

    await page.getByLabel('Hoe is het percentage bedoeld?').selectOption('COST')
    await page.getByLabel('Op het artikel').fill('110')
    await expect(page.getByText('Dat is 52.38% van de verkoopprijs.')).toBeVisible()

    // En de grens die alleen voor de ene manier geldt.
    await page.getByLabel('Hoe is het percentage bedoeld?').selectOption('SALE')
    await page.getByLabel('Op het artikel').fill('100')
    await expect(
      page.getByText('Een marge van 100% of meer van de verkoopprijs kan niet.'),
    ).toBeVisible()
  })

  test('legt een eigen marge voor één klant vast, ook voor de bedrukking', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    const klant = page.getByRole('link', { name: /Van Dijk|Demo/ }).first()
    await klant.click()
    // Op de sectie gescopet: "Toevoegen" staat ook bij contactpersonen,
    // adressen en prijsafspraken op deze pagina.
    const blok = page.locator('section', {
      has: page.getByRole('heading', { name: 'Marge voor deze klant' }),
    })
    await expect(blok).toBeVisible()
    await expect(blok.getByText('Geen eigen marge. Deze klant volgt de standaardmarge.')).toBeVisible()

    const klantUrl = page.url()
    await blok.getByRole('link', { name: 'Toevoegen' }).click()
    await expect(page.getByRole('heading', { name: 'Nieuwe margeregel' })).toBeVisible()

    // De klant ligt vast omdat we van zijn pagina komen.
    await expect(page.getByLabel('Waarvoor geldt deze regel?')).toBeDisabled()
    await page.getByLabel('Op het artikel').fill('30')
    await page.getByLabel('Op de bedrukking').fill('55')
    await page.getByLabel('Waar komt deze regel uit?').fill(NOTITIE)
    await page.getByRole('button', { name: 'Regel opslaan' }).click()

    // Terug op de klant, met de nieuwe marge erbij.
    await expect(page).toHaveURL(klantUrl)
    await expect(blok.getByText('Artikel 30.00%')).toBeVisible()
    await expect(blok.getByText('bedrukking 55.00%')).toBeVisible()
    await expect(blok.getByText('geldt')).toBeVisible()

    // En hij staat ook in het centrale overzicht, onder de standaard.
    await page.goto('/beheer/marges')
    await expect(page.getByText(NOTITIE)).toBeVisible()
  })
})
