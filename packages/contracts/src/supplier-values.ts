import Decimal from 'decimal.js'

/**
 * Waarden uit leveranciersdata omzetten naar iets waar we mee kunnen rekenen.
 *
 * Dit is de uitwerking van harde regel 2 voor binnenkomende data. midocean
 * levert bedragen als tekst met een decimale komma: `"price": "4,22"`.
 * `parseFloat("4,22")` geeft stilzwijgend `4`. Dat is geen afrondingsfout maar
 * een factor vijf, en het valt pas op in de marge van een order.
 *
 * Daarom: één functie, die weigert te gokken.
 */

export class SupplierValueError extends Error {
  constructor(
    readonly veld: string,
    readonly waarde: unknown,
  ) {
    super(`Veld "${veld}" bevat geen bruikbaar getal: ${JSON.stringify(waarde)}`)
    this.name = 'SupplierValueError'
  }
}

/**
 * Een bedrag of getal uit een leveranciersbestand.
 *
 * Aanvaardt een punt of een komma als decimaalteken, spaties eromheen, en een
 * getal dat al als number binnenkomt. Weigert alles waar meer dan één
 * scheidingsteken in staat: `"1.234,56"` en `"1,234.56"` zijn
 * duizendtalnotaties die per land anders uitpakken, en daar hoort een
 * expliciete afspraak bij in plaats van een gok.
 */
export function parseSupplierDecimal(waarde: unknown, veld = 'waarde'): Decimal {
  if (waarde instanceof Decimal) return waarde
  if (typeof waarde === 'number') {
    if (!Number.isFinite(waarde)) throw new SupplierValueError(veld, waarde)
    return new Decimal(waarde)
  }
  if (typeof waarde !== 'string') throw new SupplierValueError(veld, waarde)

  const schoon = waarde.trim()
  if (schoon === '') throw new SupplierValueError(veld, waarde)

  const scheidingstekens = (schoon.match(/[.,]/g) ?? []).length
  if (scheidingstekens > 1) throw new SupplierValueError(veld, waarde)

  const genormaliseerd = schoon.replace(',', '.')
  if (!/^-?\d+(\.\d+)?$/.test(genormaliseerd)) throw new SupplierValueError(veld, waarde)

  return new Decimal(genormaliseerd)
}

/**
 * Hetzelfde, maar een leeg veld betekent "niet opgegeven" en geen fout.
 *
 * Leveranciers gebruiken een lege string waar wij null bedoelen; midocean doet
 * dat bijvoorbeeld bij `next_price` als een techniek geen aparte vervolgprijs
 * kent. Alleen leeg en null gaan door, een onzinwaarde nog steeds niet.
 */
export function parseOptionalSupplierDecimal(waarde: unknown, veld = 'waarde'): Decimal | null {
  if (waarde === null || waarde === undefined) return null
  if (typeof waarde === 'string' && waarde.trim() === '') return null
  return parseSupplierDecimal(waarde, veld)
}

/**
 * Een geheel aantal, bijvoorbeeld een staffeldrempel of een voorraadaantal.
 * Een gebroken aantal is geen afronding waard: dat is een fout in de bron.
 */
export function parseSupplierInteger(waarde: unknown, veld = 'aantal'): number {
  const getal = parseSupplierDecimal(waarde, veld)
  if (!getal.isInteger()) throw new SupplierValueError(veld, waarde)
  return getal.toNumber()
}

/**
 * Een ja/nee-veld. midocean schrijft `"yes"`/`"no"` en `"true"`/`"false"`
 * door elkaar, afhankelijk van het veld.
 */
export function parseSupplierBoolean(waarde: unknown, veld = 'vlag'): boolean {
  if (typeof waarde === 'boolean') return waarde
  if (typeof waarde !== 'string') throw new SupplierValueError(veld, waarde)
  const schoon = waarde.trim().toLowerCase()
  if (['yes', 'true', 'y', '1', 'ja'].includes(schoon)) return true
  if (['no', 'false', 'n', '0', 'nee'].includes(schoon)) return false
  throw new SupplierValueError(veld, waarde)
}
