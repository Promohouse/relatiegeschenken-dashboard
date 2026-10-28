/**
 * De vorm waarin midocean antwoordt.
 *
 * Overgenomen uit hun API implementation guide v1.12.2, hoofdstukken Product
 * Information 2.0, Product Pricelist 2.0 en Stock Information 2.0. Alle velden
 * zijn optioneel getypeerd: dit is data van buiten, en een ontbrekend veld
 * hoort een nette melding te geven en geen TypeError.
 *
 * Zie docs/leveranciers/midocean.md. Niets hier is geraden; wat onbekend is
 * staat in de vragenlijst in dat document.
 */

export interface MidoceanAsset {
  url?: string
  url_highress?: string
  type?: string
  subtype?: string
}

export interface MidoceanVariant {
  variant_id?: string
  sku?: string
  release_date?: string
  product_proposition_category?: string
  category_level1?: string
  category_level2?: string
  category_level3?: string
  color_description?: string
  color_group?: string
  plc_status?: string
  plc_status_description?: string
  gtin?: string
  color_code?: string
  pms_color?: string
  size_textile?: string
  digital_assets?: MidoceanAsset[]
}

export interface MidoceanProduct {
  master_code?: string
  master_id?: string
  type_of_products?: string
  commodity_code?: string
  number_of_print_positions?: string
  country_of_origin?: string
  brand?: string
  product_name?: string
  category_code?: string
  product_class?: string
  dimensions?: string
  short_description?: string
  long_description?: string
  material?: string
  green?: string
  printable?: string
  polybag?: string
  digital_assets?: MidoceanAsset[]
  variants?: MidoceanVariant[]
}

export interface MidoceanPriceScale {
  minimum_quantity?: string
  price?: string
}

export interface MidoceanPrice {
  sku?: string
  variant_id?: string
  price?: string
  valid_until?: string
  scale?: MidoceanPriceScale[]
}

export interface MidoceanPricelist {
  currency?: string
  date?: string
  price?: MidoceanPrice[]
}

export interface MidoceanStockItem {
  sku?: string
  qty?: number | string
  first_arrival_date?: string
  first_arrival_qty?: number | string
  next_arrival_date?: string
  next_arrival_qty?: number | string
}

export interface MidoceanStockResponse {
  modified_at?: string
  stock?: MidoceanStockItem[]
}
