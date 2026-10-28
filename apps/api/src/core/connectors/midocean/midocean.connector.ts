import { Injectable } from '@nestjs/common'
import type { ConnectorCapability } from '@rgh/db'
import { parseSupplierBoolean, parseSupplierInteger } from '@rgh/contracts'
import {
  ConnectorError,
  type CanonicalAsset, type CanonicalPrice, type CanonicalProduct, type CanonicalStock,
  type CanonicalVariant, type ConnectorContext, type FetchedRecord, type SupplierConnector,
} from '../connector.types'
import type {
  MidoceanAsset, MidoceanPricelist, MidoceanProduct, MidoceanStockResponse, MidoceanVariant,
} from './midocean.types'

/**
 * De midocean-koppeling.
 *
 * Alles via REST; SFTP is bij hen uitgefaseerd en in 2025 uitgezet
 * (ADR-0013). De sleutel gaat in de header `x-Gateway-APIKey`.
 *
 * Deze klasse haalt op en vertaalt. Hij schrijft niets weg en beslist niets
 * over de catalogus: dat doet de importpijplijn.
 */

const PRODUCTIE = 'https://api.midocean.com'
const TEST = 'https://apitest.midocean.com'

/** Welke taal de productteksten krijgen; midocean ondersteunt er dertien. */
const STANDAARDTAAL = 'nl'

export type Ophaler = (url: string, init: { headers: Record<string, string> }) => Promise<Response>

@Injectable()
export class MidoceanConnector implements SupplierConnector {
  readonly key = 'midocean-api'
  readonly capabilities: ConnectorCapability[] = ['CATALOG', 'MEDIA', 'PRICE_TIERS', 'INVENTORY']

  /**
   * De ophaalfunctie is injecteerbaar zodat tests met opgeslagen antwoorden
   * kunnen draaien. In productie is het gewoon `fetch`.
   */
  constructor(private readonly ophalen: Ophaler = (url, init) => fetch(url, init)) {}

  // --- Ophalen -------------------------------------------------------------

  private basisUrl(context: ConnectorContext): string {
    const omgeving = String(context.config.environment ?? 'test').toLowerCase()
    if (omgeving === 'production') return PRODUCTIE
    if (omgeving === 'test') return TEST
    throw new ConnectorError(
      this.key, 'config',
      `Onbekende omgeving "${omgeving}" in de koppelinstellingen. Kies "test" of "production".`,
    )
  }

  private async haal<T>(context: ConnectorContext, pad: string): Promise<T> {
    const sleutel = context.credentials.apiKey
    if (!sleutel) {
      throw new ConnectorError(this.key, pad, 'Er is geen API-sleutel opgeslagen voor deze koppeling.')
    }

    const url = `${this.basisUrl(context)}${pad}`
    let antwoord: Response
    try {
      antwoord = await this.ophalen(url, {
        headers: { 'x-Gateway-APIKey': sleutel, Accept: 'application/json' },
      })
    } catch (oorzaak) {
      throw new ConnectorError(
        this.key, pad,
        `midocean is niet bereikbaar: ${oorzaak instanceof Error ? oorzaak.message : String(oorzaak)}`,
      )
    }

    if (!antwoord.ok) throw this.verklaarFout(pad, antwoord)

    try {
      return (await antwoord.json()) as T
    } catch {
      throw new ConnectorError(this.key, pad, 'Het antwoord van midocean was geen geldige JSON.')
    }
  }

  /**
   * De foutmeldingen uit hun Appendix C vertaald naar iets waar iemand wat
   * mee kan. Vooral de eerste twee zijn belangrijk: ze lijken allebei op een
   * kapotte sleutel terwijl de oorzaak elders ligt.
   */
  private verklaarFout(pad: string, antwoord: Response): ConnectorError {
    const uitleg: Record<number, string> = {
      401:
        'midocean weigert de sleutel. Dat kan twee dingen betekenen: de sleutel is verkeerd, of ' +
        'hij is niet geabonneerd op dit endpoint. Abonneren gebeurt in het midocean-account onder ' +
        'Account > Customer API.',
      403:
        'midocean weigert de toegang. Controleer of de sleutel bij de juiste omgeving hoort: test ' +
        'en productie hebben elk een eigen sleutel.',
      404: 'Dit endpoint bestaat niet bij midocean. Controleer de URL tegen hun handleiding.',
      503:
        'midocean is tijdelijk niet bereikbaar. De testomgeving staat buiten Europese kantooruren ' +
        "uit; 's avonds is dit dus te verwachten en geen storing van ons.",
    }
    return new ConnectorError(
      this.key, pad,
      uitleg[antwoord.status] ?? `midocean antwoordde met ${antwoord.status} ${antwoord.statusText}.`,
      antwoord.status,
    )
  }

  // --- Vertalen ------------------------------------------------------------

  async fetchCatalog(context: ConnectorContext): Promise<FetchedRecord<CanonicalProduct>[]> {
    const taal = String(context.config.language ?? STANDAARDTAAL)
    const data = await this.haal<MidoceanProduct[]>(context, `/gateway/products/2.0?language=${taal}`)

    if (!Array.isArray(data)) {
      throw new ConnectorError(this.key, 'products/2.0', 'Verwachtte een lijst producten van midocean.')
    }

    const records: FetchedRecord<CanonicalProduct>[] = []
    for (const rauw of data) {
      // Zonder hoofdartikelnummer is een product nergens aan te koppelen; dat
      // is een fout in de bron en geen reden om de hele import te stoppen.
      if (!rauw.master_code) continue
      records.push({ externalId: rauw.master_code, payload: rauw, value: this.naarProduct(rauw) })
    }
    return records
  }

  async fetchPrices(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrice>[]> {
    const data = await this.haal<MidoceanPricelist>(context, '/gateway/pricelist/2.0')
    const valuta = data.currency ?? 'EUR'

    return (data.price ?? [])
      .filter((p) => !!p.sku && !!p.price)
      .map((p) => ({
        externalId: p.sku!,
        payload: p,
        value: {
          sku: p.sku!,
          externalVariantId: p.variant_id ?? null,
          currency: valuta,
          unitPrice: p.price!,
          validUntil: datum(p.valid_until),
          tiers: (p.scale ?? [])
            .filter((s) => !!s.minimum_quantity && !!s.price)
            .map((s) => ({
              minimumQuantity: parseSupplierInteger(s.minimum_quantity, 'minimum_quantity'),
              unitPrice: s.price!,
            }))
            .sort((a, b) => a.minimumQuantity - b.minimumQuantity),
        },
      }))
  }

  async fetchStock(context: ConnectorContext): Promise<FetchedRecord<CanonicalStock>[]> {
    const data = await this.haal<MidoceanStockResponse>(context, '/gateway/stock/2.0')

    return (data.stock ?? [])
      .filter((s) => !!s.sku)
      .map((s) => ({
        externalId: s.sku!,
        payload: s,
        value: {
          sku: s.sku!,
          quantity: parseSupplierInteger(s.qty ?? 0, 'qty'),
          firstArrivalDate: datum(s.first_arrival_date),
          firstArrivalQuantity: optioneelAantal(s.first_arrival_qty),
          nextArrivalDate: datum(s.next_arrival_date),
          nextArrivalQuantity: optioneelAantal(s.next_arrival_qty),
        },
      }))
  }

  /**
   * Een opgeslagen payload opnieuw vertalen. Dezelfde functie als bij het
   * ophalen, zodat opgeslagen en verse data nooit anders uitpakken.
   */
  parseProduct(payload: unknown): CanonicalProduct {
    const rauw = payload as MidoceanProduct
    if (!rauw?.master_code) {
      throw new ConnectorError(this.key, 'opgeslagen payload', 'De opgeslagen brondata heeft geen master_code.')
    }
    return this.naarProduct(rauw)
  }

  private naarProduct(rauw: MidoceanProduct): CanonicalProduct {
    const varianten = (rauw.variants ?? []).filter((v) => !!v.sku)
    // De categorie staat per variant, niet op het product. Alle varianten van
    // een artikel delen hem, dus de eerste is representatief.
    const eerste = varianten[0]

    return {
      externalId: rauw.master_code!,
      articleNumber: rauw.master_code!,
      name: rauw.product_name?.trim() || rauw.master_code!,
      shortDescription: leegNaarNull(rauw.short_description),
      longDescription: leegNaarNull(rauw.long_description),
      brand: leegNaarNull(rauw.brand),
      material: leegNaarNull(rauw.material),
      countryOfOrigin: leegNaarNull(rauw.country_of_origin),
      commodityCode: leegNaarNull(rauw.commodity_code),
      dimensions: leegNaarNull(rauw.dimensions),
      printable: jaNee(rauw.printable),
      categoryPath: [eerste?.category_level1, eerste?.category_level2, eerste?.category_level3]
        .map((c) => c?.trim())
        .filter((c): c is string => !!c),
      documents: (rauw.digital_assets ?? []).map(naarAsset).filter((a): a is CanonicalAsset => !!a),
      variants: varianten.map((v) => this.naarVariant(v)),
    }
  }

  private naarVariant(rauw: MidoceanVariant): CanonicalVariant {
    return {
      externalId: rauw.variant_id?.trim() || rauw.sku!,
      sku: rauw.sku!,
      colorCode: leegNaarNull(rauw.color_code),
      colorName: leegNaarNull(rauw.color_description),
      colorGroup: leegNaarNull(rauw.color_group),
      pmsColor: leegNaarNull(rauw.pms_color),
      sizeCode: leegNaarNull(rauw.size_textile),
      gtin: leegNaarNull(rauw.gtin),
      lifecycleStatus: leegNaarNull(rauw.plc_status_description),
      images: (rauw.digital_assets ?? []).map(naarAsset).filter((a): a is CanonicalAsset => !!a),
    }
  }
}

// --- Kleine hulpjes --------------------------------------------------------

const leegNaarNull = (v: string | undefined | null): string | null => {
  const schoon = v?.trim()
  return schoon ? schoon : null
}

/**
 * midocean schrijft "yes"/"no"; een onbekende waarde is hier geen reden om de
 * import te laten mislukken, want het is een bijzaak van het artikel.
 */
const jaNee = (v: string | undefined): boolean | null => {
  if (v === undefined || v.trim() === '') return null
  try {
    return parseSupplierBoolean(v, 'printable')
  } catch {
    return null
  }
}

const datum = (v: string | undefined): Date | null => {
  if (!v?.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

const optioneelAantal = (v: number | string | undefined): number | null => {
  if (v === undefined || v === null || v === '') return null
  try {
    return parseSupplierInteger(v, 'aantal')
  } catch {
    return null
  }
}

const naarAsset = (a: MidoceanAsset): CanonicalAsset | null => {
  const url = a.url?.trim()
  if (!url) return null
  return {
    url,
    type: a.type?.trim() || 'image',
    subtype: a.subtype?.trim() || null,
    highResUrl: a.url_highress?.trim() || null,
  }
}
