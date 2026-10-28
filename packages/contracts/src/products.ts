import { z } from 'zod'

/**
 * Schema's voor de productcatalogus.
 *
 * Producten komen voorlopig uit imports; handmatig aanmaken volgt later. Deze
 * schema's beschrijven dus vooral wat er te zien is.
 */

export const productSortSchema = z.enum(['name', 'articleNumber', 'updatedAt'])
export const productStatusSchema = z.enum(['all', 'active', 'inactive'])

export const listProductsQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: productStatusSchema.default('all'),
  /** Filteren op leverancier, op code. */
  supplier: z.string().trim().min(1).max(40).optional(),
  sort: productSortSchema.default('name'),
  direction: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const productSummarySchema = z.object({
  id: z.string(),
  articleNumber: z.string(),
  name: z.string(),
  brand: z.string().nullable(),
  categoryName: z.string().nullable(),
  isActive: z.boolean(),
  isDemo: z.boolean(),
  variantCount: z.number().int(),
  /** Voorkeursleverancier met zijn inkoopprijs; null als er geen is. */
  supplierName: z.string().nullable(),
  supplierArticleNumber: z.string().nullable(),
  purchasePrice: z.string().nullable(),
  currency: z.string().nullable(),
})

export const productVariantSchema = z.object({
  id: z.string(),
  sku: z.string(),
  colorName: z.string().nullable(),
  colorCode: z.string().nullable(),
  colorGroup: z.string().nullable(),
  pmsColor: z.string().nullable(),
  size: z.string().nullable(),
  eanCode: z.string().nullable(),
  isActive: z.boolean(),
})

export const productSupplierSchema = z.object({
  id: z.string(),
  supplierName: z.string(),
  supplierCode: z.string(),
  supplierArticleNumber: z.string(),
  purchasePrice: z.string(),
  currency: z.string(),
  minimumOrderQuantity: z.number().int(),
  leadTimeDays: z.number().int().nullable(),
  isPreferred: z.boolean(),
  isActive: z.boolean(),
  tiers: z.array(z.object({ minQuantity: z.number().int(), unitPrice: z.string() })),
})

export const productPrintOptionSchema = z.object({
  id: z.string(),
  printMethodName: z.string(),
  printPositionName: z.string(),
  /** Benaming van de leverancier, bewaard om terug te kunnen vertalen. */
  supplierLabel: z.string().nullable(),
  maxColors: z.number().int(),
  /** Maximale bedrukkingsafmeting, vrije tekst zoals leveranciers die geven. */
  printArea: z.string().nullable(),
  setupCost: z.string(),
})

export const productDetailSchema = productSummarySchema.extend({
  description: z.string().nullable(),
  material: z.string().nullable(),
  dimensions: z.string().nullable(),
  countryOfOrigin: z.string().nullable(),
  commodityCode: z.string().nullable(),
  printable: z.boolean().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  variants: z.array(productVariantSchema),
  suppliers: z.array(productSupplierSchema),
  printOptions: z.array(productPrintOptionSchema),
  /** Verkoopstaffels, als die er zijn. */
  salesTiers: z.array(z.object({ minQuantity: z.number().int(), unitPrice: z.string() })),
})

export const paginatedProductsSchema = z.object({
  items: z.array(productSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  pageCount: z.number().int(),
})

export type ListProductsQuery = z.infer<typeof listProductsQuerySchema>
export type ProductSummary = z.infer<typeof productSummarySchema>
export type ProductDetail = z.infer<typeof productDetailSchema>
export type ProductVariantView = z.infer<typeof productVariantSchema>
export type PaginatedProducts = z.infer<typeof paginatedProductsSchema>
