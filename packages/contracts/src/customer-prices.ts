import { z } from 'zod'
import { leegNaarNull, verplichteTekst } from './customers'

/**
 * Schema's voor klantprijsafspraken. Het rekenwerk en de voorrang staan in
 * `pricing.ts`; dit is alleen de invoer en de weergave.
 */

/**
 * Een bedrag als tekst, niet als number. Een bedrag door een JavaScript-float
 * halen is precies wat harde regel 2 verbiedt: 0.1 + 0.2 is daar geen 0.3.
 * De database bewaart NUMERIC(14,4), dus hoogstens vier decimalen.
 */
const bedragVeld = () =>
  verplichteTekst('Vul een prijs in', { max: 20 })
    .regex(/^\d+([.,]\d{1,4})?$/, 'Een prijs ziet eruit als 12.3450, met hoogstens vier decimalen')
    .transform((v) => v.replace(',', '.'))

/**
 * Een venster dat eindigt voordat het begint is geen afspraak maar een
 * typefout. De database weigert het ook (een check-constraint), maar dan komt
 * er een serverfout uit en geen melding bij het veld.
 */
const geldigVenster = <T extends z.ZodType<{ validFrom?: Date | null; validTo?: Date | null }>>(schema: T) =>
  schema.refine(
    (v) => !v.validFrom || !v.validTo || v.validTo.getTime() >= v.validFrom.getTime(),
    { error: 'De einddatum ligt voor de begindatum', path: ['validTo'] },
  )

const priceAgreementVelden = {
  productId: z.string({ error: 'Kies een product' }).uuid('Kies een product'),
  minQuantity: z.coerce
    .number({ error: 'Vul een aantal in' })
    .int('Het aantal is een heel getal')
    .min(1, 'Een afspraak geldt vanaf ten minste 1 stuk')
    .max(1_000_000),
  unitPrice: bedragVeld(),
  note: leegNaarNull(z.string().trim().max(500)).optional(),
  validFrom: leegNaarNull(z.coerce.date()).optional(),
  validTo: leegNaarNull(z.coerce.date()).optional(),
  isActive: z.coerce.boolean().default(true),
}

export const createPriceAgreementSchema = geldigVenster(z.object(priceAgreementVelden))

/**
 * Het product en de drempel liggen vast na aanmaken: samen zijn ze de sleutel
 * van de afspraak. Een andere drempel is een andere afspraak.
 *
 * Met de hand uitgeschreven en niet als `.partial()`: dat laat `.default()`
 * staan, waardoor een wijziging van alleen de prijs de afspraak ook weer op
 * actief zou zetten. Zie de toelichting bij updatePaymentTermSchema.
 */
export const updatePriceAgreementSchema = geldigVenster(
  z.object({
    unitPrice: bedragVeld().optional(),
    note: leegNaarNull(z.string().trim().max(500)).optional(),
    validFrom: leegNaarNull(z.coerce.date()).optional(),
    validTo: leegNaarNull(z.coerce.date()).optional(),
    isActive: z.coerce.boolean().optional(),
  }),
)

export const priceAgreementSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  productArticleNumber: z.string(),
  minQuantity: z.number().int(),
  unitPrice: z.string(),
  note: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  isActive: z.boolean(),
  /**
   * Of deze afspraak vandaag meedoet. Een afspraak kan actief staan en toch
   * buiten zijn geldigheidsvenster vallen; in het scherm is dat verschil
   * belangrijk, anders lijkt een afspraak te werken die dat niet doet.
   */
  appliesToday: z.boolean(),
})

export type CreatePriceAgreement = z.infer<typeof createPriceAgreementSchema>
export type UpdatePriceAgreement = z.infer<typeof updatePriceAgreementSchema>
export type PriceAgreementView = z.infer<typeof priceAgreementSchema>

/** Zoekresultaat voor de productkiezer in het afsprakenformulier. */
export const productPickerItemSchema = z.object({
  id: z.string(),
  articleNumber: z.string(),
  name: z.string(),
  isActive: z.boolean(),
})

export type ProductPickerItem = z.infer<typeof productPickerItemSchema>
