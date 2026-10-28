import Decimal from 'decimal.js'
import { z } from 'zod'
import { round2 } from './money'
import { leegNaarNull, verplichteTekst } from './customers'

/**
 * Betalingsvoorwaarden: wanneer een factuur vervalt, en of er vooraf betaald
 * moet worden.
 *
 * De berekening staat hier en niet in het factuurscherm, want dezelfde datum
 * wordt straks gebruikt door de factuur-PDF, de herinneringsjob en de
 * SnelStart-koppeling. Drie implementaties van "einde maand plus dertig" is
 * hoe je verschillen tussen scherm en boekhouding krijgt (harde regel 11).
 */

export interface PaymentTerm {
  /** Dagen na de factuurdatum, of na de laatste dag van de factuurmaand. */
  days: number
  /** Rekent vanaf de laatste dag van de factuurmaand: "einde maand + 30". */
  endOfMonth: boolean
  /** Deel dat vooraf betaald moet zijn, als percentage. */
  prepaymentPercent?: Decimal.Value | null
}

/** De laatste dag van de maand waarin deze datum valt, op dezelfde klok. */
function laatsteDagVanDeMaand(datum: Date): Date {
  return new Date(
    Date.UTC(
      datum.getUTCFullYear(),
      datum.getUTCMonth() + 1,
      0,
      datum.getUTCHours(),
      datum.getUTCMinutes(),
      datum.getUTCSeconds(),
      datum.getUTCMilliseconds(),
    ),
  )
}

/**
 * De vervaldatum van een factuur.
 *
 * In UTC gerekend en per dag opgeteld, zodat zomertijd de vervaldag niet
 * verschuift: 29 maart plus 30 dagen moet 28 april zijn, niet 27 april 23:00.
 */
export function calculateDueDate(invoiceDate: Date, term: PaymentTerm): Date {
  const basis = term.endOfMonth ? laatsteDagVanDeMaand(invoiceDate) : invoiceDate
  const vervalt = new Date(basis.getTime())
  vervalt.setUTCDate(vervalt.getUTCDate() + term.days)
  return vervalt
}

/** Is deze factuur te laat op de peildatum? Op de vervaldag zelf niet. */
export function isOverdue(dueDate: Date, at: Date = new Date()): boolean {
  return at.getTime() > dueDate.getTime()
}

/**
 * Het bedrag dat vooraf betaald moet zijn. Nul als de voorwaarde geen
 * vooruitbetaling vraagt - niet null, want de aanroeper hoort hiermee te
 * kunnen rekenen zonder te controleren.
 */
export function calculatePrepayment(total: Decimal.Value, term: PaymentTerm): Decimal {
  if (term.prepaymentPercent == null) return new Decimal(0)
  return round2(new Decimal(total).times(new Decimal(term.prepaymentPercent).dividedBy(100)))
}

/**
 * Hoe de voorwaarde op een document komt te staan. Eigen tekst gaat voor;
 * anders een opbouw uit de velden, zodat een nieuwe voorwaarde zonder tekst
 * nooit leeg op een factuur belandt.
 */
export function describePaymentTerm(term: PaymentTerm & { invoiceText?: string | null }): string {
  if (term.invoiceText) return term.invoiceText

  const delen: string[] = []
  if (term.prepaymentPercent != null && !new Decimal(term.prepaymentPercent).isZero()) {
    delen.push(`${new Decimal(term.prepaymentPercent).toString()}% vooruit`)
  }
  const dagen = term.days === 1 ? '1 dag' : `${term.days} dagen`
  delen.push(term.endOfMonth ? `${dagen} na einde maand` : `${dagen} netto`)
  return delen.join(', ')
}

// --- Schema's --------------------------------------------------------------

/** Sleutel voor code en koppelingen; wijzigt niet meer na aanmaken. */
const voorwaardeSleutel = () =>
  verplichteTekst('Vul een sleutel in', { max: 50 }).regex(
    /^[a-z][a-z0-9_-]*$/,
    'Een sleutel bestaat uit kleine letters, cijfers, liggende streepjes en koppeltekens, en begint met een letter',
  )

export const createPaymentTermSchema = z.object({
  key: voorwaardeSleutel(),
  name: verplichteTekst('Vul een naam in', { min: 2, max: 100 }),
  days: z.coerce
    .number({ error: 'Vul een aantal dagen in' })
    .int('Het aantal dagen is een heel getal')
    .min(0, 'Een negatief aantal dagen bestaat niet')
    .max(365, 'Meer dan een jaar is geen betalingsvoorwaarde'),
  endOfMonth: z.coerce.boolean().default(false),
  prepaymentPercent: leegNaarNull(
    z.coerce
      .number()
      .min(0, 'Een percentage is niet negatief')
      .max(100, 'Meer dan 100% vooruit kan niet'),
  ).optional(),
  invoiceText: leegNaarNull(z.string().trim().max(300)).optional(),
  isDefault: z.coerce.boolean().default(false),
  isActive: z.coerce.boolean().default(true),
  sort: z.coerce.number().int().min(0).max(9999).default(100),
})

/**
 * De wijzigingsvariant staat er met de hand, niet als `.partial()` van de
 * aanmaakvariant.
 *
 * `.partial()` maakt een veld optioneel maar laat `.default()` staan: een
 * PATCH met alleen een naam zou `endOfMonth` op false, `sort` op 100 en de
 * standaardvlag op false zetten. Dat is stil gegevensverlies, en het haalde
 * ook echt de standaard onder een voorwaarde vandaan.
 *
 * De sleutel staat er niet in: die ligt vast na aanmaken.
 */
export const updatePaymentTermSchema = z.object({
  name: verplichteTekst('Vul een naam in', { min: 2, max: 100 }).optional(),
  days: z.coerce
    .number({ error: 'Vul een aantal dagen in' })
    .int('Het aantal dagen is een heel getal')
    .min(0, 'Een negatief aantal dagen bestaat niet')
    .max(365, 'Meer dan een jaar is geen betalingsvoorwaarde')
    .optional(),
  endOfMonth: z.coerce.boolean().optional(),
  prepaymentPercent: leegNaarNull(
    z.coerce
      .number()
      .min(0, 'Een percentage is niet negatief')
      .max(100, 'Meer dan 100% vooruit kan niet'),
  ).optional(),
  invoiceText: leegNaarNull(z.string().trim().max(300)).optional(),
  isDefault: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional(),
  sort: z.coerce.number().int().min(0).max(9999).optional(),
})

export const paymentTermSchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  days: z.number().int(),
  endOfMonth: z.boolean(),
  prepaymentPercent: z.string().nullable(),
  invoiceText: z.string().nullable(),
  isDefault: z.boolean(),
  isActive: z.boolean(),
  sort: z.number().int(),
  /** Hoeveel klanten deze voorwaarde hebben; bepaalt of hij weg kan. */
  customerCount: z.number().int(),
  /** De beschrijving zoals die op een document komt. */
  description: z.string(),
})

export type CreatePaymentTerm = z.infer<typeof createPaymentTermSchema>
export type UpdatePaymentTerm = z.infer<typeof updatePaymentTermSchema>
export type PaymentTermView = z.infer<typeof paymentTermSchema>
