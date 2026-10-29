import type { ConnectorCapability } from '@rgh/db'
import type { PrintPricingType, PrintVarCost } from '@rgh/contracts'
import { IntegrationError } from '../errors/domain-errors'

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
  /**
   * Minimum aantal voor bedrukken. Onder dit aantal rekent de leverancier een
   * toeslag; die staat bij de drukprijzen als `ltmCharge`.
   *
   * Staat hier en niet bij de drukgegevens omdat PF Concept het in de
   * prijsfeed levert, per artikel. Null betekent: de leverancier zegt er
   * niets over.
   */
  minDecoQuantity?: number | null
  /**
   * De drukcodes die voor dit artikel gelden, als de leverancier ze bij de
   * prijs levert. Verwijzen naar de codes in de drukprijslijst.
   */
  printCodes?: string[]
}

/** Een bedrukpositie op een artikel, met wat daar technisch kan. */
export interface CanonicalPrintPosition {
  /** Code van de leverancier, bijvoorbeeld FRONT of ROUNDSCREEN. */
  positionCode: string
  /** Maximale bedrukmaat in millimeters. */
  maxWidthMm: number | null
  maxHeightMm: number | null
  techniques: {
    /** Techniekcode van de leverancier. */
    code: string
    /** Nul betekent: geen begrenzing. */
    maxColors: number
    isDefault: boolean
  }[]
}

/** Alle bedrukmogelijkheden van één artikel. */
export interface CanonicalPrintData {
  externalId: string
  /** Manipulatiecode die de handlingprijs bepaalt; leeg betekent geen. */
  manipulationCode: string | null
  /** PDF met de drukposities ingetekend. */
  templateUrl: string | null
  positions: CanonicalPrintPosition[]
}

/** De drukprijslijst van een leverancier. */
export interface CanonicalPrintPrices {
  currency: string
  validFrom: Date | null
  validUntil: Date | null
  manipulations: { code: string; description: string | null; pricePerPiece: string }[]
  techniques: {
    code: string
    name: string
    pricingType: PrintPricingType
    setup: string | null
    setupRepeat: string | null
    nextColourCostIndicator: boolean
    /**
     * De staffels per oppervlaktebereik, in de vorm waarin de calculatie ze
     * verwacht. Bewust niet `unknown`: dat verbergt een verkeerde veldnaam
     * tot het moment dat er gerekend wordt.
     */
    varCosts: PrintVarCost[]
  }[]
}

/**
 * Eén regel uit een drukprijslijst die al een staffel ís.
 *
 * Dit staat naast `CanonicalPrintPrices` en niet in plaats daarvan, omdat
 * leveranciers hun drukprijzen werkelijk anders opbouwen. midocean en ANDA
 * geven een prijs*structuur* die pas uitgerekend kan worden als het
 * logoformaat bekend is (ADR-0016). PF Concept geeft een opzoektabel over
 * formaat, kleuren en aantal, en die is wél vooraf plat te slaan.
 *
 * Eén vorm voor beide zou betekenen dat de ene leverancier zich voordoet als
 * de andere, en dat is precies hoe je verkeerde prijzen krijgt.
 */
export interface CanonicalPrintPriceTier {
  /** Drukcode, verwijst naar `printCodes` bij de prijs en bij de drukdata. */
  printCode: string
  /** Oppervlak waarvoor deze regel geldt; 0 betekent: formaat doet niet mee. */
  logoSizeCm2: number
  /** Aantal kleuren; 0 betekent: aantal kleuren doet niet mee (fullcolour). */
  colors: number
  minQuantity: number
  unitPrice: string
  setupCost: string
}

export interface CanonicalPrintPriceList {
  currency: string
  methods: {
    printCode: string
    /** Omschrijving van de techniek zoals de leverancier hem noemt. */
    description: string | null
    /**
     * Toeslag bij bedrukken onder het minimum bedrukkingsaantal. Null als de
     * leverancier het begrip niet kent.
     */
    ltmCharge: string | null
    /**
     * Waarvan de prijs afhangt, in de woorden van de leverancier. Bewust als
     * ruwe tekst: welke waarden PF Concept hier gebruikt is nog niet
     * bevestigd, en een aanname zou hier een verkeerde prijs opleveren.
     */
    priceDependence: string | null
  }[]
  tiers: CanonicalPrintPriceTier[]
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
  /**
   * Een eerder vastgelegde payload opnieuw vertalen, zonder de leverancier te
   * bevragen. Nodig bij het toepassen van een wijziging: wat in de catalogus
   * komt moet terug te voeren zijn op wat de leverancier werkelijk stuurde.
   */
  parseProduct?(payload: unknown): CanonicalProduct
  fetchPrices?(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrice>[]>
  fetchStock?(context: ConnectorContext): Promise<FetchedRecord<CanonicalStock>[]>
  fetchPrintData?(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrintData>[]>
  fetchPrintPrices?(context: ConnectorContext): Promise<CanonicalPrintPrices>
  /**
   * Voor leveranciers die hun drukprijzen als opzoektabel leveren. Een
   * connector implementeert dit óf `fetchPrintPrices`, niet allebei.
   */
  fetchPrintPriceTiers?(context: ConnectorContext): Promise<CanonicalPrintPriceList>
}

/**
 * Een fout van de leverancier, met de verzochte bron erbij.
 *
 * Erft van IntegrationError, en is daarmee een domeinfout: een leverancier
 * die weigert is geen interne fout van ons. Zonder die erfenis werd deze
 * melding door de foutafhandeling vervangen door "er is een onverwachte fout
 * opgetreden", en dat is precies de informatie die iemand nodig heeft om het
 * op te lossen.
 *
 * De melding is voor de gebruiker geschreven en komt dus wel naar buiten; de
 * technische details gaan als `details` mee.
 */
export class ConnectorError extends IntegrationError {
  constructor(
    readonly connector: string,
    readonly bron: string,
    message: string,
    /** De statuscode die de leverancier gaf, niet die van ons antwoord. */
    readonly upstreamStatus?: number,
  ) {
    super(message, { connector, bron, upstreamStatus })
    this.name = 'ConnectorError'
  }
}
