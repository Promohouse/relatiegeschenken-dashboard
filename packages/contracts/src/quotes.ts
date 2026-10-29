import { z } from 'zod'
import { leegNaarNull } from './customers'
import { calculateQuoteLineSchema } from './quote-calculation'

/**
 * Schema's voor de offerte als document.
 *
 * De calculatie zelf staat in `quote-calculation.ts` en wordt hier hergebruikt:
 * een offerteregel is een calculatie die bewaard is. Zou de offerte een eigen
 * invoervorm krijgen, dan kan het scherm iets anders uitrekenen dan wat er
 * uiteindelijk in de offerte komt - en dat merk je pas bij de factuur.
 */

export const QUOTE_STATUSES = [
  'DRAFT', 'READY_TO_SEND', 'SENT', 'AWAITING_CUSTOMER', 'CHANGES_REQUESTED',
  'ACCEPTED', 'REJECTED', 'EXPIRED',
] as const

export const createQuoteSchema = z.object({
  customerId: z.string({ error: 'Kies een klant' }).uuid('Kies een klant'),
  contactPersonId: leegNaarNull(z.string().uuid()).optional(),
  reference: leegNaarNull(z.string().trim().max(200)).optional(),
  requestedDeliveryDate: leegNaarNull(z.coerce.date()).optional(),
  vatRegime: z.enum(['DOMESTIC', 'EU_REVERSE_CHARGE', 'EXPORT']).default('DOMESTIC'),
  /** Tekst die de klant op de offerte ziet. */
  customerNotes: leegNaarNull(z.string().trim().max(5000)).optional(),
  deliveryTerms: leegNaarNull(z.string().trim().max(500)).optional(),
  /** Interne opmerkingen, nooit zichtbaar voor de klant. */
  notes: leegNaarNull(z.string().trim().max(5000)).optional(),
})

/**
 * Een regel toevoegen is hetzelfde als doorrekenen, plus wat er op papier
 * komt. De klant komt van de offerte en niet uit de invoer: anders kan er
 * geprijsd worden voor de ene klant en gefactureerd aan de andere.
 */
export const addQuoteLineSchema = calculateQuoteLineSchema
  .omit({ customerId: true })
  .extend({
    /** Eigen omschrijving op de offerte; leeg betekent de productnaam. */
    description: leegNaarNull(z.string().trim().max(500)).optional(),
    notes: leegNaarNull(z.string().trim().max(1000)).optional(),
  })

export const updateQuoteSchema = z.object({
  contactPersonId: leegNaarNull(z.string().uuid()).optional(),
  reference: leegNaarNull(z.string().trim().max(200)).optional(),
  requestedDeliveryDate: leegNaarNull(z.coerce.date()).optional(),
  customerNotes: leegNaarNull(z.string().trim().max(5000)).optional(),
  deliveryTerms: leegNaarNull(z.string().trim().max(500)).optional(),
  notes: leegNaarNull(z.string().trim().max(5000)).optional(),
})

export const quotePrintJobSchema = z.object({
  printMethodName: z.string(),
  position: z.string().nullable(),
  colors: z.number().int(),
  unitPrice: z.string(),
  setupCost: z.string(),
})

export const quoteLineSchema = z.object({
  id: z.string(),
  lineNumber: z.number().int(),
  productId: z.string().nullable(),
  productArticleNumber: z.string().nullable(),
  productName: z.string(),
  description: z.string().nullable(),
  supplierName: z.string().nullable(),
  quantity: z.number().int(),
  unitSalePrice: z.string(),
  unitPurchasePrice: z.string(),
  discountPercent: z.string(),
  setupCost: z.string(),
  vatRate: z.string(),
  lineSubtotalExclVat: z.string(),
  lineVatAmount: z.string(),
  lineTotalInclVat: z.string(),
  linePurchaseTotal: z.string(),
  lineMarginAmount: z.string(),
  notes: z.string().nullable(),
  printJobs: z.array(quotePrintJobSchema),
})

export const quoteVersionSchema = z.object({
  id: z.string(),
  versionNumber: z.number().int(),
  validUntil: z.string().nullable(),
  vatRegime: z.string(),
  currency: z.string(),
  subtotalExclVat: z.string(),
  vatAmount: z.string(),
  totalInclVat: z.string(),
  purchaseTotal: z.string(),
  marginAmount: z.string(),
  /** Marge als percentage van het subtotaal. Berekend, niet opgeslagen. */
  marginPercent: z.string(),
  deliveryTerms: z.string().nullable(),
  customerNotes: z.string().nullable(),
  /**
   * Gezet bij verzenden. Vanaf dat moment weigeren de databasetriggers elke
   * wijziging aan deze versie (ADR-0007).
   */
  lockedAt: z.string().nullable(),
  sentAt: z.string().nullable(),
  lines: z.array(quoteLineSchema),
})

export const quoteSchema = z.object({
  id: z.string(),
  number: z.string(),
  status: z.enum(QUOTE_STATUSES),
  customerId: z.string(),
  customerName: z.string(),
  contactPersonId: z.string().nullable(),
  contactPersonName: z.string().nullable(),
  reference: z.string().nullable(),
  requestedDeliveryDate: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  currentVersion: quoteVersionSchema,
})

export const quoteSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  status: z.enum(QUOTE_STATUSES),
  customerName: z.string(),
  reference: z.string().nullable(),
  versionNumber: z.number().int(),
  lineCount: z.number().int(),
  totalInclVat: z.string(),
  validUntil: z.string().nullable(),
  createdAt: z.string(),
})

export type CreateQuote = z.infer<typeof createQuoteSchema>
export type UpdateQuote = z.infer<typeof updateQuoteSchema>
export type AddQuoteLine = z.infer<typeof addQuoteLineSchema>
export type QuoteView = z.infer<typeof quoteSchema>
export type QuoteSummary = z.infer<typeof quoteSummarySchema>
export type QuoteLineView = z.infer<typeof quoteLineSchema>
