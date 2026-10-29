import { expect, test, type Page } from '@playwright/test'

/**
 * De calculator door het scherm, op de demoproducten uit de seed.
 * Er wordt niets opgeslagen, dus er valt ook niets op te ruimen.
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
 * De calculator openen op de demobeker, die staffels en bedrukopties heeft.
 * Via het zoekveld, zoals een gebruiker het doet.
 */
async function openBeker(page: Page) {
  await page.goto('/calculator')
  await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
  await page.getByLabel('Product').fill('DEMO-1001')
  await page.getByRole('button', { name: 'Zoeken' }).click()
  // Exact artikelnummer: die wordt meteen gekozen, zonder tussenstap.
  await expect(page.getByText('Thermosbeker Rivo 350 ml')).toBeVisible()
  await expect(page.getByLabel('Aantal')).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('calculator', () => {
  test('zoekt een product op naam en laat kiezen uit de treffers', async ({ page }) => {
    await logIn(page)
    await page.goto('/calculator')

    // Zonder product valt er niets te rekenen.
    await expect(page.getByText('Zoek eerst een product op artikelnummer of naam.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Doorrekenen' })).toHaveCount(0)

    await page.getByLabel('Product').fill('Thermosbeker')
    await page.getByRole('button', { name: 'Zoeken' }).click()

    // Geen exacte treffer op artikelnummer: dan kiest de gebruiker zelf.
    await page.getByRole('button', { name: /Thermosbeker Rivo 350 ml/ }).click()
    await expect(page.getByLabel('Aantal')).toBeVisible()
    await expect(page.getByRole('link', { name: 'naar het product' })).toBeVisible()
  })

  test('zegt het als een artikelnummer niets oplevert', async ({ page }) => {
    await logIn(page)
    await page.goto('/calculator')

    await page.getByLabel('Product').fill('BESTAAT-NIET-9999')
    await page.getByRole('button', { name: 'Zoeken' }).click()
    await expect(page.getByText('Geen product gevonden voor "BESTAAT-NIET-9999".')).toBeVisible()
  })

  test('opent met een product uit de URL, vanaf de productpagina', async ({ page }) => {
    await logIn(page)
    await page.goto('/producten?search=DEMO-1001')
    await page.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).click()
    await page.getByRole('link', { name: 'Doorrekenen' }).click()

    await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
    await expect(page.getByLabel('Aantal')).toBeVisible()
    await expect(page.getByText('Thermosbeker Rivo 350 ml')).toBeVisible()
  })

  test('rekent een regel door met staffel, btw en marge', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('250')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()

    await expect(page.getByText('staffel vanaf 250')).toBeVisible()
    await expect(page.getByText('prijsregel', { exact: true })).toBeVisible()
    // De stuksprijs waar een klant naar vraagt, met het aantal erbij omdat
    // de instelkosten over de oplage verdeeld worden. Exact matchen: er staat
    // ook een invoerveld "Prijs per stuk handmatig".
    await expect(page.getByText('Prijs per stuk', { exact: true })).toBeVisible()
    await expect(
      page.getByText('inclusief bedrukking en instelkosten, bij 250 stuks'),
    ).toBeVisible()
    await expect(page.getByText('Totaal inclusief btw')).toBeVisible()
    await expect(page.getByText('Marge', { exact: true })).toBeVisible()
    await expect(page.getByText(/% van de verkoopprijs/)).toBeVisible()
  })

  test('verschuift mee met het aantal', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('100')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()
    await expect(page.getByText('staffel vanaf 100')).toBeVisible()

    await page.getByLabel('Aantal').fill('500')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()
    await expect(page.getByText('staffel vanaf 500')).toBeVisible()
  })

  test('rekent bedrukking mee met dezelfde marge als het artikel', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('250')
    const bedrukking = page.getByRole('checkbox').first()
    await bedrukking.check()
    await page.getByRole('button', { name: 'Doorrekenen' }).click()

    // "Bedrukking" staat zowel bij de invoer als in de uitkomst; de
    // uitkomstkolom is de tweede.
    const uitkomst = page.locator('div', { has: page.getByRole('heading', { name: 'Uitkomst' }) }).last()
    await expect(uitkomst.getByText(/inkoop .* · marge .*%/)).toBeVisible()
    // Het bedrag bij de bedrukking, niet de uitleg onder de stuksprijs.
    await expect(uitkomst.getByText(/^instelkosten €/)).toBeVisible()
  })

  test('toont bij een handmatige prijs wat er is weggegeven', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('250')
    await page.getByLabel('Prijs per stuk handmatig').fill('6,00')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()

    await expect(page.getByText('handmatig', { exact: true })).toBeVisible()
    await expect(page.getByText(/Berekend was .* — Handmatig ingevoerd/)).toBeVisible()
  })

  test('waarschuwt als de prijs onder de inkoop zakt', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('250')
    await page.getByLabel('Prijs per stuk handmatig').fill('1,00')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()

    await expect(
      page.getByText('Deze prijs ligt onder de inkoop. Dat mag een keuze zijn, maar niet per ongeluk.'),
    ).toBeVisible()
  })

  test('rekent zonder btw bij verlegging', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('250')
    await page.getByLabel('Btw').selectOption('EU_REVERSE_CHARGE')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()

    await expect(page.getByText('Btw 21%')).toBeVisible()
    // Het btw-bedrag is nul; subtotaal en totaal zijn gelijk.
    const btwRegel = page.locator('div', { hasText: /^Btw 21%/ }).last()
    await expect(btwRegel).toContainText('0,00')
  })
})
