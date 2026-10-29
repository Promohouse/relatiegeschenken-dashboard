/**
 * De vorm van de PF Concept-datafeeds, versie v3.
 *
 * Overgenomen uit de *Data feeds manual* v3.6.7 (mei 2026) en hun eigen
 * voorbeeldbestanden. Niets is geverifieerd tegen een echte respons: de feeds
 * zijn nog niet geactiveerd. Zie docs/leveranciers/pf-concept.md.
 *
 * Alles optioneel: wat de handleiding beschrijft hoeft niet in elk bestand te
 * staan, en een ontbrekend veld is geen reden om een hele import te laten
 * vallen. De connector beslist wat werkelijk verplicht is.
 *
 * Wij lezen JSON en geen XML (ADR-0019). Dat is ook waarom deze types er zo
 * uitzien: in hun JSON zijn de groepsvelden arrays met één element, waar XML
 * er een enkel knooppunt van maakt. `Lijst<T>` vangt beide vormen op, want de
 * handleiding is er niet eenduidig over en een enkel element zou anders stil
 * overgeslagen worden.
 */

/** Eén element of een lijst; beide komen voor in hun bestanden. */
export type Lijst<T> = T | T[] | undefined | null

// --- Product feed ----------------------------------------------------------

export interface PfcMeasurements {
  weightGr?: string
  grammage?: string
  lengthCm?: string
  heightCm?: string
  widthCm?: string
  diameterCm?: string
  circumferenceCm?: string
  sizeCombined?: string
  SizeCombined?: string
  giftboxLengthCm?: string
  giftboxHeightCm?: string
  giftboxWidthCm?: string
  giftboxDiameterCm?: string
  giftboxSizeCombined?: string
}

export interface PfcDecoDefault {
  method?: string
  leadTime?: string
  impLocationDefault?: string
  impWidthDefaultMm?: number | string
  impHeightDefaultMm?: number | string
  impDiameterDefaultMm?: number | string
  /** Getal, of tekst wanneer fullcolour van toepassing is. */
  maxColoursDefault?: number | string
  impSizeDefaultMm?: number | string
  imageImprintDefault?: string
  /** "YES" betekent: dit artikel mag alleen bedrukt verkocht worden. */
  decorationMandatory?: string
  decoComments?: string
  decoComment?: string
}

export interface PfcColor {
  colorCode?: string
  colorDesc?: string
  baseColor?: string
  hexColor?: string
  pmsColorReference?: string
}

export interface PfcCategoryData {
  groupCode?: string
  groupDesc?: string
  catCode?: string
  catDesc?: string
}

export interface PfcImageData {
  imageMain?: string
  imageLogoY1?: string
  imageLogoY2?: string
  imageLogoY3?: string
  imagePackage?: string
  imageFront?: string
  imageBack?: string
  imageExtra1?: string
  imageExtra2?: string
  imageExtra3?: string
  imageDetail1?: string
  imageDetail2?: string
  /** De handleiding schrijft dit veld met een l ervoor; vermoedelijk een tikfout. */
  limageDetail3?: string
  imageDetail3?: string
  imageGroup?: string
  imageMood1?: string
  imageMood2?: string
  imageMood3?: string
  imageModel?: string
  videoUrl1?: string
  videoUrl2?: string
}

export interface PfcProductItem {
  itemCode?: string
  size?: string
  sizeGrid?: string
  gender?: string
  measurements?: Lijst<PfcMeasurements>
  qtyPerCarton?: number | string
  decorationSettings?: Lijst<{ decoDefault?: Lijst<PfcDecoDefault> }>
  countryOfOrigin?: string
  hsCode?: string
  brand?: string
  categoryData?: Lijst<PfcCategoryData>
  colors?: Lijst<{ color?: Lijst<PfcColor> }>
  material?: string
  simpleMaterial?: string
  eanCode?: string
  launchDate?: string
  imageData?: Lijst<PfcImageData>
  /** Vermoedelijk het veld dat het assortiment aanwijst; nog te bevestigen. */
  markSegment?: string
  /** "true" betekent: loopt uit, verdwijnt zodra de voorraad op is. */
  isDiscontinued?: boolean | string
}

export interface PfcProductModel {
  modelCode?: string
  description?: string
  extDesc?: string
  keywords?: string
  productComments?: string
  items?: Lijst<{ item?: Lijst<PfcProductItem> }>
}

export interface PfcProductFeed {
  productfeed?: Lijst<{
    creationDateTime?: string
    language?: string
    department?: string
    version?: string
    models?: Lijst<{ model?: Lijst<PfcProductModel> }>
  }>
  /** In XML staat `models` een niveau hoger; in JSON soms ook. */
  models?: Lijst<{ model?: Lijst<PfcProductModel> }>
}

// --- Price feed ------------------------------------------------------------

export interface PfcPriceScale {
  /** Beginaantal van de staffel; precies onze minQuantity. */
  priceBar?: number | string
  /** Onze netto inkoopprijs. */
  nettPrice?: number | string
  type?: string
  /** Industrieprijs, niet de onze. */
  industryCol?: number | string
}

export interface PfcPriceItem {
  itemcode?: string
  itemCode?: string
  currency?: string
  clearance?: string
  /** Komma-gescheiden drukcodes, bijvoorbeeld "DOM001,DST01,GPE05". */
  decoCharge?: string
  minDecoQty?: number | string
  scales?: Lijst<{ numberOfScales?: number | string; scale?: Lijst<PfcPriceScale> }>
}

export interface PfcPriceFeed {
  priceInfo?: Lijst<{
    creationDateTime?: string
    language?: string
    department?: string
    version?: string
    models?: Lijst<{ model?: Lijst<PfcPriceModel> }>
  }>
  models?: Lijst<{ model?: Lijst<PfcPriceModel> }>
}

export interface PfcPriceModel {
  modelcode?: string
  modelCode?: string
  description?: string
  items?: Lijst<{ numberOfItems?: number | string; item?: Lijst<PfcPriceItem> }>
}

// --- Stock feed ------------------------------------------------------------

export interface PfcStockItem {
  itemCode?: string
  itemcode?: string
  stockDirect?: number | string
  stockNextPo?: number | string
  stockDateNextPo?: string
  /** De handleiding schrijft dit veld met een hoofdletter; de rest niet. */
  StockFuture?: number | string
  stockFuture?: number | string
  stockLocation?: string
}

export interface PfcStockFeed {
  stockFeed?: Lijst<{ models?: Lijst<{ model?: Lijst<PfcStockModel> }> }>
  models?: Lijst<{ model?: Lijst<PfcStockModel> }>
}

export interface PfcStockModel {
  modelCode?: string
  modelcode?: string
  description?: string
  items?: Lijst<{ item?: Lijst<PfcStockItem> }>
}

// --- Print data feed -------------------------------------------------------

export interface PfcPrintFeedRow {
  ref?: string | number
  impMethodCode?: string
  impMethod?: string
  /** Verwijst naar de drukcode in de print price feed. */
  printCode?: string
  impLocationCode?: string
  impLocation?: string
  /** Getal, of tekst wanneer fullcolour van toepassing is. */
  maxColours?: number | string
  impWidthMm?: number | string
  impHeightMm?: number | string
  impDiameterMm?: number | string
  maxAreaCm2?: number | string
  maxLogoSizeCm2?: number | string
  allLogoSizeCm2?: number | string
  allowedArtFile?: string
  allowedColorType?: string
  laserColor?: string
  leadTime?: number | string
  productionLocation?: string
  default?: boolean | string
}

export interface PfcPrintFeedRef {
  ref?: string | number
  imagePrintLine?: string
  svgFile?: string
}

export interface PfcPrintDataItem {
  itemCode?: string
  printfeedrefs?: Lijst<{ printfeedref?: Lijst<PfcPrintFeedRef> }>
}

export interface PfcPrintDataModel {
  modelCode?: string
  description?: string
  items?: Lijst<{ item?: Lijst<PfcPrintDataItem> }>
}

export interface PfcPrintDataFeed {
  printfeed?: Lijst<{
    models?: Lijst<{ model?: Lijst<PfcPrintDataModel> }>
    printFeedRows?: Lijst<{ printFeedRow?: Lijst<PfcPrintFeedRow> }>
  }>
  models?: Lijst<{ model?: Lijst<PfcPrintDataModel> }>
  printFeedRows?: Lijst<{ printFeedRow?: Lijst<PfcPrintFeedRow> }>
}

// --- Print price feed ------------------------------------------------------

export interface PfcDecoPrice {
  decoPriceFromQty?: number | string
  /** In XML de inhoud van het element, in JSON het veld `price`. */
  price?: number | string
  '#text'?: number | string
}

export interface PfcAmountSetupCharge {
  AmountSetupChargeId?: string | number
  amountSetupChargeId?: string | number
  SetupCharge?: number | string
  setupCharge?: number | string
  decoPrices?: Lijst<{ decoPrice?: Lijst<PfcDecoPrice> }>
}

export interface PfcAmountColor {
  amountColorsId?: string | number
  amountSetupCharges?: Lijst<{ amountSetupCharge?: Lijst<PfcAmountSetupCharge> }>
}

export interface PfcLogoSize {
  logoSizeCm2?: number | string
  itemCodeId?: string
  amountColors?: Lijst<{ amountColor?: Lijst<PfcAmountColor> }>
}

export interface PfcDecoCharge {
  printCode?: string
  decoChargeDesc?: string
  impMethod?: string
  LTMCharge?: number | string
  ltmCharge?: number | string
  /** Waarvan de prijs afhangt. Welke waarden hier staan is nog niet bevestigd. */
  priceDependence?: string
  logoSizes?: Lijst<{ logoSize?: Lijst<PfcLogoSize> }>
}

export interface PfcPrintPriceFeed {
  decoCharges?: Lijst<{
    currency?: string
    createdDateTime?: string
    decoCharge?: Lijst<PfcDecoCharge>
  }>
  currency?: string
  decoCharge?: Lijst<PfcDecoCharge>
}
