import { describe, it, expect } from 'vitest'
import {
  derivePurchaseOrderStatus, isOverReceived, openQuantities,
  sumOrdered, sumReceived, type ReceivableLine,
} from '../src/purchasing'

const line = (quantity: number, quantityReceived: number): ReceivableLine => ({ quantity, quantityReceived })

describe('inkooporderstatus uit ontvangsten', () => {
  it('laat de handmatige status staan zolang er niets ontvangen is', () => {
    expect(derivePurchaseOrderStatus([line(100, 0)], 'SENT')).toBe('SENT')
    expect(derivePurchaseOrderStatus([line(100, 0)], 'CONFIRMED')).toBe('CONFIRMED')
    expect(derivePurchaseOrderStatus([line(100, 0)], 'IN_PRODUCTION')).toBe('IN_PRODUCTION')
  })

  it('wordt deels ontvangen bij een eerste deellevering', () => {
    expect(derivePurchaseOrderStatus([line(250, 100)], 'CONFIRMED')).toBe('PARTIALLY_RECEIVED')
  })

  it('wordt deels ontvangen als één van meerdere regels nog openstaat', () => {
    const lines = [line(250, 250), line(100, 0)]
    expect(derivePurchaseOrderStatus(lines, 'CONFIRMED')).toBe('PARTIALLY_RECEIVED')
  })

  it('wordt ontvangen als elke regel volledig geleverd is', () => {
    const lines = [line(250, 250), line(100, 100)]
    expect(derivePurchaseOrderStatus(lines, 'PARTIALLY_RECEIVED')).toBe('RECEIVED')
  })

  it('laat een geannuleerde order geannuleerd', () => {
    expect(derivePurchaseOrderStatus([line(100, 100)], 'CANCELLED')).toBe('CANCELLED')
  })

  it('verandert niets bij een order zonder regels', () => {
    expect(derivePurchaseOrderStatus([], 'DRAFT')).toBe('DRAFT')
  })
})

describe('aantallen', () => {
  it('telt besteld en ontvangen op', () => {
    const lines = [line(250, 100), line(100, 40)]
    expect(sumOrdered(lines)).toBe(350)
    expect(sumReceived(lines)).toBe(140)
  })

  it('berekent het resterende aantal per regel', () => {
    expect(openQuantities([line(250, 100), line(100, 100), line(50, 60)])).toEqual([150, 0, 0])
  })

  it('signaleert een te grote levering', () => {
    expect(isOverReceived([line(100, 101)])).toBe(true)
    expect(isOverReceived([line(100, 100)])).toBe(false)
  })
})
