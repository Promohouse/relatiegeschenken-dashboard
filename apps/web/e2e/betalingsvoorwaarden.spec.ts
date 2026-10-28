import { expect, test, type Page } from '@playwright/test'
import { createPrismaClient } from '@rgh/db'

/**
 * Betalingsvoorwaarden en klantprijsafspraken door het scherm.
 *
 * De weigeringen staan in de api-tests; hier gaat het om de knoppen, de
 * keuzelijst bij de klant en de tabel met afspraken.
 */

const DEMO = { email: 'beheerder@demo.local', wachtwoord: 'demo-wachtwoord-2026' }
const TAG = `e2e-bt-${Date.now()}`

async function logIn(page: Page) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
  await expect(page).toHaveURL('http://localhost:3100/')
}

test.afterAll(async () => {
  const db = createPrismaClient(process.env.DATABASE_URL, 1)
  const termen = await db.paymentTerm.findMany({ where: { key: { startsWith: TAG } }, select: { id: true } })
  const ids = termen.map((t) => t.id)
  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { entityId: { in: ids } } })
    await db.customer.updateMany({ where: { paymentTermId: { in: ids } }, data: { paymentTermId: null } })
    await db.paymentTerm.deleteMany({ where: { id: { in: ids } } })
  }
  await db.$disconnect()
})

/**
 * De keuzelijst zet naam en omschrijving in één label, dus kiezen gaat op de
 * waarde van de optie. `selectOption({ label })` neemt geen patroon.
 */
async function kiesVoorwaarde(page: Page, deelVanDeNaam: string) {
  const lijst = page.getByLabel('Betalingsvoorwaarde')
  const waarde = await lijst.locator('option', { hasText: deelVanDeNaam }).getAttribute('value')
  if (!waarde) throw new Error(`Geen optie gevonden met "${deelVanDeNaam}" erin`)
  await lijst.selectOption(waarde)
}

test.describe.configure({ mode: 'serial' })

test.describe('betalingsvoorwaarden', () => {
  test('toont de lijst met het aantal klanten per voorwaarde', async ({ page }) => {
    await logIn(page)
    await page.getByRole('complementary').getByRole('link', { name: 'Betalingsvoorwaarden' }).click()

    await expect(page.getByRole('heading', { name: 'Betalingsvoorwaarden' })).toBeVisible()
    // Naam en omschrijving zijn hier dezelfde tekst; de link is de naam.
    await expect(page.getByRole('link', { name: '30 dagen netto' })).toBeVisible()
    await expect(page.getByText('standaard', { exact: true })).toBeVisible()
    // Eigen factuurtekst gaat voor op de opgebouwde omschrijving.
    await expect(
      page.getByText('50% vooruitbetaling, het restant binnen 14 dagen na levering.'),
    ).toBeVisible()
    // En zonder eigen tekst wordt de omschrijving opgebouwd.
    await expect(page.getByText('30 dagen na einde maand')).toBeVisible()
  })

  test('maakt een voorwaarde aan en laat het voorbeeld meelopen', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/betalingsvoorwaarden')
    await page.getByRole('link', { name: 'Nieuwe voorwaarde' }).click()

    await page.getByLabel('Naam').fill('Testvoorwaarde e2e')
    await page.getByLabel('Sleutel').fill(`${TAG}_net21`)
    await page.getByLabel('Aantal dagen').fill('21')

    // Het voorbeeld gebruikt dezelfde functie als het document.
    await expect(page.getByText('Komt op het document als:')).toBeVisible()
    await expect(page.getByText('21 dagen netto')).toBeVisible()

    await page.getByLabel('Vooruitbetaling in procenten').fill('25')
    await expect(page.getByText('25% vooruit, 21 dagen netto')).toBeVisible()

    await page.getByLabel('Rekenen vanaf einde maand').check()
    await expect(page.getByText('25% vooruit, 21 dagen na einde maand')).toBeVisible()

    await page.getByRole('button', { name: 'Voorwaarde aanmaken' }).click()
    await expect(page.getByRole('heading', { name: 'Betalingsvoorwaarden' })).toBeVisible()
    await expect(page.getByText('Testvoorwaarde e2e')).toBeVisible()
    await expect(page.getByText(`${TAG}_net21`)).toBeVisible()
  })

  test('wijzigt alleen wat er is ingevuld', async ({ page }) => {
    await logIn(page)
    await page.goto('/beheer/betalingsvoorwaarden')
    await page.getByRole('link', { name: 'Testvoorwaarde e2e' }).click()

    // De sleutel is geen invoerveld meer.
    await expect(page.getByRole('textbox', { name: 'Sleutel' })).toHaveCount(0)
    await expect(page.getByLabel('Rekenen vanaf einde maand')).toBeChecked()

    await page.getByLabel('Naam').fill('Testvoorwaarde e2e bijgewerkt')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()

    await expect(page.getByRole('heading', { name: 'Betalingsvoorwaarden' })).toBeVisible()
    await page.getByRole('link', { name: 'Testvoorwaarde e2e bijgewerkt' }).click()
    // Einde maand staat nog aan: een wijziging van de naam zet de rest niet terug.
    await expect(page.getByLabel('Rekenen vanaf einde maand')).toBeChecked()
    await expect(page.getByLabel('Aantal dagen')).toHaveValue('21')
  })

  test('kiest een voorwaarde bij een klant en toont die op de klantpagina', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Zorgcentrum De Linde' }).click()
    await expect(page.getByRole('heading', { name: 'Demo Zorgcentrum De Linde' })).toBeVisible()

    // Zonder eigen keuze staat de standaard er, met vermelding daarvan.
    await expect(page.getByText('(standaard)')).toBeVisible()

    await page.getByRole('link', { name: 'Bewerken' }).click()
    await expect(page.getByRole('heading', { name: 'Klantgegevens wijzigen' })).toBeVisible()
    await kiesVoorwaarde(page, 'Testvoorwaarde e2e bijgewerkt')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()

    await expect(page.getByRole('heading', { name: 'Demo Zorgcentrum De Linde' })).toBeVisible()
    await expect(page.getByText('Testvoorwaarde e2e bijgewerkt')).toBeVisible()
    await expect(page.getByText('25% vooruit, 21 dagen na einde maand')).toBeVisible()

    // Terug naar de standaard.
    await page.getByRole('link', { name: 'Bewerken' }).click()
    await page.getByLabel('Betalingsvoorwaarde').selectOption('')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByText('(standaard)')).toBeVisible()
  })

  test('weigert de voorwaarde te verwijderen zolang een klant hem heeft', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Zorgcentrum De Linde' }).click()
    await page.getByRole('link', { name: 'Bewerken' }).click()
    await kiesVoorwaarde(page, 'Testvoorwaarde e2e bijgewerkt')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByRole('heading', { name: 'Demo Zorgcentrum De Linde' })).toBeVisible()

    await page.goto('/beheer/betalingsvoorwaarden')
    await page.getByRole('link', { name: 'Testvoorwaarde e2e bijgewerkt' }).click()
    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Verwijderen' }).click()

    await expect(page.getByText(/is bij 1 klant ingesteld en kan niet verwijderd worden/)).toBeVisible()

    // Losmaken en dan wel verwijderen.
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Zorgcentrum De Linde' }).click()
    await page.getByRole('link', { name: 'Bewerken' }).click()
    await page.getByLabel('Betalingsvoorwaarde').selectOption('')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()
    await expect(page.getByText('(standaard)')).toBeVisible()

    await page.goto('/beheer/betalingsvoorwaarden')
    await page.getByRole('link', { name: 'Testvoorwaarde e2e bijgewerkt' }).click()
    await page.getByRole('button', { name: 'Verwijderen' }).click()
    await expect(page.getByRole('heading', { name: 'Betalingsvoorwaarden' })).toBeVisible()
    await expect(page.getByText(`${TAG}_net21`)).toHaveCount(0)
  })
})

test.describe('prijsafspraken', () => {
  test('toont de staffel van de demoklant met de status per regel', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Bouwgroep Nederland BV' }).click()

    const blok = page.locator('section', { has: page.getByRole('heading', { name: 'Prijsafspraken' }) })
    await expect(blok.getByText('Thermosbeker Rivo 350 ml').first()).toBeVisible()
    await expect(blok.getByText('€ 7,95')).toBeVisible()
    await expect(blok.getByText('€ 6,80')).toBeVisible()
    // Elke drempel geldt bij haar eigen aantal.
    await expect(blok.getByText('geldt nu')).toHaveCount(3)
  })

  test('voegt een afspraak toe via de productkiezer', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Technisch Installatiebedrijf Veld' }).click()
    await expect(page.getByRole('heading', { name: 'Demo Technisch Installatiebedrijf Veld' })).toBeVisible()

    const blok = page.locator('section', { has: page.getByRole('heading', { name: 'Prijsafspraken' }) })
    await expect(blok.getByText('Geen prijsafspraken')).toBeVisible()
    await blok.getByRole('link', { name: 'Toevoegen' }).click()

    await expect(page.getByRole('heading', { name: 'Nieuwe prijsafspraak' })).toBeVisible()
    await page.getByLabel('Product').fill('Thermosbeker')
    await page.getByRole('button', { name: 'Zoeken' }).click()
    await page.getByRole('button', { name: /Thermosbeker Rivo/ }).click()

    await page.getByLabel('Vanaf aantal').fill('250')
    // Een komma mag; de api maakt er een punt van.
    await page.getByLabel('Afgesproken prijs per stuk').fill('8,15')
    await page.getByRole('button', { name: 'Afspraak toevoegen' }).click()

    await expect(page.getByRole('heading', { name: 'Demo Technisch Installatiebedrijf Veld' })).toBeVisible()
    await expect(blok.getByText('€ 8,15')).toBeVisible()
    await expect(blok.getByText('geldt nu')).toBeVisible()
  })

  test('laat een afspraak buiten haar periode als zodanig zien', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Technisch Installatiebedrijf Veld' }).click()

    const blok = page.locator('section', { has: page.getByRole('heading', { name: 'Prijsafspraken' }) })
    await blok.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).click()
    await expect(page.getByRole('heading', { name: 'Prijsafspraak wijzigen' })).toBeVisible()

    // Product en drempel liggen vast zodra de afspraak bestaat.
    await expect(page.getByRole('textbox', { name: 'Product' })).toHaveCount(0)
    await expect(page.getByRole('spinbutton', { name: 'Vanaf aantal' })).toHaveCount(0)

    await page.getByLabel('Geldig tot en met').fill('2020-12-31')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()

    await expect(page.getByRole('heading', { name: 'Demo Technisch Installatiebedrijf Veld' })).toBeVisible()
    await expect(blok.getByText('buiten de periode')).toBeVisible()
  })

  test('weigert een einddatum voor de begindatum, bij het veld', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Technisch Installatiebedrijf Veld' }).click()

    const blok = page.locator('section', { has: page.getByRole('heading', { name: 'Prijsafspraken' }) })
    await blok.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).click()

    await page.getByLabel('Geldig vanaf').fill('2026-06-01')
    await page.getByLabel('Geldig tot en met').fill('2026-01-01')
    await page.getByRole('button', { name: 'Wijzigingen opslaan' }).click()

    await expect(page.getByText('De einddatum ligt voor de begindatum')).toBeVisible()
    // En we staan nog op het formulier, niets is opgeslagen.
    await expect(page.getByRole('heading', { name: 'Prijsafspraak wijzigen' })).toBeVisible()
  })

  test('verwijdert de afspraak weer', async ({ page }) => {
    await logIn(page)
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Demo Technisch Installatiebedrijf Veld' }).click()

    const blok = page.locator('section', { has: page.getByRole('heading', { name: 'Prijsafspraken' }) })
    await blok.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).click()

    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Verwijderen' }).click()

    await expect(page.getByRole('heading', { name: 'Demo Technisch Installatiebedrijf Veld' })).toBeVisible()
    await expect(blok.getByText('Geen prijsafspraken')).toBeVisible()
  })
})
