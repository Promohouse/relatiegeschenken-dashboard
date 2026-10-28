import type { ConnectorCapability } from '@rgh/db'

/**
 * Wat elke leverancierskoppeling moet kunnen.
 *
 * Een connector haalt op en vertaalt naar één neutrale vorm. Hij schrijft
 * niets naar de catalogus: dat doet de importpijplijn, via staging
 * (ADR-0004). Zo blijft per leverancier alleen het stuk over dat werkelijk
 * verschilt - hun endpoints en hun veldnamen.
 *
 * De vorm hieronder is neutraal gekozen, niet midocean-vormig: de velden zijn
 * die van onze eigen catalogus. Wat een leverancier niet levert is null, en
 * dat is iets anders dan leeg.
 */

export interface CanonicalAsset {
  url: string
  /** image, document. */
  type: string
  /** item_picture_front, declaration_of_conformity, ... */
  subtype: string | null
  /** Versie op hoge resolutie, als de leverancier die apart aanbiedt. */
  highResUrl?: string | null
}

export interface CanonicalVariant {
  /** Sleutel bij de leverancier; stabiel over imports heen. */
  externalId: string
  /** Artikelnummer van de variant zoals de leverancier het bestelt. */
  sku: string
  colorCode: string | null
  colorName: string | null
  colorGroup: string | null
  /** Pantone-aanduiding, als die er is. */
  pmsColor: string | null
  sizeCode: string | null
  gtin: string | null
  /** Levenscyclus bij de leverancier: COLLECTION, RUN OUT, ... */
  lifecycleStatus: string | null
  images: CanonicalAsset[]
}

export interface CanonicalProduct {
  /** Sleutel bij de leverancier, bijvoorbeeld het hoofdartikelnummer. */
  externalId: string
  articleNumber: string
  name: string
  shortDescription: string | null
  longDescription: string | null
  brand: string | null
  material: string | null
  countryOfOrigin: string | null
  commodityCode: string | null
  dimensions: string | null
  /** Of er op bedrukt kan worden volgens de leverancier. */
  printable: boolean | null
  /** Categorie van grof naar fijn, zoals de leverancier hem indeelt. */
  categoryPath: string[]
  documents: CanonicalAsset[]
  variants: CanonicalVariant[]
}

/** Inkoopprijs per variant, met staffel. */
export interface CanonicalPrice {
  sku: string
  /** Als de leverancier een eigen variantsleutel meestuurt. */
  externalVariantId: string | null
  currency: string
  /** Bedrag als tekst; omzetten gebeurt met parseSupplierDecimal. */
  unitPrice: string
  validUntil: Date | null
  tiers: { minimumQuantity: number; unitPrice: string }[]
}

/** Voorraad per variant, met de eerstvolgende verwachte leveringen. */
export interface CanonicalStock {
  sku: string
  quantity: number
  firstArrivalDate: Date | null
  firstArrivalQuantity: number | null
  nextArrivalDate: Date | null
  nextArrivalQuantity: number | null
}

/**
 * Eén opgehaald record, met de onbewerkte payload erbij.
 *
 * De payload gaat mee naar `raw_supplier_products`: daarmee is achteraf na te
 * gaan wat de leverancier werkelijk stuurde, en kan een import opnieuw
 * verwerkt worden zonder de leverancier nog eens te bevragen.
 */
export interface FetchedRecord<T> {
  externalId: string
  payload: unknown
  value: T
}

export interface ConnectorContext {
  /** Niet-geheime instellingen uit `supplier_connections.config`. */
  config: Record<string, unknown>
  /** Ontsleutelde credentials. */
  credentials: Record<string, string>
}

export interface SupplierConnector {
  readonly key: string
  readonly capabilities: ConnectorCapability[]

  fetchCatalog?(context: ConnectorContext): Promise<FetchedRecord<CanonicalProduct>[]>
  fetchPrices?(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrice>[]>
  fetchStock?(context: ConnectorContext): Promise<FetchedRecord<CanonicalStock>[]>
}

/**
 * Een fout van de leverancier, met de verzochte bron erbij.
 *
 * Deze draagt bewust de leveranciersmelding mee: bij een koppeling is de
 * tekst van de ander meestal het enige aanknopingspunt.
 */
export class ConnectorError extends Error {
  constructor(
    readonly connector: string,
    readonly bron: string,
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ConnectorError'
  }
}
