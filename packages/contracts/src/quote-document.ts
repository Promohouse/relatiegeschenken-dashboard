import { formatEuro } from './money'
import { findPlaceholders, renderTemplate } from './templates'
import type { QuoteView } from './quotes'
import type { CompanySettings } from './settings'

/**
 * Wat er op de offerte komt te staan, als gegevens.
 *
 * Bewust gescheiden van het tekenen van de PDF. De teksten, de bedragen en de
 * volgorde zijn te testen; het tekenwerk is dun en gaat over millimeters. Zou
 * dit in de tekencode zitten, dan is "staat de juiste prijs erop" alleen met
 * het oog te controleren.
 */

export interface QuoteDocumentLine {
  lineNumber: number
  /** Omschrijving uit het sjabloon QUOTE_LINE, al ingevuld. */
  description: string[]
  quantity: number
  unitPrice: string
  setupCost: string
  lineTotal: string
}

export interface QuoteDocument {
  /** Wat in de kop staat. */
  quoteNumber: string
  date: string
  validUntil: string
  reference: string | null
  /** Het adresblok, regel voor regel. */
  addressee: string[]
  /** De tekst boven de regels, uit het sjabloon QUOTE_INTRO. */
  intro: string
  lines: QuoteDocumentLine[]
  subtotalExclVat: string
  vatAmount: string
  totalInclVat: string
  /** De tekst onder de regels, uit het sjabloon QUOTE_TERMS. */
  terms: string
  /** De voettekst met de bedrijfsgegevens, in kolommen. */
  footer: string[][]
}

export interface QuoteDocumentInput {
  quote: QuoteView
  company: CompanySettings
  /** De drie sjablonen; ontbreekt er een, dan blijft dat deel leeg. */
  templates: { intro: string | null; line: string | null; terms: string | null }
  /** Wie de offerte maakt. */
  user: { name: string; email: string }
  customerNumber: string | null
  paymentTerm: string | null
  /** Peildatum, zodat een test niet van vandaag afhangt. */
  at?: Date
}

const datum = (iso: string | null, terugval = ''): string =>
  iso
    ? new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : terugval

/**
 * Of deze sjabloonregel alleen uit velden bestaat die wij niet kennen.
 *
 * Een sjabloon kan niet zeggen "alleen als er bedrukt wordt" of "alleen als
 * er een kleur is". Daarom deze regel: een regel waarvan álle velden leeg
 * blijven verdwijnt. Anders staat er "Kleur:" zonder kleur op een offerte die
 * naar een klant gaat.
 *
 * Een uitspraak over de velden, niet over de tekst, dus hij blijft kloppen
 * als iemand het sjabloon herschrijft. Een regel zonder velden - een vaste
 * zin - blijft altijd staan.
 */
function alleVeldenLeeg(regel: string, waarden: Record<string, string>): boolean {
  const velden = findPlaceholders(regel)
  return velden.length > 0 && velden.every((v) => (waarden[v] ?? '').trim() === '')
}

/** De omschrijving van één offerteregel, uit het sjabloon. */
function omschrijving(
  sjabloon: string | null,
  regel: QuoteView['currentVersion']['lines'][number],
  waarden: Record<string, string>,
): string[] {
  // Zonder sjabloon de eigen omschrijving of de productnaam; dat is wat er
  // in de catalogus staat en nooit een verzonnen tekst.
  if (!sjabloon) {
    const basis = [regel.description ?? regel.productName]
    for (const druk of regel.printJobs) {
      basis.push(`${druk.printMethodName}, ${druk.colors}`)
    }
    return basis
  }

  const regels = sjabloon.split('\n')
  const metDruk = (druk: typeof regel.printJobs[number] | undefined) => ({
    ...waarden,
    ...drukvelden(druk),
  })

  const bruikbaar = (alles: Record<string, string>) =>
    regels.filter((r) => !alleVeldenLeeg(r, alles)).join('\n')

  const eerste = renderTemplate(
    bruikbaar(metDruk(regel.printJobs[0])),
    metDruk(regel.printJobs[0]),
  ).split('\n')

  if (regel.printJobs.length <= 1) return eerste

  // Meerdere bedrukkingen: per extra bedrukking alleen de regels die
  // verschillen van de eerste. Zo komt er geen tekst bij die niet uit het
  // sjabloon komt.
  const uit = [...eerste]
  for (const druk of regel.printJobs.slice(1)) {
    const volgende = renderTemplate(bruikbaar(metDruk(druk)), metDruk(druk)).split('\n')
    for (const r of volgende) {
      if (!eerste.includes(r)) uit.push(r)
    }
  }
  return uit
}

function drukvelden(
  druk: QuoteView['currentVersion']['lines'][number]['printJobs'][number] | undefined,
): Record<string, string> {
  return {
    'bedrukking.techniek': druk?.printMethodName ?? '',
    'bedrukking.positie': druk?.position ?? '',
    'bedrukking.kleuren': druk ? String(druk.colors) : '',
  }
}

export function buildQuoteDocument(input: QuoteDocumentInput): QuoteDocument {
  const { quote, company, templates, user } = input
  const versie = quote.currentVersion
  const nu = input.at ?? new Date()

  const algemeen: Record<string, string> = {
    'bedrijf.naam': company.name,
    'bedrijf.telefoon': company.phone,
    'bedrijf.email': company.email,
    'bedrijf.website': company.website,
    'bedrijf.iban': company.iban,
    'gebruiker.naam': user.name,
    'gebruiker.email': user.email,
    'klant.naam': quote.customerName,
    'klant.nummer': input.customerNumber ?? '',
    'contact.naam': quote.contactPersonName ?? '',
    // Zonder contactpersoon de neutrale aanhef; een verzonnen naam op een
    // offerte is erger dan geen naam.
    'contact.aanhef': quote.contactPersonName
      ? `Geachte heer, mevrouw ${quote.contactPersonName}`
      : 'Geachte heer, mevrouw',
    'offerte.nummer': quote.number,
    'offerte.datum': datum(quote.createdAt),
    'offerte.geldigTot': datum(versie.validUntil, 'nader te bepalen'),
    'offerte.referentie': quote.reference ?? '',
    'offerte.totaal': formatEuro(versie.subtotalExclVat),
    'offerte.totaalInclusief': formatEuro(versie.totalInclVat),
    'offerte.betalingsvoorwaarde': input.paymentTerm ?? '',
  }

  const adres = [
    quote.customerName,
    ...(quote.contactPersonName ? [`T.a.v. ${quote.contactPersonName}`] : []),
  ]

  return {
    quoteNumber: quote.number,
    date: datum(quote.createdAt, datum(nu.toISOString())),
    validUntil: datum(versie.validUntil, 'nader te bepalen'),
    reference: quote.reference,
    addressee: adres,
    intro: templates.intro ? renderTemplate(templates.intro, algemeen) : '',
    lines: versie.lines.map((regel) => ({
      lineNumber: regel.lineNumber,
      description: omschrijving(templates.line, regel, {
        ...algemeen,
        'product.naam': regel.productName,
        'product.artikelnummer': regel.productArticleNumber ?? '',
        'product.merk': '',
        'product.materiaal': '',
        'product.afmetingen': '',
        'product.kleur': regel.variantDescription ?? '',
        'regel.aantal': String(regel.quantity),
        'regel.stuksprijs': formatEuro(regel.unitSalePrice),
      }),
      quantity: regel.quantity,
      unitPrice: regel.unitSalePrice,
      setupCost: regel.setupCost,
      lineTotal: regel.lineSubtotalExclVat,
    })),
    subtotalExclVat: versie.subtotalExclVat,
    vatAmount: versie.vatAmount,
    totalInclVat: versie.totalInclVat,
    terms: templates.terms ? renderTemplate(templates.terms, algemeen) : '',
    // Drie kolommen onderaan, zoals op briefpapier gebruikelijk is. Alles uit
    // de instellingen; een verhuizing vraagt geen nieuwe versie.
    footer: [
      [company.name, company.street, `${company.postalCode} ${company.city}`].filter(Boolean),
      [company.phone, company.email, company.website].filter(Boolean),
      [
        company.chamberOfCommerce ? `KvK ${company.chamberOfCommerce}` : '',
        company.vatNumber ? `Btw ${company.vatNumber}` : '',
        company.iban,
      ].filter(Boolean),
    ],
  }
}
