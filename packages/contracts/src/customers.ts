import { z } from 'zod'

/**
 * Schema's voor klanten. Eén bron voor de frontend, de api en de
 * OpenAPI-documentatie (ADR-0011).
 *
 * Meldingen staan in het Nederlands omdat ze rechtstreeks in het scherm
 * terechtkomen; veldnamen blijven Engels, zoals de rest van de code.
 */

const emailVeld = () =>
  z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Dit is geen geldig e-mailadres')

/**
 * Nederlands btw-nummer: NL, negen cijfers, B, twee cijfers. Buitenlandse
 * nummers worden niet op vorm gecontroleerd - daar zijn te veel varianten van
 * om een fout af te dwingen die geen fout hoeft te zijn.
 */
const btwVeld = () =>
  z
    .string()
    .trim()
    .toUpperCase()
    .max(20, 'Een btw-nummer is hoogstens 20 tekens')
    .refine(
      (v) => !v.startsWith('NL') || /^NL\d{9}B\d{2}$/.test(v),
      'Een Nederlands btw-nummer ziet eruit als NL123456789B01',
    )

/**
 * Verplicht tekstveld met één melding voor alle manieren waarop het fout kan
 * gaan: ontbrekend, leeg, of te kort. Zonder de `error`-optie geeft een
 * ontbrekend veld een Engelse technische melding, en die komt in het scherm
 * terecht.
 */
export const verplichteTekst = (melding: string, { min = 1, max = 200 } = {}) =>
  z.string({ error: melding }).trim().min(min, melding).max(max)

export const leegNaarNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable())

export const createCustomerSchema = z.object({
  name: verplichteTekst('Vul een bedrijfsnaam in', { min: 2 }),
  vatNumber: leegNaarNull(btwVeld()).optional(),
  email: leegNaarNull(emailVeld()).optional(),
  phone: leegNaarNull(z.string().trim().max(40)).optional(),
  website: leegNaarNull(z.string().trim().max(200)).optional(),
  /// Interne opmerkingen; nooit zichtbaar in het klantportaal.
  notes: leegNaarNull(z.string().trim().max(5000)).optional(),
})

export const updateCustomerSchema = createCustomerSchema.partial()

export const customerSortSchema = z.enum(['name', 'number', 'createdAt'])
export const customerStatusSchema = z.enum(['all', 'active', 'inactive'])

export const listCustomersQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: customerStatusSchema.default('all'),
  sort: customerSortSchema.default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const customerSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  city: z.string().nullable(),
  isActive: z.boolean(),
  isDemo: z.boolean(),
  openQuotes: z.number().int(),
  activeOrders: z.number().int(),
})

export const customerContactSchema = z.object({
  id: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  jobTitle: z.string().nullable(),
  isPrimary: z.boolean(),
  isActive: z.boolean(),
})

export const customerAddressSchema = z.object({
  id: z.string(),
  type: z.enum(['INVOICE', 'DELIVERY']),
  label: z.string().nullable(),
  attention: z.string().nullable(),
  street: z.string(),
  houseNumber: z.string().nullable(),
  postalCode: z.string(),
  city: z.string(),
  country: z.string(),
  isDefault: z.boolean(),
})

export const customerDetailSchema = customerSummarySchema.extend({
  vatNumber: z.string().nullable(),
  website: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contacts: z.array(customerContactSchema),
  addresses: z.array(customerAddressSchema),
})

export const paginatedCustomersSchema = z.object({
  items: z.array(customerSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  pageCount: z.number().int(),
})

export type CreateCustomer = z.infer<typeof createCustomerSchema>
export type UpdateCustomer = z.infer<typeof updateCustomerSchema>
export type ListCustomersQuery = z.infer<typeof listCustomersQuerySchema>
export type CustomerSummary = z.infer<typeof customerSummarySchema>
export type CustomerDetail = z.infer<typeof customerDetailSchema>
export type PaginatedCustomers = z.infer<typeof paginatedCustomersSchema>
