import { Injectable } from '@nestjs/common'
import { XMLParser } from 'fast-xml-parser'
import type { ConnectorCapability } from '@rgh/db'
import {
  ConnectorError,
  type CanonicalAsset, type CanonicalPrice, type CanonicalPrintData,
  type CanonicalPrintPosition, type CanonicalProduct, type CanonicalStock,
  type CanonicalVariant, type ConnectorContext, type FetchedRecord, type SupplierConnector,
} from '../connector.types'
import type {
  AndaInventoryFeed, AndaInventoryRecord, AndaLabeling, AndaLabelingFeed, AndaPrice,
  AndaPriceFeed, AndaProduct, AndaProductFeed, Lijst,
} from './anda.types'

/**
 * De ANDA Present-koppeling.
 *
 * Alle gegevens komen uit de XML-feeds; hun REST API is uitsluitend een
 * Order API en wordt niet gebruikt (ADR-0018, harde regel 13).
 *
 * Toegang werkt anders dan bij de andere twee: er is geen sleutel in een
 * header, maar een geheime id ín de URL plus IP-whitelisting. Die id ís dus
 * de sleutel en hoort versleuteld in de credentials.
 *
 * **Niet geverifieerd tegen echte bestanden.** De feeds zijn nog niet
 * geactiveerd; dit is gebouwd op hun handleiding v3.2 en hun eigen
 * voorbeelden.
 *
 * **Drukprijzen zitten hier bewust nog niet in.** Vier dingen in hun
 * prijsopbouw zijn onbeantwoord: hoe de code uit de labeling feed op de code
 * uit de prijsfeed wordt afgebeeld, wat de lijmprijs bij VS is, hoe de
 * prijsgroep bij DO en SU gekozen wordt, en dat BR helemaal geen prijs heeft.
 * Daar iets voor verzinnen is precies wat harde regel 8 verbiedt, en het zou
 * verkeerde prijzen opleveren. Zie de vragenlijst in
 * docs/leveranciers/vragen-aan-leveranciers.md.
 */

const BASIS = 'https://xml.andapresent.com/export'

export type Ophaler = (url: string) => Promise<Response>

function lijst<T>(waarde: Lijst<T>): T[] {
  if (waarde === undefined || waarde === null) return []
  return Array.isArray(waarde) ? waarde : [waarde]
}

function eerste<T>(waarde: Lijst<T>): T | undefined {
  return lijst(waarde)[0]
}

const tekst = (waarde: unknown): string | null => {
  if (waarde === undefined || waarde === null) return null
  const t = String(waarde).trim()
  return t === '' ? null : t
}

const getal = (waarde: unknown): number | null => {
  const t = tekst(waarde)
  if (t === null) return null
  const n = Number(t.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/**
 * Het aantal kleuren dat een techniek aankan. ANDA levert 1-10, of de tekst
 * "Full Color". Nul betekent in onze catalogus "geen begrenzing", en dat
 * klopt hier: bij fullcolour wordt niet per kleur gerekend.
 */
function kleuren(waarde: unknown): number {
  const n = getal(waarde)
  if (n === null || !Number.isInteger(n) || n < 0) return 0
  return n
}

@Injectable()
export class AndaConnector implements SupplierConnector {
  readonly key = 'anda-xml'
  readonly capabilities: ConnectorCapability[] = [
    'CATALOG', 'MEDIA', 'PRICE_TIERS', 'INVENTORY', 'PRINT_DATA',
  ]

  private readonly parser = new XMLParser({
    ignoreAttributes: false,
    // Alles als tekst. Een bedrag door een JavaScript-float halen is precies
    // wat harde regel 2 verbiedt, en "02" als kleurcode mag geen 2 worden.
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: true,
  })

  constructor(private readonly ophalen: Ophaler = (url) => fetch(url)) {}

  // --- Ophalen -------------------------------------------------------------

  private taal = (context: ConnectorContext) => String(context.config.language ?? 'nl')

  /**
   * De geheime id in de URL. ANDA geeft er één per feed uit; `uniqueId` is de
   * terugval voor het geval ze er toch één voor alles afgeven.
   */
  private id(context: ConnectorContext, feed: string): string {
    const code = tekst(context.credentials[`${feed}Id`]) ?? tekst(context.credentials.uniqueId)
    if (!code) {
      throw new ConnectorError(
        this.key, feed,
        `Er is geen unieke id opgeslagen voor de ${feed}-feed van ANDA. Die krijg je van je ` +
          'ANDA-contactpersoon nadat de feeds geactiveerd zijn, samen met de IP-whitelisting.',
      )
    }
    return code
  }

  private async haal<T>(pad: string, bron: string): Promise<T> {
    const url = `${BASIS}/${pad}`
    let antwoord: Response
    try {
      antwoord = await this.ophalen(url)
    } catch (oorzaak) {
      throw new ConnectorError(
        this.key, bron,
        `ANDA is niet bereikbaar: ${oorzaak instanceof Error ? oorzaak.message : String(oorzaak)}`,
      )
    }

    if (!antwoord.ok) throw this.verklaarFout(bron, antwoord)

    let rauw: string
    try {
      rauw = await antwoord.text()
    } catch {
      throw new ConnectorError(this.key, bron, 'Het bestand van ANDA was niet te lezen.')
    }

    try {
      return this.parser.parse(rauw) as T
    } catch (oorzaak) {
      throw new ConnectorError(
        this.key, bron,
        `Het bestand van ANDA was geen geldige XML: ${
          oorzaak instanceof Error ? oorzaak.message : String(oorzaak)
        }`,
      )
    }
  }

  /**
   * ANDA noemt twee foutsituaties, allebei zonder HTTP-code. Ze lijken op
   * elkaar en hebben heel verschillende oorzaken, dus de melding moet het
   * verschil noemen.
   */
  private verklaarFout(bron: string, antwoord: Response): ConnectorError {
    const uitleg: Record<number, string> = {
      401:
        'ANDA weigert de toegang. Bij hen betekent dat bijna altijd dat het IP-adres van deze ' +
        'server niet op hun lijst staat. Het adres moet vast zijn en vooraf doorgegeven.',
      403:
        'ANDA weigert de toegang. Bij hen betekent dat bijna altijd dat het IP-adres van deze ' +
        'server niet op hun lijst staat. Het adres moet vast zijn en vooraf doorgegeven.',
      404:
        'Dit bestand bestaat niet bij ANDA. Dat kan twee dingen betekenen: de unieke id klopt ' +
        'niet, of het bestand is nog niet gegenereerd. Na activering kan dat tot 24 uur duren.',
    }
    return new ConnectorError(
      this.key, bron,
      uitleg[antwoord.status] ?? `ANDA antwoordde met ${antwoord.status} ${antwoord.statusText}.`,
      antwoord.status,
    )
  }

  // --- Catalogus -----------------------------------------------------------

  /**
   * ANDA kent geen variantenblok: elke kleur en maat is een eigen
   * `itemNumber`, en `rootItemNumber` zegt bij welk artikel ze horen. Wij
   * groeperen daarom op `rootItemNumber`; dat veld is ons product en
   * `itemNumber` onze variant (ADR-0018).
   *
   * Zonder `rootItemNumber` staat een artikel op zichzelf. Dat is beter dan
   * het weglaten: een los artikel is bruikbaar, een verdwenen artikel niet.
   */
  async fetchCatalog(context: ConnectorContext): Promise<FetchedRecord<CanonicalProduct>[]> {
    const data = await this.haal<AndaProductFeed>(
      `products/${this.taal(context)}/${this.id(context, 'product')}`,
      'product feed',
    )

    const producten = lijst(data.products).flatMap((g) => lijst(g.product))
    if (producten.length === 0) {
      throw new ConnectorError(this.key, 'product feed', 'De product feed bevatte geen artikelen.')
    }

    const groepen = new Map<string, AndaProduct[]>()
    for (const product of producten) {
      const item = tekst(product.itemNumber)
      if (!item) continue
      // Onderdelen van een samengesteld artikel zijn niet los verkoopbaar.
      // Hoe het samengestelde artikel zelf te herkennen is staat nog als
      // vraag bij ANDA uit; tot die tijd laten we de onderdelen erbuiten.
      if (tekst(product.assemblyProduct) === '1') continue

      const wortel = tekst(product.rootItemNumber) ?? item
      const bestaand = groepen.get(wortel)
      if (bestaand) bestaand.push(product)
      else groepen.set(wortel, [product])
    }

    return [...groepen.entries()].map(([wortel, varianten]) => ({
      externalId: wortel,
      payload: { rootItemNumber: wortel, products: varianten },
      value: this.naarProduct(wortel, varianten),
    }))
  }

  parseProduct(payload: unknown): CanonicalProduct {
    const opgeslagen = payload as { rootItemNumber?: string; products?: AndaProduct[] }
    const wortel = tekst(opgeslagen?.rootItemNumber)
    if (!wortel || !Array.isArray(opgeslagen.products)) {
      throw new ConnectorError(
        this.key, 'opgeslagen payload',
        'De opgeslagen brondata heeft geen rootItemNumber met artikelen.',
      )
    }
    return this.naarProduct(wortel, opgeslagen.products)
  }

  private naarProduct(wortel: string, varianten: AndaProduct[]): CanonicalProduct {
    const eersteVariant = varianten[0]
    const eigenschappen = lijst(eerste(eersteVariant.specification)?.property)
    const eigenschap = (type: string): string | null => {
      const gevonden = eigenschappen.find((e) => tekst(e.type)?.toLowerCase() === type.toLowerCase())
      return tekst(eerste(eerste(gevonden?.values)?.value))
    }

    const categorieen = lijst(eerste(eersteVariant.categories)?.category)
      .map((c) => ({ naam: tekst(c.name), niveau: getal(c.level) ?? 0 }))
      .filter((c): c is { naam: string; niveau: number } => c.naam !== null)
      .sort((a, b) => a.niveau - b.niveau)

    return {
      externalId: wortel,
      articleNumber: wortel,
      name: tekst(eersteVariant.name) ?? tekst(eersteVariant.designName) ?? wortel,
      shortDescription: tekst(eersteVariant.name),
      longDescription: tekst(eersteVariant.description ?? eersteVariant.descriptions),
      brand: tekst(eersteVariant.brandName),
      material: eigenschap('Material 1'),
      countryOfOrigin: tekst(eersteVariant.countryOfOrigin),
      commodityCode: tekst(eersteVariant.tariffNumber),
      dimensions: eigenschap('Size'),
      // De product feed zegt niets over bedrukbaarheid; dat staat in de
      // labeling feed. Null is hier dus "onbekend" en niet "nee".
      printable: null,
      categoryPath: categorieen.map((c) => c.naam),
      documents: this.documenten(eersteVariant),
      variants: varianten.map((v) => this.naarVariant(v)),
    }
  }

  private naarVariant(product: AndaProduct): CanonicalVariant {
    const item = String(product.itemNumber).trim()
    const beelden = lijst(eerste(product.images)?.image)
      .map((b) => tekst(b))
      .filter((b): b is string => b !== null)

    const afbeeldingen: CanonicalAsset[] = []
    const hoofdbeeld = tekst(product.primaryImage)
    if (hoofdbeeld) {
      afbeeldingen.push({ url: hoofdbeeld, type: 'image', subtype: 'item_picture_main' })
    }
    for (const beeld of beelden) {
      if (beeld === hoofdbeeld) continue
      afbeeldingen.push({ url: beeld, type: 'image', subtype: 'item_picture' })
    }

    // 1 betekent "niet beschikbaar". De handleiding schrijft het veld op twee
    // manieren; allebei gelezen, want een tikfout in hun bestand mag geen
    // artikel stilzwijgend leverbaar maken.
    const onbeschikbaar =
      tekst(product.temporarilyUnavailable ?? product.temporarilyUnavaliable) === '1'

    return {
      externalId: item,
      sku: item,
      colorCode: tekst(product.primarycolorCode),
      colorName: tekst(product.primaryColor),
      colorGroup: null,
      pmsColor: null,
      sizeCode: null,
      gtin: tekst(product.eanCode),
      lifecycleStatus: onbeschikbaar ? 'TEMPORARILY_UNAVAILABLE' : null,
      images: afbeeldingen,
    }
  }

  private documenten(product: AndaProduct): CanonicalAsset[] {
    const uit: CanonicalAsset[] = []
    for (const url of lijst(eerste(product.productCertificate)?.conformity)) {
      const schoon = tekst(url)
      if (schoon) uit.push({ url: schoon, type: 'document', subtype: 'declaration_of_conformity' })
    }
    for (const url of lijst(eerste(product.testReports)?.test_report)) {
      const schoon = tekst(url)
      if (schoon) uit.push({ url: schoon, type: 'document', subtype: 'test_report' })
    }
    return uit
  }

  // --- Prijzen -------------------------------------------------------------

  /**
   * De prijsfeed geeft per artikel twee regels: `listPrice` (catalogus) en
   * `discountPrice` (onze inkoopprijs). Wij nemen de laatste.
   *
   * **Er zit geen staffel in.** ANDA levert één prijs per artikel, niet een
   * reeks vanaf-aantallen zoals midocean en PF Concept. Staffelkorting op het
   * artikel komt dus niet uit deze feed; de "unique product prices" feed kent
   * wel bereiken, maar die prijzen bevatten de bedrukking al en zijn een
   * ander geval (ADR-0018).
   */
  async fetchPrices(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrice>[]> {
    const data = await this.haal<AndaPriceFeed>(
      `prices/${this.id(context, 'price')}`,
      'price feed',
    )

    const perArtikel = new Map<string, AndaPrice[]>()
    for (const prijs of lijst(data.prices).flatMap((g) => lijst(g.price))) {
      const item = tekst(prijs.itemNumber)
      if (!item) continue
      const bestaand = perArtikel.get(item)
      if (bestaand) bestaand.push(prijs)
      else perArtikel.set(item, [prijs])
    }

    const records: FetchedRecord<CanonicalPrice>[] = []
    for (const [item, regels] of perArtikel) {
      const inkoop = regels.find((r) => tekst(r.type) === 'discountPrice')
      // Zonder inkoopprijs is er niets te importeren. De catalogusprijs
      // overnemen zou betekenen dat we onszelf onze verkoopprijs als inkoop
      // aanrekenen, en dan is elke marge nul.
      if (!inkoop) continue

      const bedrag = tekst(inkoop.amount)
      if (!bedrag) continue

      records.push({
        externalId: item,
        payload: regels,
        value: {
          sku: item,
          externalVariantId: null,
          currency: tekst(inkoop.currency) ?? 'EUR',
          unitPrice: bedrag.replace(',', '.'),
          validUntil: null,
          tiers: [],
        },
      })
    }
    return records
  }

  // --- Voorraad ------------------------------------------------------------

  /**
   * ANDA geeft meerdere regels per artikel, één per voorraadsoort, met elk
   * een eigen levertijd.
   *
   * Die mogen niet opgeteld worden: "direct leverbaar" is iets anders dan
   * "over acht dagen leverbaar". Wat wij als voorraad tonen is daarom alleen
   * `central_stock`.
   *
   * **Beperking:** `external_stock` (6-8 dagen) heeft geen datum en past
   * daarmee niet in ons voorraadmodel, dat met aankomstdatums werkt. Het komt
   * mee als aantal zonder datum, zodat het niet stilzwijgend verdwijnt. Zodra
   * het voorraadmodel levertijden kent hoort dit beter.
   */
  async fetchStock(context: ConnectorContext): Promise<FetchedRecord<CanonicalStock>[]> {
    const data = await this.haal<AndaInventoryFeed>(
      `inventories/${this.id(context, 'inventory')}`,
      'inventory feed',
    )

    const perArtikel = new Map<string, AndaInventoryRecord[]>()
    for (const regel of lijst(data.inventories).flatMap((g) => lijst(g.record))) {
      const item = tekst(regel.itemNumber)
      if (!item) continue
      const bestaand = perArtikel.get(item)
      if (bestaand) bestaand.push(regel)
      else perArtikel.set(item, [regel])
    }

    return [...perArtikel.entries()].map(([item, regels]) => {
      const som = (soort: string) =>
        regels
          .filter((r) => tekst(r.type) === soort)
          .reduce((totaal, r) => totaal + (getal(r.amount) ?? 0), 0)

      const aankomsten = regels
        .filter((r) => tekst(r.type)?.startsWith('incoming_to_'))
        .map((r) => ({ datum: this.datum(r.arrivalDate), aantal: getal(r.amount) ?? 0 }))
        .filter((a) => a.datum !== null && a.aantal > 0)
        .sort((a, b) => a.datum!.getTime() - b.datum!.getTime())

      return {
        externalId: item,
        payload: regels,
        value: {
          sku: item,
          quantity: som('central_stock'),
          firstArrivalDate: aankomsten[0]?.datum ?? null,
          firstArrivalQuantity: aankomsten[0]?.aantal ?? null,
          nextArrivalDate: aankomsten[1]?.datum ?? null,
          nextArrivalQuantity: aankomsten[1]?.aantal ?? som('external_stock') ?? null,
        },
      }
    })
  }

  private datum(waarde: unknown): Date | null {
    const t = tekst(waarde)
    if (!t) return null
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? null : d
  }

  // --- Drukgegevens --------------------------------------------------------

  /**
   * Bedrukposities en -technieken per artikel.
   *
   * Let op: ANDA levert dit per **itemNumber**, dus per variant, terwijl onze
   * bedrukopties aan het product hangen. De labeling feed noemt geen
   * `rootItemNumber`, dus de koppeling naar het product moet de importstap
   * maken met wat de product feed daarover zei. Dat hier afleiden door het
   * artikelnummer op te knippen zou een gok zijn.
   */
  async fetchPrintData(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrintData>[]> {
    const data = await this.haal<AndaLabelingFeed>(
      `labeling/${this.taal(context)}/${this.id(context, 'labeling')}`,
      'labeling feed',
    )

    const records: FetchedRecord<CanonicalPrintData>[] = []
    for (const labeling of lijst(data.labelings).flatMap((g) => lijst(g.labeling))) {
      const item = tekst(labeling.itemNumber)
      if (!item) continue
      records.push({
        externalId: item,
        payload: labeling,
        value: {
          externalId: item,
          // ANDA kent geen manipulatiecode zoals midocean; handling zit in de
          // drukprijs zelf.
          manipulationCode: null,
          templateUrl: tekst(labeling.printTemplate),
          positions: this.naarPosities(labeling),
        },
      })
    }
    return records
  }

  private naarPosities(labeling: AndaLabeling): CanonicalPrintPosition[] {
    const posities: CanonicalPrintPosition[] = []

    for (const positie of lijst(eerste(labeling.positions)?.position)) {
      const code = tekst(positie.serial) ?? tekst(positie.posName)
      if (!code) continue

      const technieken = lijst(eerste(positie.technologies)?.technology).filter(
        (t) => !!tekst(t.Code),
      )
      if (technieken.length === 0) continue

      // De maximale maat staat bij ANDA per techniek, niet per positie. Wij
      // houden de ruimste aan: dat is wat de positie fysiek biedt, en die
      // maat bepaalt voortaan de drukprijs bij technieken die per oppervlak
      // rekenen.
      const breedtes = technieken.map((t) => getal(t.maxWmm)).filter((n): n is number => n !== null)
      const hoogtes = technieken.map((t) => getal(t.maxHmm)).filter((n): n is number => n !== null)

      posities.push({
        positionCode: code,
        maxWidthMm: breedtes.length > 0 ? Math.max(...breedtes) : null,
        maxHeightMm: hoogtes.length > 0 ? Math.max(...hoogtes) : null,
        techniques: technieken.map((t) => ({
          code: String(t.Code).trim(),
          maxColors: kleuren(t.maxColor),
          // ANDA wijst geen standaardtechniek aan.
          isDefault: false,
        })),
      })
    }

    return posities
  }
}
