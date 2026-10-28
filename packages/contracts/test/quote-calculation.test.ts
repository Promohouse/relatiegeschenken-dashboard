import { describe, expect, it } from 'vitest'
import {
  calculateQuoteLine, salePriceForMargin, type QuoteLineInput,
} from '../src/quote-calculation'

/**
 * De offertecalculatie. De som die uiteindelijk bepaalt wat er verdiend wordt,
 * dus hier staan de gevallen die in de praktijk misgaan.
 */

const basis: QuoteLineInput = {
  quantity: 250,
  unitPurchasePrice: '4.3165',
  unitSalePrice: '9.0647',
  priceOrigin: 'RULE',
  vatRate: 21,
}

describe('marge op de verkoopprijs, niet opslag op de inkoop', () => {
  it('rekent 40% marge als een opslag van 66,7%', () => {
    // Dit is de verwarring waar in deze handel het vaakst geld mee verloren
    // gaat: 40% marge is niet hetzelfde als 40% erbij.
    expect(salePriceForMargin('6.00', 40).toFixed(4)).toBe('10.0000')
    expect(salePriceForMargin('6.00', 0).toFixed(4)).toBe('6.0000')
  })

  it('weigert een marge van 100% of meer', () => {
    expect(() => salePriceForMargin('6.00', 100)).toThrow(/100%/)
  })
})

describe('een regel zonder bedrukking', () => {
  it('rekent subtotaal, btw en marge', () => {
    const r = calculateQuoteLine(basis)

    expect(r.subtotalExclVat.toFixed(2)).toBe('2266.18') // 250 * 9,0647
    expect(r.vatAmount.toFixed(2)).toBe('475.90')
    expect(r.totalInclVat.toFixed(2)).toBe('2742.08')
    expect(r.purchaseTotal.toFixed(2)).toBe('1079.13')
    expect(r.marginAmount.toFixed(2)).toBe('1187.05')
    expect(r.marginPercent.toFixed(2)).toBe('52.38')
    expect(r.belowCost).toBe(false)
  })

  it('verwerkt een korting in de effectieve prijs en in de marge', () => {
    const r = calculateQuoteLine({ ...basis, discountPercent: 10 })

    expect(r.effectiveUnitPrice.toFixed(4)).toBe('8.1582')
    expect(r.subtotalExclVat.toFixed(2)).toBe('2039.56')
    // De inkoop verandert niet, dus de marge daalt met het hele kortingsbedrag.
    expect(r.purchaseTotal.toFixed(2)).toBe('1079.13')
    expect(r.marginAmount.toFixed(2)).toBe('960.43')
  })
})

describe('bedrukking', () => {
  const metDruk: QuoteLineInput = {
    ...basis,
    printPositions: [
      {
        positionName: 'Voorzijde',
        methodName: 'Zeefdruk',
        colors: 2,
        unitPurchaseCost: '0.4400',
        setupPurchaseCost: '31.5000',
      },
    ],
  }

  it('volgt standaard de marge van het artikel', () => {
    const r = calculateQuoteLine(metDruk)
    const positie = r.printPositions[0]

    // Het artikel heeft 52,38% marge; het drukwerk krijgt dezelfde.
    expect(positie.marginPercent.toFixed(2)).toBe('52.38')
    expect(positie.unitSalePrice.toFixed(4)).toBe('0.9240')
    expect(positie.setupSaleCost.toFixed(4)).toBe('66.1487')
  })

  it('telt de inkoop van het drukwerk mee in de marge', () => {
    const r = calculateQuoteLine(metDruk)

    // Inkoop: 250 * (4,3165 + 0,44) + 31,50 instelkosten.
    expect(r.purchaseTotal.toFixed(2)).toBe('1220.63')
    // Verkoop: 250 * (9,0647 + 0,9240) + 66,148.
    expect(r.subtotalExclVat.toFixed(2)).toBe('2563.32')
    expect(r.marginAmount.toFixed(2)).toBe('1342.69')
  })

  it('laat een eigen marge op het drukwerk toe', () => {
    const r = calculateQuoteLine({
      ...metDruk,
      printPositions: [{ ...metDruk.printPositions![0], marginPercent: 25 }],
    })
    expect(r.printPositions[0].unitSalePrice.toFixed(4)).toBe('0.5867')
  })

  it('rekent meerdere posities los van elkaar', () => {
    const r = calculateQuoteLine({
      ...basis,
      printPositions: [
        { positionName: 'Voorzijde', methodName: 'Zeefdruk', colors: 1, unitPurchaseCost: '0.4400', setupPurchaseCost: '31.5000' },
        { positionName: 'Achterzijde', methodName: 'Laseren', colors: 1, unitPurchaseCost: '0.8000', setupPurchaseCost: '45.0000' },
      ],
    })

    expect(r.printPositions).toHaveLength(2)
    // Beide instelkosten komen eenmalig in het subtotaal.
    expect(r.setupTotal.toFixed(2)).toBe('160.65')
  })

  it('rekent niets voor een bedrukking die niets kost', () => {
    const r = calculateQuoteLine({
      ...basis,
      printPositions: [{ positionName: 'Voorzijde', methodName: 'Inbegrepen', colors: 1, unitPurchaseCost: '0', setupPurchaseCost: '0' }],
    })
    expect(r.printPositions[0].unitSalePrice.toFixed(2)).toBe('0.00')
    expect(r.subtotalExclVat.toFixed(2)).toBe('2266.18')
  })
})

describe('handmatige prijs', () => {
  it('vervangt de berekende prijs en herberekent de marge', () => {
    const r = calculateQuoteLine({ ...basis, manualUnitSalePrice: '7.5000' })

    expect(r.priceOrigin).toBe('MANUAL')
    // De berekende prijs blijft zichtbaar, zodat te zien is wat er is weggegeven.
    expect(r.calculatedUnitSalePrice.toFixed(4)).toBe('9.0647')
    expect(r.effectiveUnitPrice.toFixed(4)).toBe('7.5000')
    expect(r.marginAmount.toFixed(2)).toBe('795.87')
    expect(r.marginPercent.toFixed(2)).toBe('42.45')
  })

  it('laat het drukwerk de nieuwe marge volgen, niet de oude', () => {
    const r = calculateQuoteLine({
      ...basis,
      manualUnitSalePrice: '7.5000',
      printPositions: [{ positionName: 'Voorzijde', methodName: 'Zeefdruk', colors: 1, unitPurchaseCost: '0.4400', setupPurchaseCost: '0' }],
    })
    // Wie het artikel goedkoper weggeeft, geeft het drukwerk ook goedkoper weg.
    expect(r.printPositions[0].marginPercent.toFixed(2)).toBe('42.45')
  })

  it('meldt het als de prijs onder de inkoop ligt', () => {
    const r = calculateQuoteLine({ ...basis, manualUnitSalePrice: '3.0000' })
    expect(r.belowCost).toBe(true)
    expect(r.marginAmount.isNegative()).toBe(true)
  })

  it('behandelt nul als een echte prijs en niet als leeg', () => {
    // Weggeven is een keuze; het mag alleen niet stilletjes gebeuren.
    const r = calculateQuoteLine({ ...basis, manualUnitSalePrice: '0' })
    expect(r.priceOrigin).toBe('MANUAL')
    expect(r.subtotalExclVat.toFixed(2)).toBe('0.00')
    expect(r.belowCost).toBe(true)
  })
})

describe('btw-regimes', () => {
  it('rekent bij verlegging geen btw, maar wel dezelfde marge', () => {
    const binnenland = calculateQuoteLine(basis)
    const verlegd = calculateQuoteLine({ ...basis, vatRegime: 'EU_REVERSE_CHARGE' })

    expect(verlegd.vatAmount.toFixed(2)).toBe('0.00')
    expect(verlegd.totalInclVat.toFixed(2)).toBe(verlegd.subtotalExclVat.toFixed(2))
    expect(verlegd.marginAmount.toFixed(2)).toBe(binnenland.marginAmount.toFixed(2))
  })
})

describe('weigeren in plaats van gokken', () => {
  it('weigert een aantal dat geen geheel getal groter dan nul is', () => {
    expect(() => calculateQuoteLine({ ...basis, quantity: 0 })).toThrow(/groter dan nul/)
    expect(() => calculateQuoteLine({ ...basis, quantity: 2.5 })).toThrow(/geheel getal/)
  })
})
