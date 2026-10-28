import {
  customerDetailSchema, customerSummarySchema, paginatedCustomersSchema,
  createCustomerSchema, updateCustomerSchema, priceAgreementSchema,
} from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const Customer = registerSchema('Customer', customerSummarySchema)
export const CustomerDetail = registerSchema('CustomerDetail', customerDetailSchema)
export const CustomerPage = registerSchema('CustomerPage', paginatedCustomersSchema)
export const CustomerCreate = registerSchema('CustomerCreate', createCustomerSchema)
export const CustomerUpdate = registerSchema('CustomerUpdate', updateCustomerSchema)
export const PriceAgreement = registerSchema('PriceAgreement', priceAgreementSchema)
