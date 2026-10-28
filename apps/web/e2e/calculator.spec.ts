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

/** De calculator openen op de demobeker, die staffels en bedrukopties heeft. */
async function openBeker(page: Page) {
  await page.goto('/producten?search=DEMO-1001')
  const href = await page.getByRole('link', { name: 'Thermosbeker Rivo 350 ml' }).getAttribute('href')
  const id = href!.split('/').pop()
  await page.goto(`/calculator?product=${id}`)
  await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
}

test.describe.configure({ mode: 'serial' })

test.describe('calculator', () => {
  test('rekent een regel door met staffel, btw en marge', async ({ page }) => {
    await logIn(page)
    await openBeker(page)

    await page.getByLabel('Aantal').fill('250')
    await page.getByRole('button', { name: 'Doorrekenen' }).click()

    await expect(page.getByText('staffel vanaf 250')).toBeVisible()
    await expect(page.getByText('prijsregel', { exact: true })).toBeVisible()
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
    await expect(uitkomst.getByText(/instelkosten/)).toBeVisible()
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
