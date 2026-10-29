import {
  quoteLineCalculationSchema, quoteSchema, quoteSummarySchema, quoteTiersSchema,
} from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const QuoteLineCalculation = registerSchema('QuoteLineCalculation', quoteLineCalculationSchema)
export const QuoteTiers = registerSchema('QuoteTiers', quoteTiersSchema)
export const Quote = registerSchema('Quote', quoteSchema)
export const QuoteSummary = registerSchema('QuoteSummary', quoteSummarySchema)
