/**
 * De vorm van de ANDA Present XML-feeds.
 *
 * Overgenomen uit de *ANDA WEB CUSTOMER EN XML and CSV feed manual* v3.2
 * (28-04-2026) en hun eigen voorbeelden. Niets is geverifieerd tegen een echt
 * bestand: de feeds zijn nog niet geactiveerd. Zie docs/leveranciers/anda.md.
 *
 * Alles is tekst en alles is optioneel. XML kent geen typen, en een enkel
 * element is niet te onderscheiden van een lijst van één element zonder
 * schema - dat schema is er niet, en het staat als vraag bij ANDA uit. De
 * connector vangt beide vormen op met `Lijst<T>`.
 */

export type Lijst<T> = T | T[] | undefined | null

// --- Product feed ----------------------------------------------------------

export interface AndaSpecificationProperty {
  type?: string
  name?: string
  values?: Lijst<{ value?: Lijst<string> }>
}

export interface AndaCategory {
  name?: string
  level?: string
  externalId?: string
  primary?: string
}

export interface AndaProduct {
  itemNumber?: string
  designName?: string
  primaryColor?: string
  primarycolorCode?: string
  secondaryColor?: string
  secondarycolorCode?: string
  /** Korte omschrijving. */
  name?: string
  /** Lange omschrijving; de handleiding noemt beide schrijfwijzen. */
  description?: string
  descriptions?: string
  primaryImage?: string
  images?: Lijst<{ image?: Lijst<string> }>
  images_modified_date?: string
  /** 1 = niet beschikbaar, 0 = beschikbaar. */
  temporarilyUnavailable?: string
  temporarilyUnavaliable?: string
  customProduction?: string
  minimumOrderQuantity?: string
  individualProductWeightGram?: string
  countryOfOrigin?: string
  tariffNumber?: string
  brandName?: string
  eanCode?: string
  /** Het hoofdartikel waar deze kleur of maat bij hoort. */
  rootItemNumber?: string
  multiple?: string
  lastModifiedDate?: string
  geographicalRestriction?: string
  /** 1 betekent: dit is een onderdeel van een samengesteld artikel. */
  assemblyProduct?: string
  specification?: Lijst<{ property?: Lijst<AndaSpecificationProperty> }>
  categories?: Lijst<{ category?: Lijst<AndaCategory> }>
  allCategories?: Lijst<{ category?: Lijst<AndaCategory> }>
  productCertificate?: Lijst<{ conformity?: Lijst<string> }>
  testReports?: Lijst<{ test_report?: Lijst<string> }>
}

export interface AndaProductFeed {
  products?: Lijst<{ product?: Lijst<AndaProduct> }>
}

// --- Price feed ------------------------------------------------------------

export interface AndaPrice {
  itemNumber?: string
  currency?: string
  amount?: string
  /** listPrice = catalogusprijs, discountPrice = onze inkoopprijs. */
  type?: string
}

export interface AndaPriceFeed {
  prices?: Lijst<{ price?: Lijst<AndaPrice> }>
}

// --- Inventory feed --------------------------------------------------------

export interface AndaInventoryRecord {
  itemNumber?: string
  /** central_stock, incoming_to_central_stock, external_stock, incoming_to_external_stock. */
  type?: string
  amount?: string
  /** 0 = gelijk aan de waarde, 1 = meer dan de waarde. */
  moreThanAmount?: string
  arrivalDate?: string
}

export interface AndaInventoryFeed {
  inventories?: Lijst<{ record?: Lijst<AndaInventoryRecord> }>
}

// --- Labeling feed ---------------------------------------------------------

export interface AndaTechnology {
  Code?: string
  Name?: string
  /** Getal 1-10, of de tekst "Full Color". */
  maxColor?: string
  maxWmm?: string
  maxHmm?: string
  maxDmm?: string
  /** 1 = vaste maat, 0 = vrij. */
  fixedSize?: string
  printTemplate?: string
}

export interface AndaPosition {
  /** Positiecode: I, II, III, ... */
  serial?: string
  posName?: string
  posImage?: string
  technologies?: Lijst<{ technology?: Lijst<AndaTechnology> }>
}

export interface AndaLabeling {
  itemNumber?: string
  printTemplate?: string
  lastModifiedDate?: string
  positions?: Lijst<{ position?: Lijst<AndaPosition> }>
}

export interface AndaLabelingFeed {
  labelings?: Lijst<{ labeling?: Lijst<AndaLabeling> }>
}
