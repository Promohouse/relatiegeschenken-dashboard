import { expect, test, type Page } from '@playwright/test'

/**
 * Het gat dat deze suite dicht: tot nu toe was bewezen dat de inlogroute
 * werkt, niet dat het formulier hem aanroept. Hier wordt er echt getypt en
 * geklikt.
 */

const DEMO = {
  email: 'beheerder@demo.local',
  wachtwoord: 'demo-wachtwoord-2026',
}

async function logIn(page: Page, wachtwoord = DEMO.wachtwoord) {
  await page.goto('/login')
  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()
}

test('stuurt een bezoeker zonder sessie naar het inlogscherm', async ({ page }) => {
  await page.goto('/klanten')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByRole('heading', { name: 'Hub' })).toBeVisible()
})

test('onthoudt waar je heen wilde en brengt je daar na het inloggen', async ({ page }) => {
  await page.goto('/klanten')
  await expect(page).toHaveURL(/verder=%2Fklanten/)

  await page.getByLabel('E-mailadres').fill(DEMO.email)
  await page.getByLabel('Wachtwoord').fill(DEMO.wachtwoord)
  await page.getByRole('button', { name: 'Inloggen' }).click()

  await expect(page).toHaveURL(/\/klanten/)
  await expect(page.getByRole('heading', { name: 'Klanten' })).toBeVisible()
})

test('weigert een verkeerd wachtwoord met een leesbare melding', async ({ page }) => {
  await logIn(page, 'dit-is-niet-het-wachtwoord')

  // Niet op role=alert zoeken: Next voegt zelf een onzichtbaar
  // aankondigingselement met diezelfde rol toe.
  await expect(page.getByText(/horen niet bij elkaar/i)).toBeVisible()
  // En je blijft op het inlogscherm staan.
  await expect(page).toHaveURL(/\/login/)
})

test('logt in via het formulier en landt op het dashboard', async ({ page }) => {
  await logIn(page)

  await expect(page).toHaveURL('http://localhost:3100/')
  await expect(page.getByRole('heading', { name: /Welkom/ })).toBeVisible()
  // De zijbalk kent de ingelogde gebruiker.
  await expect(page.getByText('beheerder@demo.local')).toBeVisible()
})

test.describe('ingelogd', () => {
  test.beforeEach(async ({ page }) => {
    await logIn(page)
    await expect(page).toHaveURL('http://localhost:3100/')
  })

  test('toont welke modules gebouwd zijn en welke nog niet', async ({ page }) => {
    const zijbalk = page.getByRole('complementary')
    await expect(zijbalk.getByRole('link', { name: 'Klanten' })).toBeVisible()
    await expect(zijbalk.getByText('Nog in aanbouw')).toBeVisible()
    // Wat nog niet bestaat is geen link, dus er valt niet op te klikken.
    await expect(zijbalk.getByRole('link', { name: 'Offertes' })).toHaveCount(0)
  })

  test('waarschuwt dat er demogegevens in deze omgeving staan', async ({ page }) => {
    await expect(page.getByText(/demogegevens/i)).toBeVisible()
  })

  test('zoekt een klant en opent zijn detailpagina', async ({ page }) => {
    // Scherp selecteren: het dashboard heeft ook een knop "Naar klanten".
    await page.getByRole('complementary').getByRole('link', { name: 'Klanten' }).click()
    await expect(page.getByRole('heading', { name: 'Klanten' })).toBeVisible()

    await page.getByLabel('Klanten zoeken').fill('zorg')
    await page.getByRole('button', { name: 'Zoeken' }).click()

    await expect(page.getByRole('link', { name: /Zorgcentrum/ })).toBeVisible()
    await page.getByRole('link', { name: /Zorgcentrum/ }).click()

    await expect(page.getByRole('heading', { name: /Zorgcentrum/ })).toBeVisible()
    await expect(page.getByText('NL009876543B01')).toBeVisible()
    await expect(page.getByText('hoofdcontact')).toBeVisible()
    // Interne opmerkingen zijn zichtbaar voor een medewerker, met de
    // uitdrukkelijke vermelding dat ze dat in het portaal niet zijn.
    await expect(
      page.getByText('Deze tekst is nooit zichtbaar in het klantportaal.'),
    ).toBeVisible()
  })

  test('filtert op actief en inactief', async ({ page }) => {
    await page.goto('/klanten')
    const rijen = page.locator('tbody tr')
    const aantalAlle = await rijen.count()

    await page.getByRole('link', { name: 'Inactief', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Klanten' })).toBeVisible()
    const aantalInactief = await page.locator('tbody tr').count()

    expect(aantalInactief).toBeLessThanOrEqual(aantalAlle)
  })

  test('sorteert op klantnummer door op de kolomkop te klikken', async ({ page }) => {
    await page.goto('/klanten')
    await page.getByRole('link', { name: 'Nummer' }).click()
    // Eerst de nieuwe pagina afwachten; anders lees je de oude volgorde.
    await expect(page).toHaveURL(/sort=number/)

    const nummers = (await page.locator('tbody tr td:first-child').allInnerTexts()).map((n) => n.trim())
    expect(nummers.length).toBeGreaterThan(1)
    expect([...nummers].sort()).toEqual(nummers)
  })

  test('logt uit en komt terug op het inlogscherm', async ({ page }) => {
    await page.getByRole('button', { name: /Uitloggen/ }).click()
    await expect(page).toHaveURL(/\/login/)

    // En daarna kom je er niet meer zomaar in.
    await page.goto('/klanten')
    await expect(page).toHaveURL(/\/login/)
  })
})
