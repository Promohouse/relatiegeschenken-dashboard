import { z } from 'zod'
import { leegNaarNull, verplichteTekst } from './customers'

/**
 * Contactpersonen en adressen van een klant.
 *
 * Nederlandse postcodes worden op vorm gecontroleerd en genormaliseerd naar
 * "1234 AB". Buitenlandse niet: daar is geen enkele vorm voor af te dwingen
 * die overal klopt.
 */

const emailVeld = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Dit is geen geldig e-mailadres')

export const createContactSchema = z.object({
  firstName: verplichteTekst('Vul een voornaam in', { max: 80 }),
  lastName: verplichteTekst('Vul een achternaam in', { max: 120 }),
  email: leegNaarNull(emailVeld()).optional(),
  phone: leegNaarNull(z.string().trim().max(40)).optional(),
  jobTitle: leegNaarNull(z.string().trim().max(120)).optional(),
  /** Er is hoogstens één hoofdcontact per klant; de service regelt dat. */
  isPrimary: z.boolean().optional(),
})

export const updateContactSchema = createContactSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const addressTypeSchema = z.enum(['INVOICE', 'DELIVERY'])

/** 1234 AB, met of zonder spatie ingevoerd. */
const nlPostcode = /^[1-9][0-9]{3}\s?[A-Za-z]{2}$/

export const createAddressSchema = z
  .object({
    type: addressTypeSchema,
    label: leegNaarNull(z.string().trim().max(80)).optional(),
    attention: leegNaarNull(z.string().trim().max(120)).optional(),
    street: verplichteTekst('Vul een straatnaam in', { min: 2 }),
    houseNumber: leegNaarNull(z.string().trim().max(20)).optional(),
    postalCode: verplichteTekst('Vul een postcode in', { min: 2, max: 20 }),
    city: verplichteTekst('Vul een plaats in', { min: 2, max: 120 }),
    country: z.string().trim().length(2, 'Gebruik een landcode van twee letters').toUpperCase().default('NL'),
    isDefault: z.boolean().optional(),
  })
  .transform((adres) => ({
    ...adres,
    // Nederlandse postcode netjes wegschrijven, ongeacht hoe hij is ingetikt.
    postalCode:
      adres.country === 'NL' && nlPostcode.test(adres.postalCode)
        ? `${adres.postalCode.replace(/\s/g, '').slice(0, 4)} ${adres.postalCode
            .replace(/\s/g, '')
            .slice(4)
            .toUpperCase()}`
        : adres.postalCode,
  }))
  .refine(
    (adres) => adres.country !== 'NL' || nlPostcode.test(adres.postalCode),
    { message: 'Een Nederlandse postcode ziet eruit als 1234 AB', path: ['postalCode'] },
  )

export const updateAddressSchema = z.object({
  type: addressTypeSchema.optional(),
  label: leegNaarNull(z.string().trim().max(80)).optional(),
  attention: leegNaarNull(z.string().trim().max(120)).optional(),
  street: z.string().trim().min(2, 'Vul een straatnaam in').max(200).optional(),
  houseNumber: leegNaarNull(z.string().trim().max(20)).optional(),
  postalCode: z.string().trim().min(2).max(20).optional(),
  city: z.string().trim().min(2, 'Vul een plaats in').max(120).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  isDefault: z.boolean().optional(),
})

export type CreateContact = z.infer<typeof createContactSchema>
export type UpdateContact = z.infer<typeof updateContactSchema>
export type CreateAddress = z.infer<typeof createAddressSchema>
export type UpdateAddress = z.infer<typeof updateAddressSchema>
export type AddressType = z.infer<typeof addressTypeSchema>
