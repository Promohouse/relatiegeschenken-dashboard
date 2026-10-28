import { describe, it, expect } from 'vitest'
import {
  deriveLineLogisticsStatus, deriveOrderLogisticsStatus, isOrderFullyDelivered,
  isOverShipped, openToShip, sumDelivered, sumShipped, sumQuantity,
  type ShippableLine,
} from '../src/shipping'

const line = (quantity: number, shipped: number, delivered: number, isCancelled = false): ShippableLine =>
  ({ quantity, shipped, delivered, isCancelled })

describe('logistieke status per orderregel', () => {
  it('laat een handmatige status staan zolang er niets verzonden is', () => {
    expect(deriveLineLogisticsStatus(line(250, 0, 0), 'EXPECTED')).toBe('EXPECTED')
    expect(deriveLineLogisticsStatus(line(250, 0, 0), 'PREPARED')).toBe('PREPARED')
  })

  it('wordt verzonden zodra er iets onderweg is', () => {
    expect(deriveLineLogisticsStatus(line(250, 100, 0), 'PREPARED')).toBe('SHIPPED')
    expect(deriveLineLogisticsStatus(line(250, 250, 0), 'PREPARED')).toBe('SHIPPED')
  })

  it('wordt deels geleverd bij een eerste deellevering', () => {
    expect(deriveLineLogisticsStatus(line(250, 250, 100), 'SHIPPED')).toBe('PARTIALLY_DELIVERED')
  })

  it('wordt geleverd als het hele aantal geleverd is', () => {
    expect(deriveLineLogisticsStatus(line(250, 250, 250), 'PARTIALLY_DELIVERED')).toBe('DELIVERED')
  })

  it('laat een geannuleerde regel ongemoeid', () => {
    expect(deriveLineLogisticsStatus(line(250, 0, 0, true), 'EXPECTED')).toBe('EXPECTED')
  })
})

describe('samenvattende status van de order', () => {
  it('is pas geleverd als elke regel volledig geleverd is', () => {
    const deels = [line(250, 250, 250), line(100, 100, 0)]
    expect(deriveOrderLogisticsStatus(deels)).toBe('PARTIALLY_DELIVERED')
    expect(isOrderFullyDelivered(deels)).toBe(false)

    const volledig = [line(250, 250, 250), line(100, 100, 100)]
    expect(deriveOrderLogisticsStatus(volledig)).toBe('DELIVERED')
    expect(isOrderFullyDelivered(volledig)).toBe(true)
  })

  it('leidt een deellevering nooit tot volledige afronding', () => {
    // De harde eis uit de opdracht.
    const lines = [line(1000, 1000, 999)]
    expect(isOrderFullyDelivered(lines)).toBe(false)
    expect(deriveOrderLogisticsStatus(lines)).toBe('PARTIALLY_DELIVERED')
  })

  it('negeert geannuleerde regels bij volledige levering', () => {
    const lines = [line(250, 250, 250), line(100, 0, 0, true)]
    expect(isOrderFullyDelivered(lines)).toBe(true)
    expect(deriveOrderLogisticsStatus(lines)).toBe('DELIVERED')
  })

  it('beschouwt een order met alleen geannuleerde regels niet als geleverd', () => {
    expect(isOrderFullyDelivered([line(100, 0, 0, true)])).toBe(false)
  })

  it('is verzonden als er iets onderweg is maar nog niets geleverd', () => {
    expect(deriveOrderLogisticsStatus([line(250, 250, 0), line(100, 0, 0)])).toBe('SHIPPED')
  })
})

describe('aantallen en signalen', () => {
  it('telt besteld, verzonden en geleverd op zonder geannuleerde regels', () => {
    const lines = [line(250, 200, 100), line(100, 0, 0, true)]
    expect(sumQuantity(lines)).toBe(250)
    expect(sumShipped(lines)).toBe(200)
    expect(sumDelivered(lines)).toBe(100)
  })

  it('berekent wat er nog verzonden moet worden', () => {
    expect(openToShip([line(250, 100, 0), line(100, 100, 100), line(50, 0, 0, true)])).toEqual([150, 0, 0])
  })

  it('signaleert te veel verzonden of meer geleverd dan verzonden', () => {
    expect(isOverShipped([line(100, 101, 0)])).toBe(true)
    expect(isOverShipped([line(100, 50, 60)])).toBe(true)
    expect(isOverShipped([line(100, 100, 100)])).toBe(false)
  })
})
