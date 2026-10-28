import {
  paginatedProductsSchema, productDetailSchema, productPickerItemSchema, productSummarySchema,
} from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const Product = registerSchema('Product', productSummarySchema)
export const ProductDetail = registerSchema('ProductDetail', productDetailSchema)
export const ProductPage = registerSchema('ProductPage', paginatedProductsSchema)
export const ProductPickerItem = registerSchema('ProductPickerItem', productPickerItemSchema)
