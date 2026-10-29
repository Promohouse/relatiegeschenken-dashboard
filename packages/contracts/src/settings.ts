import { z } from 'zod'

/**
 * Instellingen: gegevens die op documenten komen en die zonder nieuwe versie
 * van de software te wijzigen moeten zijn.
 *
 * Bedrijfsgegevens horen hier en niet in de code. Een verhuizing, een nieuw
 * rekeningnummer of een andere handelsnaam is geen reden voor een release.
 */

export const settingSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  description: z.string().nullable(),
  updatedAt: z.string(),
})

export const companySettingsSchema = z.object({
  name: z.string(),
  street: z.string(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  phone: z.string(),
  email: z.string(),
  website: z.string(),
  chamberOfCommerce: z.string(),
  vatNumber: z.string(),
  iban: z.string(),
  slogan: z.string(),
  logoLight: z.string(),
  logoDark: z.string(),
  accentColor: z.string(),
})

/** Lege waarden mogen: niet elk bedrijf heeft elk gegeven. */
const tekst = (max = 200) => z.string().trim().max(max)

/**
 * De huisstijlkleur, als hexcode. Staat in de instellingen en niet in de
 * code: op documenten moet hij overeenkomen met het briefpapier, en dat is
 * geen reden voor een nieuwe versie van de software.
 */
const hexkleur = () =>
  z.string().trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'Een kleur ziet eruit als #f26701')

export const updateCompanySettingsSchema = z.object({
  name: z.string({ error: 'Vul een bedrijfsnaam in' }).trim().min(2, 'Vul een bedrijfsnaam in').max(200),
  street: tekst(),
  postalCode: tekst(20),
  city: tekst(120),
  country: tekst(80),
  phone: tekst(40),
  email: z
    .string()
    .trim()
    .refine((v) => v === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), 'Dit is geen geldig e-mailadres'),
  website: tekst(),
  chamberOfCommerce: tekst(20),
  /**
   * Btw-nummer zonder spaties; op documenten wordt het leesbaar gemaakt. Een
   * Nederlands nummer wordt op vorm gecontroleerd, buitenlandse niet - daar
   * zijn te veel varianten van.
   */
  vatNumber: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .refine(
      (v) => !v.startsWith('NL') || /^NL\d{9}B\d{2}$/.test(v.replace(/\s/g, '')),
      'Een Nederlands btw-nummer ziet eruit als NL123456789B01',
    ),
  /** IBAN zonder spaties, zodat een betaalbestand hem kan gebruiken. */
  iban: z
    .string()
    .trim()
    .toUpperCase()
    .max(34)
    .transform((v) => v.replace(/\s/g, ''))
    .refine(
      (v) => v === '' || /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v),
      'Dit is geen geldig IBAN',
    ),
  slogan: tekst(120),
  logoLight: tekst(300),
  logoDark: tekst(300),
  accentColor: hexkleur(),
})

/**
 * Verzendwijzen met wat ze kosten en wat de klant eraan bijdraagt.
 *
 * Een instelling en geen vaste lijst in de code: welke vormen er zijn en wat
 * ze kosten verschilt per vervoerder en per jaar, en dat hoort geen nieuwe
 * versie van de software te vragen.
 *
 * Twee bedragen, want het zijn twee verschillende dingen. Wat de verzending
 * ons kost drukt op de marge ook als er niets voor gerekend wordt; wat de
 * klant bijdraagt is omzet. Nul als bijdrage is hier het gewone geval.
 */
const verzendbedrag = (veld: string) =>
  z.string({ error: `Vul een bedrag in bij ${veld}` })
    .trim()
    .regex(/^\d{1,6}([.,]\d{1,2})?$/, `${veld} ziet eruit als 9,50`)
    .transform((v) => v.replace(',', '.'))

export const shippingMethodSchema = z.object({
  name: z.string(),
  cost: z.string(),
  contribution: z.string(),
})

export const shippingMethodsSchema = z.array(shippingMethodSchema)

export const updateShippingMethodsSchema = z
  .array(
    z.object({
      name: z.string({ error: 'Vul een naam in' }).trim().min(2, 'Vul een naam in').max(60),
      cost: verzendbedrag('de kostprijs'),
      contribution: verzendbedrag('de bijdrage'),
    }),
  )
  .max(20, 'Meer dan twintig verzendwijzen maakt de keuzelijst onbruikbaar')
  .superRefine((lijst, ctx) => {
    // Twee keer dezelfde naam maakt de keuzelijst onleesbaar: je ziet dan
    // twee regels "Pakket" met verschillende bedragen erachter.
    const gezien = new Set<string>()
    lijst.forEach((wijze, i) => {
      const sleutel = wijze.name.toLowerCase()
      if (gezien.has(sleutel)) {
        ctx.addIssue({ code: 'custom', message: 'Deze naam staat er al', path: [i, 'name'] })
      }
      gezien.add(sleutel)
    })
  })

export type ShippingMethod = z.infer<typeof shippingMethodSchema>
export type UpdateShippingMethods = z.infer<typeof updateShippingMethodsSchema>

export const themePreferenceSchema = z.enum(['SYSTEM', 'LIGHT', 'DARK'])

export const updateThemeSchema = z.object({ theme: themePreferenceSchema })

export type CompanySettings = z.infer<typeof companySettingsSchema>
export type UpdateCompanySettings = z.infer<typeof updateCompanySettingsSchema>
export type ThemePreference = z.infer<typeof themePreferenceSchema>
