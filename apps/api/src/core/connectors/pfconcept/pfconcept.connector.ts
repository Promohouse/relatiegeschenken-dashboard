import { Injectable } from '@nestjs/common'
import type { ConnectorCapability } from '@rgh/db'
import { parseSupplierInteger } from '@rgh/contracts'
import {
  ConnectorError,
  type CanonicalAsset, type CanonicalPrice, type CanonicalPrintData,
  type CanonicalPrintPriceList, type CanonicalPrintPriceTier, type CanonicalPrintPosition,
  type CanonicalProduct, type CanonicalStock, type CanonicalVariant, type ConnectorContext,
  type FetchedRecord, type SupplierConnector,
} from '../connector.types'
import type {
  Lijst, PfcDecoCharge, PfcPrintDataFeed, PfcPrintFeedRow, PfcPriceFeed, PfcPriceItem,
  PfcPrintPriceFeed, PfcProductFeed, PfcProductItem, PfcProductModel, PfcStockFeed,
} from './pfconcept.types'

/**
 * De PF Concept-koppeling.
 *
 * Alle gegevens komen uit de datafeeds, in JSON. De Gateway is een
 * orderdienst en wordt niet gebruikt (ADR-0019, harde regel 13).
 *
 * Deze klasse haalt op en vertaalt. Hij schrijft niets weg en beslist niets
 * over de catalogus: dat doet de importpijplijn, via staging (ADR-0004).
 *
 * **Niet geverifieerd tegen echte bestanden.** De feeds zijn nog niet
 * geactiveerd; dit is gebouwd op hun handleiding v3.6.7 en hun eigen
 * voorbeelden. Bij midocean weken drie dingen af van hun handleiding en alle
 * drie zouden ze verkeerde prijzen hebben opgeleverd, dus de eerste echte
 * respons blijft de toets.
 */

const BASIS = 'https://www.pfconcept.com/portal/datafeed'

/** Welke print data feed; PF splitst het assortiment over drie bestanden. */
const PRINTDATA_BESTAND: Record<string, (dept: string, taal: string) => string> = {
  stock: (dept, taal) => `printdata_${dept}_${taal}_v3.json`,
  label: (dept, taal) => `printdata_${dept}_${taal}_label_v3.json`,
  worldsource: (dept, taal) => `printdataws_${dept}_${taal}_v3.json`,
}

export type Ophaler = (url: string) => Promise<Response>

/** Eén element of een lijst wordt altijd een lijst. */
function lijst<T>(waarde: Lijst<T>): T[] {
  if (waarde === undefined || waarde === null) return []
  return Array.isArray(waarde) ? waarde : [waarde]
}

/** Het eerste element van een groepsveld, of undefined. */
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
 * Een aantal kleuren. PF levert hier een getal, of tekst wanneer fullcolour
 * van toepassing is - de handleiding zegt dat met zoveel woorden.
 *
 * Fullcolour wordt nul, en nul betekent in onze catalogus "geen begrenzing".
 * Dat klopt hier inhoudelijk: bij fullcolour wordt niet per kleur gerekend.
 */
function kleuren(waarde: unknown): number {
  const n = getal(waarde)
  if (n === null || !Number.isInteger(n) || n < 0) return 0
  return n
}

/** Een bedrag als tekst, zodat er nergens een float aan te pas komt (harde regel 2). */
function bedrag(waarde: unknown): string | null {
  const t = tekst(waarde)
  if (t === null) return null
  return t.replace(',', '.')
}

const waar = (waarde: unknown): boolean =>
  waarde === true || String(waarde ?? '').trim().toLowerCase() === 'true'

@Injectable()
export class PfConceptConnector implements SupplierConnector {
  readonly key = 'pfconcept-feed'
  readonly capabilities: ConnectorCapability[] = [
    'CATALOG', 'MEDIA', 'PRICE_TIERS', 'INVENTORY', 'PRINT_DATA',
  ]

  constructor(private readonly ophalen: Ophaler = (url) => fetch(url)) {}

  // --- Ophalen -------------------------------------------------------------

  private taal = (context: ConnectorContext) => String(context.config.language ?? 'nl')
  private afdeling = (context: ConnectorContext) => String(context.config.department ?? 'cnl1')

  private assortiment(context: ConnectorContext): string {
    const waarde = String(context.config.assortment ?? 'stock').toLowerCase()
    if (!(waarde in PRINTDATA_BESTAND)) {
      throw new ConnectorError(
        this.key, 'config',
        `Onbekend assortiment "${waarde}". PF Concept kent stock, label en worldsource.`,
      )
    }
    return waarde
  }

  /**
   * De geheime code in de bestandsnaam van de geactiveerde feeds.
   *
   * Die code ís de sleutel: wie hem heeft, leest onze inkoopprijzen. Artikel
   * 11 van hun gebruiksvoorwaarden maakt hem bovendien contractueel
   * vertrouwelijk. Hij hoort dus versleuteld in de credentials en nergens
   * anders.
   */
  private code(context: ConnectorContext, feed: string): string {
    const specifiek = context.credentials[`${feed}Code`]
    const algemeen = context.credentials.uniqueCode
    const code = tekst(specifiek) ?? tekst(algemeen)
    if (!code) {
      throw new ConnectorError(
        this.key, feed,
        `Er is geen unieke code opgeslagen voor de ${feed}-feed van PF Concept. Die krijg je van ` +
          'hun klantenservice nadat het aanvraagformulier is verwerkt.',
      )
    }
    return code
  }

  private async haal<T>(bestand: string, bron: string): Promise<T> {
    const url = `${BASIS}/${bestand}`
    let antwoord: Response
    try {
      antwoord = await this.ophalen(url)
    } catch (oorzaak) {
      throw new ConnectorError(
        this.key, bron,
        `PF Concept is niet bereikbaar: ${oorzaak instanceof Error ? oorzaak.message : String(oorzaak)}`,
      )
    }

    if (!antwoord.ok) throw this.verklaarFout(bron, antwoord)

    try {
      return (await antwoord.json()) as T
    } catch {
      throw new ConnectorError(this.key, bron, 'Het bestand van PF Concept was geen geldige JSON.')
    }
  }

  private verklaarFout(bron: string, antwoord: Response): ConnectorError {
    const uitleg: Record<number, string> = {
      403:
        'PF Concept weigert de toegang tot deze feed. Controleer of de feed geactiveerd is; ' +
        'prijs-, drukprijs- en voorraadfeed vragen activering per account.',
      404:
        'Dit feedbestand bestaat niet bij PF Concept. Dat kan twee dingen betekenen: de unieke ' +
        'code klopt niet, of het bestand is nog niet gegenereerd. Na activering staat een ' +
        'prijsfeed er pas na het eerstvolgende updatemoment, en dat is zaterdag 14:00.',
    }
    return new ConnectorError(
      this.key, bron,
      uitleg[antwoord.status] ?? `PF Concept antwoordde met ${antwoord.status} ${antwoord.statusText}.`,
      antwoord.status,
    )
  }

  // --- Catalogus -----------------------------------------------------------

  async fetchCatalog(context: ConnectorContext): Promise<FetchedRecord<CanonicalProduct>[]> {
    const bestand =
      this.assortiment(context) === 'worldsource'
        ? `productfeedws_${this.taal(context)}_v3.json`
        : `productfeed_${this.taal(context)}_v3.json`
    const data = await this.haal<PfcProductFeed>(bestand, 'product feed')

    const modellen = this.modellen(data)
    if (modellen.length === 0) {
      throw new ConnectorError(this.key, 'product feed', 'De product feed bevatte geen modellen.')
    }

    const records: FetchedRecord<CanonicalProduct>[] = []
    for (const model of modellen) {
      // Zonder modelcode is een product nergens aan te koppelen. Dat is een
      // fout in de bron en geen reden om de hele import te stoppen.
      if (!tekst(model.modelCode)) continue
      records.push({
        externalId: String(model.modelCode).trim(),
        payload: model,
        value: this.naarProduct(model),
      })
    }
    return records
  }

  parseProduct(payload: unknown): CanonicalProduct {
    const model = payload as PfcProductModel
    if (!tekst(model?.modelCode)) {
      throw new ConnectorError(
        this.key, 'opgeslagen payload', 'De opgeslagen brondata heeft geen modelCode.',
      )
    }
    return this.naarProduct(model)
  }

  private modellen(data: PfcProductFeed): PfcProductModel[] {
    const kop = eerste(data.productfeed)
    const groep = kop?.models ?? data.models
    return lijst(groep).flatMap((g) => lijst(g.model))
  }

  /**
   * `model > item` is letterlijk onze `Product > ProductVariant`. Dat is het
   * grote verschil met ANDA, waar de variant in het artikelnummer verstopt
   * zit en we het verband uit de nummering moeten afleiden.
   */
  private naarProduct(model: PfcProductModel): CanonicalProduct {
    const items = lijst(model.items).flatMap((g) => lijst(g.item))
    const eersteItem = items[0]
    const deco = eerste(eerste(eersteItem?.decorationSettings)?.decoDefault)
    const maten = eerste(eersteItem?.measurements)
    const categorie = eerste(eersteItem?.categoryData)

    return {
      externalId: String(model.modelCode).trim(),
      articleNumber: String(model.modelCode).trim(),
      name: tekst(model.description) ?? String(model.modelCode).trim(),
      shortDescription: tekst(model.description),
      longDescription: tekst(model.extDesc),
      // Merk, materiaal en herkomst staan bij PF per item en niet per model.
      // Ze zijn binnen een model vrijwel altijd gelijk, dus nemen we de eerste
      // die iets zegt; het item zelf blijft in de payload bewaard.
      brand: this.eersteWaarde(items, (i) => i.brand),
      material: this.eersteWaarde(items, (i) => i.material ?? i.simpleMaterial),
      countryOfOrigin: this.eersteWaarde(items, (i) => i.countryOfOrigin),
      commodityCode: this.eersteWaarde(items, (i) => i.hsCode),
      dimensions: tekst(maten?.sizeCombined ?? maten?.SizeCombined),
      printable: deco ? !!tekst(deco.method) : null,
      categoryPath: [tekst(categorie?.groupDesc), tekst(categorie?.catDesc)].filter(
        (v): v is string => v !== null,
      ),
      documents: [],
      variants: items.filter((i) => !!tekst(i.itemCode)).map((i) => this.naarVariant(i)),
    }
  }

  private eersteWaarde(
    items: PfcProductItem[],
    kies: (item: PfcProductItem) => string | undefined,
  ): string | null {
    for (const item of items) {
      const waarde = tekst(kies(item))
      if (waarde !== null) return waarde
    }
    return null
  }

  private naarVariant(item: PfcProductItem): CanonicalVariant {
    const kleur = eerste(eerste(item.colors)?.color)
    const code = String(item.itemCode).trim()

    return {
      externalId: code,
      sku: code,
      colorCode: tekst(kleur?.colorCode),
      colorName: tekst(kleur?.colorDesc),
      colorGroup: tekst(kleur?.baseColor),
      pmsColor: tekst(kleur?.pmsColorReference),
      sizeCode: tekst(item.size),
      gtin: tekst(item.eanCode),
      // PF zegt het zelf wanneer een artikel uitloopt, in plaats van het
      // stilletjes uit de feed te laten verdwijnen. Dat is precies het signaal
      // dat harde regel 12 vraagt.
      lifecycleStatus: waar(item.isDiscontinued) ? 'DISCONTINUED' : null,
      images: this.afbeeldingen(item),
    }
  }

  private afbeeldingen(item: PfcProductItem): CanonicalAsset[] {
    const beelden = eerste(item.imageData)
    if (!beelden) return []

    const velden: [keyof typeof beelden, string][] = [
      ['imageMain', 'item_picture_main'],
      ['imageFront', 'item_picture_front'],
      ['imageBack', 'item_picture_back'],
      ['imageDetail1', 'item_picture_detail'],
      ['imageDetail2', 'item_picture_detail'],
      ['imageDetail3', 'item_picture_detail'],
      ['limageDetail3', 'item_picture_detail'],
      ['imagePackage', 'item_picture_package'],
      ['imageGroup', 'item_picture_group'],
      ['imageModel', 'item_picture_model'],
      ['imageMood1', 'item_picture_mood'],
      ['imageMood2', 'item_picture_mood'],
      ['imageMood3', 'item_picture_mood'],
      ['imageLogoY1', 'item_picture_with_logo'],
      ['imageLogoY2', 'item_picture_with_logo'],
      ['imageLogoY3', 'item_picture_with_logo'],
    ]

    const gezien = new Set<string>()
    const assets: CanonicalAsset[] = []
    for (const [veld, subtype] of velden) {
      const naam = tekst(beelden[veld])
      if (!naam || gezien.has(naam)) continue
      gezien.add(naam)
      // De feed geeft bestandsnamen; de volledige URL staat in hun
      // afbeeldingenhoofdstuk en verschilt alleen in de maat.
      assets.push({
        url: `https://images.pfconcept.com/ProductImages_All/JPG/500x500/${naam}`,
        type: 'image',
        subtype,
        highResUrl: `https://images.pfconcept.com/ProductImages_All/JPG/1600x1600/${naam}`,
      })
    }
    return assets
  }

  // --- Prijzen -------------------------------------------------------------

  async fetchPrices(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrice>[]> {
    const bestand = `pricefeed_${this.code(context, 'price')}_v3.json`
    const data = await this.haal<PfcPriceFeed>(bestand, 'price feed')

    const kop = eerste(data.priceInfo)
    const modellen = lijst(kop?.models ?? data.models).flatMap((g) => lijst(g.model))

    const records: FetchedRecord<CanonicalPrice>[] = []
    for (const model of modellen) {
      for (const item of lijst(model.items).flatMap((g) => lijst(g.item))) {
        const sku = tekst(item.itemcode ?? item.itemCode)
        if (!sku) continue
        const prijs = this.naarPrijs(sku, item)
        if (prijs) records.push({ externalId: sku, payload: item, value: prijs })
      }
    }
    return records
  }

  /**
   * De vier schalen van PF zijn onze inkoopstaffel: `priceBar` is het
   * **beginaantal**, niet het einde van een bereik. Dat scheelt ten opzichte
   * van ANDA, waar een gesloten bereik stil een gat kan opvullen.
   */
  private naarPrijs(sku: string, item: PfcPriceItem): CanonicalPrice | null {
    const schalen = lijst(eerste(item.scales)?.scale)
      .map((s) => ({ minimumQuantity: getal(s.priceBar), unitPrice: bedrag(s.nettPrice) }))
      .filter(
        (s): s is { minimumQuantity: number; unitPrice: string } =>
          s.minimumQuantity !== null && s.unitPrice !== null,
      )
      .sort((a, b) => a.minimumQuantity - b.minimumQuantity)

    // Zonder enige prijs is er niets te importeren. Een lege regel zou in de
    // catalogus een inkoopprijs van nul worden, en dan klopt elke marge niet.
    if (schalen.length === 0) return null

    return {
      sku,
      externalVariantId: null,
      currency: tekst(item.currency) ?? 'EUR',
      unitPrice: schalen[0].unitPrice,
      validUntil: null,
      tiers: schalen,
      minDecoQuantity: getal(item.minDecoQty),
      printCodes: (tekst(item.decoCharge) ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter(Boolean),
    }
  }

  // --- Voorraad ------------------------------------------------------------

  async fetchStock(context: ConnectorContext): Promise<FetchedRecord<CanonicalStock>[]> {
    const bestand = `stockfeed_${this.code(context, 'stock')}_v3.json`
    const data = await this.haal<PfcStockFeed>(bestand, 'stock feed')

    const kop = eerste(data.stockFeed)
    const modellen = lijst(kop?.models ?? data.models).flatMap((g) => lijst(g.model))

    const records: FetchedRecord<CanonicalStock>[] = []
    for (const model of modellen) {
      for (const item of lijst(model.items).flatMap((g) => lijst(g.item))) {
        const sku = tekst(item.itemCode ?? item.itemcode)
        if (!sku) continue
        records.push({
          externalId: sku,
          payload: item,
          value: {
            sku,
            quantity: parseSupplierInteger(getal(item.stockDirect) ?? 0, 'stockDirect'),
            firstArrivalDate: this.datum(item.stockDateNextPo),
            firstArrivalQuantity: getal(item.stockNextPo),
            // `StockFuture` is alle verdere binnenkomende voorraad bij elkaar,
            // exclusief de eerstvolgende inkooporder, en komt zonder datum.
            // Een aantal zonder datum is iets anders dan een levering, dus het
            // staat hier wel maar de datum blijft leeg.
            nextArrivalDate: null,
            nextArrivalQuantity: getal(item.StockFuture ?? item.stockFuture),
          },
        })
      }
    }
    return records
  }

  private datum(waarde: unknown): Date | null {
    const t = tekst(waarde)
    if (!t) return null
    const d = new Date(t)
    return Number.isNaN(d.getTime()) ? null : d
  }

  // --- Drukgegevens --------------------------------------------------------

  /**
   * De print data feed is genormaliseerd: per artikel staan alleen
   * `ref`-nummers, en de eigenschappen staan één keer in `printFeedRows`.
   *
   * Een verwijzing die nergens heen wijst wordt overgeslagen én geteld. Stil
   * negeren zou een lege bedrukoptie opleveren die er uitziet als een echte.
   */
  async fetchPrintData(context: ConnectorContext): Promise<FetchedRecord<CanonicalPrintData>[]> {
    const bestand = PRINTDATA_BESTAND[this.assortiment(context)](
      this.afdeling(context),
      this.taal(context),
    )
    const data = await this.haal<PfcPrintDataFeed>(bestand, 'print data feed')

    const kop = eerste(data.printfeed)
    const rijen = new Map<string, PfcPrintFeedRow>()
    for (const groep of lijst(kop?.printFeedRows ?? data.printFeedRows)) {
      for (const rij of lijst(groep.printFeedRow)) {
        const ref = tekst(rij.ref)
        if (ref) rijen.set(ref, rij)
      }
    }

    if (rijen.size === 0) {
      throw new ConnectorError(
        this.key, 'print data feed',
        'De print data feed bevatte geen printFeedRows. Zonder die rijen zijn de verwijzingen ' +
          'per artikel niet op te lossen en zou elk artikel zonder bedrukopties binnenkomen.',
      )
    }

    const modellen = lijst(kop?.models ?? data.models).flatMap((g) => lijst(g.model))
    const records: FetchedRecord<CanonicalPrintData>[] = []

    for (const model of modellen) {
      const code = tekst(model.modelCode)
      if (!code) continue

      // De verwijzingen staan per item. Onze bedrukopties hangen aan het
      // product, dus nemen we de vereniging over de items van één model. De
      // payload bewaart het verschil per item.
      const refs = new Set<string>()
      for (const item of lijst(model.items).flatMap((g) => lijst(g.item))) {
        for (const groep of lijst(item.printfeedrefs)) {
          for (const verwijzing of lijst(groep.printfeedref)) {
            const ref = tekst(verwijzing.ref)
            if (ref) refs.add(ref)
          }
        }
      }

      records.push({
        externalId: code,
        payload: model,
        value: {
          externalId: code,
          // PF kent geen manipulatiecode zoals midocean; de handlingprijs zit
          // in de drukprijs zelf.
          manipulationCode: null,
          templateUrl: null,
          positions: this.naarPosities([...refs].map((r) => rijen.get(r)).filter(
            (r): r is PfcPrintFeedRow => r !== undefined,
          )),
        },
      })
    }
    return records
  }

  /** Eén positie kan meerdere technieken dragen; PF zet ze als losse rijen. */
  private naarPosities(rijen: PfcPrintFeedRow[]): CanonicalPrintPosition[] {
    const perPositie = new Map<string, CanonicalPrintPosition>()

    for (const rij of rijen) {
      const positie = tekst(rij.impLocationCode) ?? tekst(rij.impLocation)
      const techniek = tekst(rij.printCode) ?? tekst(rij.impMethodCode)
      if (!positie || !techniek) continue

      const bestaand = perPositie.get(positie) ?? {
        positionCode: positie,
        maxWidthMm: getal(rij.impWidthMm),
        maxHeightMm: getal(rij.impHeightMm),
        techniques: [],
      }
      if (!bestaand.techniques.some((t) => t.code === techniek)) {
        bestaand.techniques.push({
          code: techniek,
          maxColors: kleuren(rij.maxColours),
          isDefault: waar(rij.default),
        })
      }
      perPositie.set(positie, bestaand)
    }

    return [...perPositie.values()]
  }

  // --- Drukprijzen ---------------------------------------------------------

  /**
   * De drukprijslijst van PF is een opzoektabel over formaat, kleuren en
   * aantal, met het aantal als ondergrens. Hij is dus vooraf plat te slaan,
   * anders dan die van midocean en ANDA (ADR-0016, ADR-0019).
   */
  async fetchPrintPriceTiers(context: ConnectorContext): Promise<CanonicalPrintPriceList> {
    const bestand = `printpricefeed_${this.code(context, 'printPrice')}_v3.json`
    const data = await this.haal<PfcPrintPriceFeed>(bestand, 'print price feed')

    const kop = eerste(data.decoCharges)
    const kosten = lijst(kop?.decoCharge ?? data.decoCharge)
    if (kosten.length === 0) {
      throw new ConnectorError(
        this.key, 'print price feed', 'De print price feed bevatte geen drukcodes.',
      )
    }

    const methodes: CanonicalPrintPriceList['methods'] = []
    const staffels: CanonicalPrintPriceTier[] = []

    for (const kost of kosten) {
      const printCode = tekst(kost.printCode)
      if (!printCode) continue

      methodes.push({
        printCode,
        description: tekst(kost.impMethod ?? kost.decoChargeDesc),
        ltmCharge: bedrag(kost.LTMCharge ?? kost.ltmCharge),
        priceDependence: tekst(kost.priceDependence),
      })
      staffels.push(...this.naarStaffels(printCode, kost))
    }

    return { currency: tekst(kop?.currency ?? data.currency) ?? 'EUR', methods: methodes, tiers: staffels }
  }

  private naarStaffels(printCode: string, kost: PfcDecoCharge): CanonicalPrintPriceTier[] {
    const uit: CanonicalPrintPriceTier[] = []

    for (const formaatGroep of lijst(kost.logoSizes)) {
      for (const formaat of lijst(formaatGroep.logoSize)) {
        // 0 betekent volgens de handleiding "niet van toepassing". Dat is iets
        // anders dan een logo van nul vierkante centimeter, dus staat het als
        // nul in de staffel en beslist de calculatie wat ermee gebeurt.
        const logoSizeCm2 = getal(formaat.logoSizeCm2) ?? 0

        for (const kleurGroep of lijst(formaat.amountColors)) {
          for (const kleur of lijst(kleurGroep.amountColor)) {
            const aantalKleuren = kleuren(kleur.amountColorsId)

            for (const setupGroep of lijst(kleur.amountSetupCharges)) {
              for (const setup of lijst(setupGroep.amountSetupCharge)) {
                const setupCost = bedrag(setup.SetupCharge ?? setup.setupCharge) ?? '0'

                for (const prijsGroep of lijst(setup.decoPrices)) {
                  for (const prijs of lijst(prijsGroep.decoPrice)) {
                    const minQuantity = getal(prijs.decoPriceFromQty)
                    const unitPrice = bedrag(prijs.price ?? prijs['#text'])
                    if (minQuantity === null || unitPrice === null) continue

                    uit.push({
                      printCode,
                      logoSizeCm2,
                      colors: aantalKleuren,
                      minQuantity,
                      unitPrice,
                      setupCost,
                    })
                  }
                }
              }
            }
          }
        }
      }
    }

    return uit.sort((a, b) => a.minQuantity - b.minQuantity)
  }
}
