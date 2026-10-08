import { describe, it, expect } from 'vitest'
import Decimal from 'decimal.js'
import { calculateOrderLine, sumOrderTotals, effectiveVatRate, round2, formatEuro } from '../src/money'

describe('afronding', () => {
  it('rondt commercieel af: 0,005 gaat omhoog', () => {
    expect(round2('1.005').toFixed(2)).toBe('1.01')
    expect(round2('2.675').toFixed(2)).toBe('2.68')
  })

  it('heeft geen floating-pointfouten', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in JavaScript-getallen.
    expect(new Decimal('0.1').plus('0.2').toFixed(2)).toBe('0.30')
  })
})

describe('regeltotalen', () => {
  it('rekent aantal, stuksprijs en btw door', () => {
    const t = calculateOrderLine({ quantity: 250, unitSalePrice: '9.95', vatRate: 21 })
    expect(t.subtotalExclVat.toFixed(2)).toBe('2487.50')
    expect(t.vatAmount.toFixed(2)).toBe('522.38')
    expect(t.totalInclVat.toFixed(2)).toBe('3009.88')
  })

  it('verwerkt korting op de verkoopprijs', () => {
    const t = calculateOrderLine({ quantity: 100, unitSalePrice: '10.00', discountPercent: 10, vatRate: 21 })
    expect(t.subtotalExclVat.toFixed(2)).toBe('900.00')
  })

  it('telt bedrukkingskosten per stuk en instelkosten eenmalig', () => {
    const t = calculateOrderLine({
      quantity: 500,
      unitSalePrice: '1.45',
      vatRate: 21,
      printJobs: [{ unitPrice: '0.32', setupCost: '25' }],
    })
    // 500 * (1,45 + 0,32) = 885,00 plus 25,00 instelkosten
    expect(t.subtotalExclVat.toFixed(2)).toBe('910.00')
  })

  it('berekent marge uit de vastgelegde inkoopprijs', () => {
    const t = calculateOrderLine({ quantity: 100, unitSalePrice: '10.00', unitPurchasePrice: '4.00', vatRate: 21 })
    expect(t.purchaseTotal.toFixed(2)).toBe('400.00')
    expect(t.marginAmount.toFixed(2)).toBe('600.00')
    expect(t.marginPercent.toFixed(2)).toBe('60.00')
  })

  it('rekent geen btw bij verlegging, intracommunautair en export', () => {
    for (const regime of ['EU_REVERSE_CHARGE', 'EXPORT', 'DOMESTIC_SHIFTED'] as const) {
      const t = calculateOrderLine({ quantity: 10, unitSalePrice: '100', vatRate: 21, vatRegime: regime })
      expect(t.vatAmount.toFixed(2)).toBe('0.00')
      expect(t.totalInclVat.toFixed(2)).toBe('1000.00')
    }
    expect(effectiveVatRate('DOMESTIC', 21).toString()).toBe('21')
  })
})

describe('ordertotalen (ADR-0005: btw per regel, op twee decimalen)', () => {
  it('is de som van de afgeronde regelbedragen, zodat de factuur optelt', () => {
    // Drie regels die elk een halve cent btw-afronding opleveren.
    const lines = [
      calculateOrderLine({ quantity: 1, unitSalePrice: '0.05', vatRate: 21 }),
      calculateOrderLine({ quantity: 1, unitSalePrice: '0.05', vatRate: 21 }),
      calculateOrderLine({ quantity: 1, unitSalePrice: '0.05', vatRate: 21 }),
    ]
    // Per regel: 0,05 * 21% = 0,0105 -> afgerond 0,01
    for (const l of lines) expect(l.vatAmount.toFixed(2)).toBe('0.01')

    const totals = sumOrderTotals(lines)
    expect(totals.subtotalExclVat.toFixed(2)).toBe('0.15')
    // Som van de afgeronde regels: 0,03. Over het totaal gerekend zou het
    // 0,0315 -> 0,03 zijn; hier gelijk, maar de methode is bepalend.
    expect(totals.vatAmount.toFixed(2)).toBe('0.03')
    expect(totals.totalInclVat.toFixed(2)).toBe('0.18')
  })

  it('telt subtotaal, btw en totaal consistent op', () => {
    const lines = [
      calculateOrderLine({ quantity: 250, unitSalePrice: '9.95', unitPurchasePrice: '4.85', vatRate: 21 }),
      calculateOrderLine({ quantity: 500, unitSalePrice: '1.45', unitPurchasePrice: '0.62', vatRate: 21 }),
    ]
    const t = sumOrderTotals(lines)
    expect(t.subtotalExclVat.plus(t.vatAmount).toFixed(2)).toBe(t.totalInclVat.toFixed(2))
    expect(t.marginAmount.toFixed(2)).toBe(t.subtotalExclVat.minus(t.purchaseTotal).toFixed(2))
  })
})

describe('weergave', () => {
  it('toont bedragen in Nederlands formaat', () => {
    expect(formatEuro('1234.5')).toContain('1.234,50')
  })
})
