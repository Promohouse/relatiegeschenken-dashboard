/**
 * Uitgaande leveringen.
 *
 * Kernregel uit de opdracht: een order is pas volledig geleverd wanneer alle
 * relevante aantallen daadwerkelijk als geleverd zijn geregistreerd. Een
 * deellevering mag nooit tot volledige afronding leiden.
 *
 * "Relevant" sluit geannuleerde regels uit: die horen een order niet eeuwig
 * open te houden.
 */

export type LogisticsStatus =
  | 'NONE'
  | 'EXPECTED'
  | 'PREPARED'
  | 'SHIPPED'
  | 'PARTIALLY_DELIVERED'
  | 'DELIVERED'

export interface ShippableLine {
  quantity: number
  /** Aantal dat in een verzonden of geleverde zending zit. */
  shipped: number
  /** Aantal dat in een geleverde zending zit. */
  delivered: number
  /** Geannuleerde regels tellen niet mee voor volledige levering. */
  isCancelled?: boolean
}

const relevant = (lines: ShippableLine[]) => lines.filter((l) => !l.isCancelled)

export const sumQuantity = (lines: ShippableLine[]) => relevant(lines).reduce((s, l) => s + l.quantity, 0)
export const sumShipped = (lines: ShippableLine[]) => relevant(lines).reduce((s, l) => s + l.shipped, 0)
export const sumDelivered = (lines: ShippableLine[]) => relevant(lines).reduce((s, l) => s + l.delivered, 0)

/** Meer verzonden dan besteld. Moet opvallen, nooit stil gebeuren. */
export function isOverShipped(lines: ShippableLine[]): boolean {
  return lines.some((l) => l.shipped > l.quantity || l.delivered > l.shipped)
}

/** Resterend te verzenden aantal per regel. */
export function openToShip(lines: ShippableLine[]): number[] {
  return lines.map((l) => (l.isCancelled ? 0 : Math.max(0, l.quantity - l.shipped)))
}

/**
 * Logistieke status van één orderregel.
 *
 * Een handmatige status die iets zegt wat zendingen niet weten (EXPECTED,
 * PREPARED) blijft staan zolang er niets verzonden is.
 */
export function deriveLineLogisticsStatus(
  line: ShippableLine,
  current: LogisticsStatus = 'NONE',
): LogisticsStatus {
  if (line.isCancelled) return current
  if (line.delivered >= line.quantity && line.quantity > 0) return 'DELIVERED'
  if (line.delivered > 0) return 'PARTIALLY_DELIVERED'
  if (line.shipped > 0) return 'SHIPPED'
  return current === 'SHIPPED' || current === 'PARTIALLY_DELIVERED' || current === 'DELIVERED'
    ? 'NONE'
    : current
}

/**
 * Samenvattende logistieke status van de order. Afgeleid, nooit opgeslagen als
 * waarheid: de regels zijn de waarheid.
 */
export function deriveOrderLogisticsStatus(
  lines: ShippableLine[],
  current: LogisticsStatus = 'NONE',
): LogisticsStatus {
  const open = relevant(lines)
  if (open.length === 0) return current

  if (open.every((l) => l.delivered >= l.quantity && l.quantity > 0)) return 'DELIVERED'
  if (open.some((l) => l.delivered > 0)) return 'PARTIALLY_DELIVERED'
  if (open.some((l) => l.shipped > 0)) return 'SHIPPED'
  return current === 'SHIPPED' || current === 'PARTIALLY_DELIVERED' || current === 'DELIVERED'
    ? 'NONE'
    : current
}

/**
 * Mag de order administratief afgerond worden op logistieke grond?
 * Uitsluitend als elke relevante regel volledig geleverd is.
 */
export function isOrderFullyDelivered(lines: ShippableLine[]): boolean {
  const open = relevant(lines)
  return open.length > 0 && open.every((l) => l.quantity > 0 && l.delivered >= l.quantity)
}
