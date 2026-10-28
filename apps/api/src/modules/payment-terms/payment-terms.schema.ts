import { paymentTermSchema } from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const PaymentTerm = registerSchema('PaymentTerm', paymentTermSchema)
