import { describe, expect, it } from 'vitest'
import { buildQuoteDocument, type QuoteDocumentInput } from '../src/quote-document'
import type { QuoteView } from '../src/quotes'
import type { CompanySettings } from '../src/settings'

/**
 * Wat er op de offerte komt te staan.
 *
 * De PDF tekent alleen; hier staat of de juiste tekst en het juiste bedrag
 * erop komen. Dat is het deel waar een fout geld kost.
 */

const bedrijf: CompanySettings = {
  name: 'Promohouse BV',
  street: 'Weegschaalstraat 5',
  postalCode: '7324 BE',
  city: 'Apeldoorn',
  country: 'Nederland',
  phone: '055 578 88 05',
  email: 'info@promohouse.nl',
  website: 'www.promohouse.nl',
  chamberOfCommerce: '08079411',
  vatNumber: 'NL815249135B01',
  iban: 'NL39RABO0172495423',
  slogan: 'verrassend anders',
  logoLight: '/merk/promohouse-donker.png',
  logoDark: '/merk/promohouse-licht.png',
  accentColor: '#f26701',
}

const regel = (over: Partial<QuoteView['currentVersion']['lines'][number]> = {}) => ({
  id: 'r1',
  lineNumber: 1,
  productId: 'p1',
  productArticleNumber: 'AR1253',
  productName: 'Thermosbeker Rivo',
  variantDescription: null,
  description: null,
  supplierName: 'midocean',
  quantity: 250,
  unitSalePrice: '8.3333',
  unitPurchasePrice: '5.0000',
  discountPercent: '0.00',
  setupCost: '56.0000',
  vatRate: '21.00',
  lineSubtotalExclVat: '2139.33',
  lineVatAmount: '449.26',
  lineTotalInclVat: '2588.59',
  linePurchaseTotal: '1280.00',
  lineMarginAmount: '859.33',
  notes: null,
  printJobs: [
    { printMethodName: 'Zeefdruk', position: 'Voorzijde', colors: 1, unitPrice: '0.8000', setupCost: '56.0000' },
  ],
  ...over,
})

const offerte = (over: Partial<QuoteView> = {}): QuoteView => ({
  id: 'q1',
  number: 'OFF-2026-00042',
  status: 'DRAFT',
  customerId: 'k1',
  customerName: 'Bouwgroep Nederland BV',
  contactPersonId: 'c1',
  contactPersonName: 'Erik Groothedde',
  reference: 'Kerstactie 2026',
  requestedDeliveryDate: null,
  notes: 'Niet naar de klant.',
  createdAt: '2026-10-29T10:00:00.000Z',
  currentVersion: {
    id: 'v1',
    versionNumber: 1,
    validUntil: '2026-11-28T10:00:00.000Z',
    vatRegime: 'DOMESTIC',
    currency: 'EUR',
    subtotalExclVat: '2139.33',
    vatAmount: '449.26',
    totalInclVat: '2588.59',
    purchaseTotal: '1280.00',
    marginAmount: '859.33',
    marginPercent: '40.17',
    deliveryTerms: null,
    customerNotes: null,
    lockedAt: null,
    sentAt: null,
    lines: [regel()],
  },
  ...over,
})

const invoer = (over: Partial<QuoteDocumentInput> = {}): QuoteDocumentInput => ({
  quote: offerte(),
  company: bedrijf,
  templates: {
    intro:
      '{{contact.aanhef}},\n\nHierbij onze offerte {{offerte.nummer}}.\n' +
      'Uw referentie: {{offerte.referentie}}\n' +
      'Geldig tot {{offerte.geldigTot}}.',
    line:
      '{{product.naam}} ({{product.artikelnummer}})\n' +
      'Kleur: {{product.kleur}}\n' +
      '{{bedrukking.techniek}} op {{bedrukking.positie}}, {{bedrukking.kleuren}} kleur(en)',
    terms: 'Betaling: {{offerte.betalingsvoorwaarde}}.\n\nMet vriendelijke groet,\n{{gebruiker.naam}}',
  },
  user: { name: 'Michiel Mikkers', email: 'michiel@promohouse.nl' },
  customerNumber: '10001',
  paymentTerm: '30 dagen netto',
  ...over,
})

describe('de offerte als document', () => {
  it('vult de inleiding met de gegevens van deze offerte', () => {
    const doc = buildQuoteDocument(invoer())

    expect(doc.intro).toContain('Geachte heer, mevrouw Erik Groothedde')
    expect(doc.intro).toContain('OFF-2026-00042')
    expect(doc.intro).toContain('Kerstactie 2026')
    expect(doc.intro).toContain('28 november 2026')
  })

  it('gebruikt een neutrale aanhef zonder contactpersoon', () => {
    // Een verzonnen naam op een offerte is erger dan geen naam.
    const doc = buildQuoteDocument(
      invoer({ quote: offerte({ contactPersonId: null, contactPersonName: null }) }),
    )

    expect(doc.intro).toContain('Geachte heer, mevrouw,')
    expect(doc.addressee).toEqual(['Bouwgroep Nederland BV'])
  })

  it('schrijft de regel uit volgens het regelsjabloon', () => {
    const doc = buildQuoteDocument(invoer())

    expect(doc.lines[0].description).toEqual([
      'Thermosbeker Rivo (AR1253)',
      'Zeefdruk op Voorzijde, 1 kleur(en)',
    ])
  })

  it('zet de kleur erbij zodra de variant er een heeft', () => {
    const doc = buildQuoteDocument(
      invoer({
        quote: offerte({
          currentVersion: {
            ...offerte().currentVersion,
            lines: [regel({ variantDescription: 'zwart' })],
          },
        }),
      }),
    )

    expect(doc.lines[0].description).toEqual([
      'Thermosbeker Rivo (AR1253)',
      'Kleur: zwart',
      'Zeefdruk op Voorzijde, 1 kleur(en)',
    ])
  })

  it('laat een regel weg waarvan alle velden leeg blijven', () => {
    // Een sjabloon kan niet zeggen "alleen als er bedrukt wordt" of "alleen
    // als er een kleur is". Zonder deze regel staat er "Kleur:" zonder kleur
    // op een offerte die naar een klant gaat.
    const doc = buildQuoteDocument(
      invoer({
        quote: offerte({
          currentVersion: { ...offerte().currentVersion, lines: [regel({ printJobs: [] })] },
        }),
      }),
    )

    expect(doc.lines[0].description).toEqual(['Thermosbeker Rivo (AR1253)'])
  })

  it('zet een tweede bedrukking erbij zonder de productregels te herhalen', () => {
    const doc = buildQuoteDocument(
      invoer({
        quote: offerte({
          currentVersion: {
            ...offerte().currentVersion,
            lines: [
              regel({
                printJobs: [
                  { printMethodName: 'Zeefdruk', position: 'Voorzijde', colors: 1, unitPrice: '0.8', setupCost: '56' },
                  { printMethodName: 'Laseren', position: 'Achterzijde', colors: 1, unitPrice: '0.4', setupCost: '30' },
                ],
              }),
            ],
          },
        }),
      }),
    )

    expect(doc.lines[0].description).toEqual([
      'Thermosbeker Rivo (AR1253)',
      'Zeefdruk op Voorzijde, 1 kleur(en)',
      'Laseren op Achterzijde, 1 kleur(en)',
    ])
  })

  it('valt zonder regelsjabloon terug op wat er in de catalogus staat', () => {
    // Nooit een verzonnen omschrijving: als er geen sjabloon is, de naam.
    const doc = buildQuoteDocument(invoer({ templates: { intro: null, line: null, terms: null } }))

    expect(doc.lines[0].description[0]).toBe('Thermosbeker Rivo')
    expect(doc.intro).toBe('')
    expect(doc.terms).toBe('')
  })

  it('gebruikt een eigen omschrijving als die er is', () => {
    const doc = buildQuoteDocument(
      invoer({
        templates: { intro: null, line: null, terms: null },
        quote: offerte({
          currentVersion: {
            ...offerte().currentVersion,
            lines: [regel({ description: 'Relatiegeschenk kerstpakket' })],
          },
        }),
      }),
    )

    expect(doc.lines[0].description[0]).toBe('Relatiegeschenk kerstpakket')
  })

  it('neemt de bedragen over zoals ze op de offerte staan', () => {
    // Niet opnieuw uitrekenen: wat op papier komt moet gelijk zijn aan wat in
    // het scherm stond en aan wat er straks gefactureerd wordt.
    const doc = buildQuoteDocument(invoer())

    expect(doc.subtotalExclVat).toBe('2139.33')
    expect(doc.vatAmount).toBe('449.26')
    expect(doc.totalInclVat).toBe('2588.59')
    expect(doc.lines[0].lineTotal).toBe('2139.33')
    expect(doc.lines[0].quantity).toBe(250)
  })

  it('zet de betalingsvoorwaarde van deze klant in de voorwaarden', () => {
    const doc = buildQuoteDocument(invoer())

    expect(doc.terms).toContain('30 dagen netto')
    expect(doc.terms).toContain('Michiel Mikkers')
  })

  it('zet de bedrijfsgegevens in drie kolommen onderaan', () => {
    const doc = buildQuoteDocument(invoer())

    expect(doc.footer[0]).toEqual(['Promohouse BV', 'Weegschaalstraat 5', '7324 BE Apeldoorn'])
    expect(doc.footer[1]).toEqual(['055 578 88 05', 'info@promohouse.nl', 'www.promohouse.nl'])
    expect(doc.footer[2]).toEqual([
      'KvK 08079411',
      'Btw NL815249135B01',
      'NL39RABO0172495423',
    ])
  })

  it('zegt het als er geen geldigheidsdatum is in plaats van een datum te verzinnen', () => {
    const doc = buildQuoteDocument(
      invoer({
        quote: offerte({
          currentVersion: { ...offerte().currentVersion, validUntil: null },
        }),
      }),
    )

    expect(doc.validUntil).toBe('nader te bepalen')
    expect(doc.intro).toContain('nader te bepalen')
  })
})
