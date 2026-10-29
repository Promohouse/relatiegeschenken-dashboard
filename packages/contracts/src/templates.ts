import { z } from 'zod'

/**
 * Tekstsjablonen met dynamische velden.
 *
 * Een sjabloon is gewone tekst met velden ertussen: `{{klant.naam}}`. Geen
 * sjabloontaal met voorwaarden en lussen - die worden onleesbaar voor wie ze
 * moet onderhouden, en onvoorspelbaar voor wie het document ontvangt.
 *
 * De velden die mogen worden bij het opslaan gecontroleerd. Dat is bewust aan
 * de invoerkant: een onbekend veld hoort opgemerkt te worden door degene die
 * de tekst schrijft, niet door de klant die een offerte krijgt met
 * `{{klnat.naam}}` erin.
 */

export type TemplateKind = 'QUOTE_INTRO' | 'QUOTE_TERMS' | 'QUOTE_LINE' | 'QUOTE_EMAIL'

export interface TemplateVariable {
  /** Zoals het in de tekst staat, zonder accolades. */
  naam: string
  /** Wat erin komt, in gewone woorden. */
  uitleg: string
  /** Voorbeeldwaarde voor de proefweergave. */
  voorbeeld: string
}

const BEDRIJF: TemplateVariable[] = [
  { naam: 'bedrijf.naam', uitleg: 'Onze bedrijfsnaam', voorbeeld: 'Promohouse BV' },
  { naam: 'bedrijf.telefoon', uitleg: 'Ons telefoonnummer', voorbeeld: '055 578 88 05' },
  { naam: 'bedrijf.email', uitleg: 'Ons e-mailadres', voorbeeld: 'info@promohouse.nl' },
  { naam: 'bedrijf.website', uitleg: 'Onze website', voorbeeld: 'www.promohouse.nl' },
  { naam: 'bedrijf.iban', uitleg: 'Ons rekeningnummer', voorbeeld: 'NL39RABO0172495423' },
]

const GEBRUIKER: TemplateVariable[] = [
  { naam: 'gebruiker.naam', uitleg: 'Wie de offerte maakt', voorbeeld: 'Michiel Mikkers' },
  { naam: 'gebruiker.email', uitleg: 'Diens e-mailadres', voorbeeld: 'michiel@promohouse.nl' },
]

const KLANT: TemplateVariable[] = [
  { naam: 'klant.naam', uitleg: 'Bedrijfsnaam van de klant', voorbeeld: 'Bouwgroep Nederland BV' },
  { naam: 'klant.nummer', uitleg: 'Klantnummer', voorbeeld: '10001' },
  { naam: 'contact.naam', uitleg: 'Naam van de contactpersoon', voorbeeld: 'Erik Groothedde' },
  { naam: 'contact.aanhef', uitleg: 'Geachte heer, mevrouw of de naam', voorbeeld: 'Geachte heer Groothedde' },
]

const OFFERTE: TemplateVariable[] = [
  { naam: 'offerte.nummer', uitleg: 'Offertenummer', voorbeeld: 'OFF-2026-00042' },
  { naam: 'offerte.datum', uitleg: 'Datum van de offerte', voorbeeld: '29 oktober 2026' },
  { naam: 'offerte.geldigTot', uitleg: 'Tot wanneer de offerte geldt', voorbeeld: '28 november 2026' },
  { naam: 'offerte.referentie', uitleg: 'Referentie van de klant', voorbeeld: 'Kerstactie 2026' },
  { naam: 'offerte.totaal', uitleg: 'Totaalbedrag exclusief btw', voorbeeld: '€ 2.205,00' },
  { naam: 'offerte.totaalInclusief', uitleg: 'Totaalbedrag inclusief btw', voorbeeld: '€ 2.668,05' },
  { naam: 'offerte.betalingsvoorwaarde', uitleg: 'De betalingsvoorwaarde van deze klant', voorbeeld: '30 dagen netto' },
]

const REGEL: TemplateVariable[] = [
  { naam: 'product.naam', uitleg: 'Naam van het product', voorbeeld: 'BASICS' },
  { naam: 'product.artikelnummer', uitleg: 'Ons artikelnummer', voorbeeld: 'AR1253' },
  { naam: 'product.merk', uitleg: 'Merk', voorbeeld: 'midocean' },
  { naam: 'product.materiaal', uitleg: 'Materiaal', voorbeeld: 'ABS' },
  { naam: 'product.afmetingen', uitleg: 'Afmetingen', voorbeeld: '12X6X1 CM' },
  { naam: 'product.kleur', uitleg: 'Gekozen kleur', voorbeeld: 'zwart' },
  { naam: 'regel.aantal', uitleg: 'Aantal stuks', voorbeeld: '250' },
  { naam: 'regel.stuksprijs', uitleg: 'Prijs per stuk inclusief bedrukking', voorbeeld: '€ 8,82' },
  { naam: 'bedrukking.techniek', uitleg: 'Bedrukkingstechniek', voorbeeld: 'Tampondruk' },
  { naam: 'bedrukking.positie', uitleg: 'Waar er bedrukt wordt', voorbeeld: 'Voorzijde' },
  { naam: 'bedrukking.kleuren', uitleg: 'Aantal drukkleuren', voorbeeld: '2' },
]

/** Welke velden in welk soort sjabloon gebruikt mogen worden. */
export const TEMPLATE_VARIABLES: Record<TemplateKind, TemplateVariable[]> = {
  QUOTE_INTRO: [...OFFERTE, ...KLANT, ...GEBRUIKER, ...BEDRIJF],
  QUOTE_TERMS: [...OFFERTE, ...KLANT, ...GEBRUIKER, ...BEDRIJF],
  QUOTE_LINE: [...REGEL, ...OFFERTE, ...KLANT],
  QUOTE_EMAIL: [...OFFERTE, ...KLANT, ...GEBRUIKER, ...BEDRIJF],
}

/** Alle velden die in een tekst staan, in volgorde van voorkomen. */
export function findPlaceholders(tekst: string): string[] {
  return [...tekst.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1])
}

/** Velden die in deze tekst staan maar niet bij dit soort sjabloon horen. */
export function unknownPlaceholders(tekst: string, kind: TemplateKind): string[] {
  const toegestaan = new Set(TEMPLATE_VARIABLES[kind].map((v) => v.naam))
  return [...new Set(findPlaceholders(tekst))].filter((naam) => !toegestaan.has(naam))
}

/**
 * De tekst met de velden ingevuld.
 *
 * Een veld zonder waarde wordt leeg, geen lege accolades: dat is wat je wilt
 * bij een referentie die een klant niet heeft opgegeven. Een veld dat
 * helemaal niet bestaat kan hier niet meer voorkomen, want het opslaan laat
 * het niet toe.
 *
 * Twee opruimregels zorgen dat een leeg veld geen rommel achterlaat:
 *
 * - een veld dat leeg blijft slikt de spatie ervoor op, zodat
 *   `{{voornaam}} {{achternaam}},` geen "Erik ," oplevert;
 * - een regel die door lege velden helemaal leeg raakt verdwijnt. Een regel
 *   die in het sjabloon al leeg was blijft staan: dat is de witregel tussen
 *   twee alinea's, en die is bedoeld.
 */
export function renderTemplate(tekst: string, waarden: Record<string, string | null | undefined>): string {
  const vulIn = (regel: string) =>
    regel.replace(/([ \t]?)\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_, spatie: string, naam: string) => {
      const waarde = waarden[naam]
      const leeg = waarde === null || waarde === undefined || String(waarde) === ''
      return leeg ? '' : `${spatie}${String(waarde)}`
    })

  return tekst
    .split('\n')
    .map((regel) => ({ origineel: regel, ingevuld: vulIn(regel).trimEnd() }))
    .filter(({ origineel, ingevuld }) => {
      // Alleen weghalen wat leeg wérd; een al lege regel is een witregel.
      if (ingevuld !== '') return true
      return origineel.trim() === ''
    })
    .map(({ ingevuld }) => ingevuld)
    .join('\n')
    .trim()
}

/** Voorbeeldwaarden om een sjabloon mee te tonen in het beheerscherm. */
export function exampleValues(kind: TemplateKind): Record<string, string> {
  return Object.fromEntries(TEMPLATE_VARIABLES[kind].map((v) => [v.naam, v.voorbeeld]))
}

// --- Schema's --------------------------------------------------------------

export const templateKindSchema = z.enum(['QUOTE_INTRO', 'QUOTE_TERMS', 'QUOTE_LINE', 'QUOTE_EMAIL'])

export const templateSchema = z.object({
  id: z.string(),
  key: z.string(),
  kind: templateKindSchema,
  name: z.string(),
  description: z.string().nullable(),
  subject: z.string().nullable(),
  body: z.string(),
  isSystem: z.boolean(),
  isActive: z.boolean(),
  updatedAt: z.string(),
  /** De velden die in dit soort sjabloon gebruikt mogen worden. */
  variables: z.array(
    z.object({ naam: z.string(), uitleg: z.string(), voorbeeld: z.string() }),
  ),
  /** De tekst met voorbeeldwaarden ingevuld. */
  preview: z.object({ subject: z.string().nullable(), body: z.string() }),
})

export const updateTemplateSchema = z.object({
  name: z.string({ error: 'Vul een naam in' }).trim().min(2, 'Vul een naam in').max(120),
  description: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(300).nullable(),
  ).optional(),
  subject: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(300).nullable(),
  ).optional(),
  body: z.string({ error: 'Vul een tekst in' }).max(10000),
  isActive: z.coerce.boolean().optional(),
})

export type TemplateView = z.infer<typeof templateSchema>
export type UpdateTemplate = z.infer<typeof updateTemplateSchema>
