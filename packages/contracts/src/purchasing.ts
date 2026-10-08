/**
 * Inkooplogica die zowel de backend als de interface nodig heeft.
 * Deelontvangsten zijn normaal: een inkooporder is pas ontvangen als elke
 * regel volledig geleverd is.
 */

export type PurchaseOrderStatus =
  | 'DRAFT'
  | 'SENT'
  | 'CONFIRMED'
  | 'IN_PRODUCTION'
  | 'PARTIALLY_RECEIVED'
  | 'RECEIVED'
  | 'CANCELLED'

export interface ReceivableLine {
  quantity: number
  quantityReceived: number
}

export const sumOrdered = (lines: ReceivableLine[]) => lines.reduce((s, l) => s + l.quantity, 0)
export const sumReceived = (lines: ReceivableLine[]) => lines.reduce((s, l) => s + l.quantityReceived, 0)

/** Meer ontvangen dan besteld. Mag nooit stil gebeuren; moet opvallen. */
export function isOverReceived(lines: ReceivableLine[]): boolean {
  return lines.some((l) => l.quantityReceived > l.quantity)
}

/**
 * Leidt de inkooporderstatus af uit de ontvangen aantallen.
 *
 * - Een geannuleerde order blijft geannuleerd.
 * - Alles volledig ontvangen: RECEIVED.
 * - Deels ontvangen: PARTIALLY_RECEIVED.
 * - Nog niets ontvangen: de handmatige status blijft staan (DRAFT, SENT,
 *   CONFIRMED, IN_PRODUCTION), want die zegt iets wat ontvangsten niet weten.
 */
export function derivePurchaseOrderStatus(
  lines: ReceivableLine[],
  current: PurchaseOrderStatus,
): PurchaseOrderStatus {
  if (current === 'CANCELLED') return 'CANCELLED'
  if (lines.length === 0) return current

  const received = sumReceived(lines)
  if (received === 0) return current
  const complete = lines.every((l) => l.quantityReceived >= l.quantity)
  return complete ? 'RECEIVED' : 'PARTIALLY_RECEIVED'
}

/** Resterend aantal per regel, voor het ontvangstscherm. */
export function openQuantities(lines: ReceivableLine[]): number[] {
  return lines.map((l) => Math.max(0, l.quantity - l.quantityReceived))
}
