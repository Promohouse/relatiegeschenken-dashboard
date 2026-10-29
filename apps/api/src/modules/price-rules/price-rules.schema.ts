import { priceRuleSchema } from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const PriceRule = registerSchema('PriceRule', priceRuleSchema)
