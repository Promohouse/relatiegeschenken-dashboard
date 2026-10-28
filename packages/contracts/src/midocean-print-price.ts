import Decimal from 'decimal.js'
import { round2, round4 } from './money'
import { parseOptionalSupplierDecimal, parseSupplierDecimal } from './supplier-values'

/**
 * De drukprijs van midocean uitrekenen.
 *
 * Bij midocean is een drukprijs geen opzoeking maar een berekening: vier
 * prijstypes, een setup die per kleur of per positie telt, een handlingprijs
 * per stuk, en een uitzondering voor techniek ST. De gegevens komen uit
 * `printpricelist/2.0`, de configuratie (positie, techniek, aantal kleuren,
 * formaat) uit `printdata/1.0` en uit wat de klant wil.
 *
 * Dit staat in contracts en niet in de connector, omdat de offertecalculator,
 * het orderscherm en straks de webshop er alle drie mee moeten rekenen
 * (harde regel 11).
 *
 * Bron: midocean API implementation guide v1.12.2, hoofdstuk Print Pricelist
 * 2.0 en Appendix F. Zie docs/leveranciers/midocean.md voor de twee punten in
 * die appendix die intern niet kloppen; die zijn hier niet weggepoetst.
 */

export type PrintPricingType =
  | 'NumberOfPositions'
  | 'NumberOfColours'
  | 'AreaRange'
  | 'ColourAreaRange'

export interface PrintPriceScale {
  /** Vanaf welk aantal stuks deze prijs geldt. */
  minimumQuantity: number
  price: Decimal.Value
  /** Prijs voor de tweede en volgende kleur; leeg als die niet bestaat. */
  nextPrice?: Decimal.Value | null
}

export interface PrintVarCost {
  /** Letter van het oppervlaktebereik (A, B, C...), leeg bij de andere types. */
  rangeId?: string | null
  /** Oppervlakte in cm2 waarvoor dit bereik geldt. Beide 0 = geen bereik. */
  areaFrom?: number | null
  areaTo?: number | null
  scales: PrintPriceScale[]
}

export interface PrintTechniquePrice {
  /** Technieksleutel van midocean, bijvoorbeeld B, S2, TD, ST. */
  id: string
  pricingType: PrintPricingType
  /** Eenmalige voorbereidingskosten. */
  setup: Decimal.Value
  /** Lagere setup bij een herhaalorder; leeg betekent: geen korting. */
  setupRepeat?: Decimal.Value | null
  /**
   * "X" betekent: vanaf de tweede kleur geldt `nextPrice`. Elke andere waarde
   * (waaronder "false" en leeg) betekent: elke kleur kost hetzelfde.
   */
  nextColourCostIndicator?: string | null
}

export interface PrintCostInput {
  technique: PrintTechniquePrice
  varCosts: PrintVarCost[]
  /** Handlingprijs per stuk, uit `print_manipulations` bij de code van het product. */
  manipulationPrice?: Decimal.Value | null
  /** Aantal stuks van deze orderregel. */
  quantity: number
  /** Aantal kleuren in het logo. */
  colours: number
  /** Oppervlakte van het logo in cm2; alleen nodig bij de twee Area-types. */
  areaCm2?: number | null
  /** Herhaalorder: dan geldt `setupRepeat` als die er is. */
  isRepeat?: boolean
  /**
   * Alleen voor techniek ST: op een gekleurd artikel wordt eerst een witte
   * onderlaag gedrukt, en dat kost eenmaal `nextPrice` maal het aantal extra.
   */
  itemIsColoured?: boolean
}

export interface PrintCostBreakdown {
  /** Voorbereiding: per kleur bij de kleurgebaseerde types, anders eenmalig. */
  setupCost: Decimal
  /** Het drukwerk zelf. */
  printCost: Decimal
  /** Handling: prijs per stuk maal aantal. */
  handlingCost: Decimal
  /** Som van de drie, afgerond op centen. */
  total: Decimal
  /** Welke staffel gekozen is; maakt een prijs navraagbaar. */
  scaleMinimumQuantity: number
  /** Welk oppervlaktebereik gekozen is, als het prijstype daarmee werkt. */
  rangeId: string | null
}

export class PrintPriceError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PrintPriceError'
  }
}

const KLEURGEBASEERD: PrintPricingType[] = ['NumberOfColours', 'ColourAreaRange']
const OPPERVLAKTEGEBASEERD: PrintPricingType[] = ['AreaRange', 'ColourAreaRange']

/** Techniek met een witte onderlaag op gekleurde artikelen. */
const WITTE_ONDERLAAG = 'ST'

/**
 * Het oppervlaktebereik waar dit logo in valt.
 *
 * Bij de types zonder bereik is er één rij met lege grenzen; die wordt dan
 * gekozen. Bij de Area-types moet het oppervlak bekend zijn, anders is er geen
 * prijs - dat is een fout en geen nul.
 */
function kiesBereik(varCosts: PrintVarCost[], input: PrintCostInput): PrintVarCost {
  if (!OPPERVLAKTEGEBASEERD.includes(input.technique.pricingType)) {
    const eerste = varCosts[0]
    if (!eerste) {
      throw new PrintPriceError(`Techniek ${input.technique.id} heeft geen prijsgegevens.`)
    }
    return eerste
  }

  if (input.areaCm2 == null) {
    throw new PrintPriceError(
      `Techniek ${input.technique.id} rekent per oppervlakte, dus het formaat van het logo in cm2 is nodig.`,
    )
  }

  const passend = varCosts.find((v) => {
    const van = v.areaFrom ?? 0
    const tot = v.areaTo ?? 0
    // Een bereik dat op 0 eindigt is onbegrensd aan de bovenkant.
    return input.areaCm2! > van && (tot === 0 || input.areaCm2! <= tot)
  })

  if (!passend) {
    throw new PrintPriceError(
      `Voor ${input.areaCm2} cm2 is bij techniek ${input.technique.id} geen prijsbereik opgegeven.`,
    )
  }
  return passend
}

/** De staffel die bij dit aantal hoort: de hoogste drempel die het aantal haalt. */
function kiesStaffel(scales: PrintPriceScale[], quantity: number): PrintPriceScale {
  const gekozen = scales
    .filter((s) => s.minimumQuantity <= quantity)
    .sort((a, b) => b.minimumQuantity - a.minimumQuantity)[0]

  if (!gekozen) {
    throw new PrintPriceError(`Er is geen drukstaffel voor ${quantity} stuks.`)
  }
  return gekozen
}

/**
 * De drukkosten voor **één drukpositie**.
 *
 * Heeft een order meerdere posities, dan roept de aanroeper dit per positie
 * aan en telt de uitkomsten op. Zo komen de voorbeelden van midocean eruit:
 * hun "x aantal posities" is bij ons de som over posities.
 *
 * Let op: daarmee telt ook de handling per positie mee. Dat volgt hun
 * rekenvoorbeeld, terwijl hun tekst zegt dat handling alleen van het product
 * afhangt. Dat verschil staat als vraag in docs/leveranciers/midocean.md en
 * hoort met een echte order bevestigd te worden.
 */
export function calculatePrintPositionCost(input: PrintCostInput): PrintCostBreakdown {
  if (!Number.isInteger(input.quantity) || input.quantity < 1) {
    throw new PrintPriceError('Het aantal stuks moet een geheel getal groter dan nul zijn.')
  }
  if (!Number.isInteger(input.colours) || input.colours < 1) {
    throw new PrintPriceError('Het aantal kleuren moet een geheel getal groter dan nul zijn.')
  }

  const { technique } = input
  const bereik = kiesBereik(input.varCosts, input)
  const staffel = kiesStaffel(bereik.scales, input.quantity)

  const aantal = new Decimal(input.quantity)
  const kleuren = new Decimal(input.colours)
  const prijs = parseSupplierDecimal(staffel.price, `techniek ${technique.id} prijs`)
  const volgendePrijs = parseOptionalSupplierDecimal(
    staffel.nextPrice,
    `techniek ${technique.id} vervolgprijs`,
  )

  // setup_repeat geldt alleen bij een herhaalorder, en alleen als hij bestaat.
  const setupBasis =
    (input.isRepeat
      ? parseOptionalSupplierDecimal(technique.setupRepeat, `techniek ${technique.id} setup_repeat`)
      : null) ?? parseSupplierDecimal(technique.setup, `techniek ${technique.id} setup`)

  // Bij de kleurgebaseerde types wordt per kleur voorbereid.
  const setupCost = KLEURGEBASEERD.includes(technique.pricingType)
    ? setupBasis.times(kleuren)
    : setupBasis

  let printCost: Decimal
  if (KLEURGEBASEERD.includes(technique.pricingType)) {
    const apartePrijsVoorVolgendeKleuren =
      (technique.nextColourCostIndicator ?? '').trim().toUpperCase() === 'X' && volgendePrijs !== null

    printCost = apartePrijsVoorVolgendeKleuren
      ? aantal.times(prijs).plus(aantal.times(volgendePrijs!).times(kleuren.minus(1)))
      : aantal.times(prijs).times(kleuren)
  } else {
    // AreaRange en NumberOfPositions: het aantal kleuren doet niet mee.
    printCost = aantal.times(prijs)
  }

  // Techniek ST drukt op een gekleurd artikel eerst een witte onderlaag.
  if (technique.id.toUpperCase() === WITTE_ONDERLAAG && input.itemIsColoured) {
    const onderlaag = volgendePrijs ?? prijs
    printCost = printCost.plus(aantal.times(onderlaag))
  }

  const handlingPerStuk = parseOptionalSupplierDecimal(input.manipulationPrice, 'handling') ?? new Decimal(0)
  const handlingCost = aantal.times(handlingPerStuk)

  return {
    setupCost: round4(setupCost),
    printCost: round4(printCost),
    handlingCost: round4(handlingCost),
    total: round2(setupCost.plus(printCost).plus(handlingCost)),
    scaleMinimumQuantity: staffel.minimumQuantity,
    rangeId: bereik.rangeId?.trim() || null,
  }
}

/**
 * De drukkosten voor een hele orderregel: de som over alle posities.
 *
 * Elke positie heeft een eigen techniek, aantal kleuren en formaat; het aantal
 * stuks is van de regel en dus voor alle posities gelijk.
 */
export function calculatePrintCost(
  posities: PrintCostInput[],
): PrintCostBreakdown & { positions: PrintCostBreakdown[] } {
  if (posities.length === 0) {
    throw new PrintPriceError('Een drukprijs zonder drukpositie bestaat niet.')
  }

  const perPositie = posities.map(calculatePrintPositionCost)
  const som = (kies: (b: PrintCostBreakdown) => Decimal) =>
    perPositie.reduce((totaal, b) => totaal.plus(kies(b)), new Decimal(0))

  const setupCost = som((b) => b.setupCost)
  const printCost = som((b) => b.printCost)
  const handlingCost = som((b) => b.handlingCost)

  return {
    setupCost: round4(setupCost),
    printCost: round4(printCost),
    handlingCost: round4(handlingCost),
    total: round2(setupCost.plus(printCost).plus(handlingCost)),
    // Van een samengestelde prijs zijn deze twee niet één waarde; de details
    // staan per positie.
    scaleMinimumQuantity: perPositie[0].scaleMinimumQuantity,
    rangeId: null,
    positions: perPositie,
  }
}
