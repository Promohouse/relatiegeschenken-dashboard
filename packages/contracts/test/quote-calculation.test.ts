import { describe, expect, it } from 'vitest'
import {
  calculateQuoteLine, maxPrintAreaCm2, salePriceForMargin, type QuoteLineInput,
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

describe('prijs per stuk, alles bij elkaar', () => {
  // Dit is het bedrag waar een klant naar vraagt: wat kost er één?
  const metDruk: QuoteLineInput = {
    ...basis,
    printPositions: [
      {
        positionName: 'Voorzijde',
        methodName: 'Zeefdruk',
        colors: 1,
        unitPurchaseCost: '0.4400',
        setupPurchaseCost: '31.5000',
      },
    ],
  }

  it('telt artikel, bedrukking en instelkosten bij elkaar', () => {
    const r = calculateQuoteLine(metDruk)
    // Subtotaal gedeeld door het aantal.
    expect(r.allInUnitPrice.toFixed(4)).toBe(
      r.subtotalExclVat.dividedBy(250).toDecimalPlaces(4).toFixed(4),
    )
    // En meer dan de kale artikelprijs, want er wordt bedrukt.
    expect(r.allInUnitPrice.greaterThan(r.effectiveUnitPrice)).toBe(true)
  })

  it('daalt als er meer besteld wordt, omdat de instelkosten verdeeld worden', () => {
    // Precies de reden dat dit bedrag altijd met het aantal erbij hoort: bij
    // 100 stuks weegt dezelfde setup vijf keer zo zwaar als bij 500.
    const honderd = calculateQuoteLine({ ...metDruk, quantity: 100 })
    const vijfhonderd = calculateQuoteLine({ ...metDruk, quantity: 500 })

    expect(honderd.allInUnitPrice.greaterThan(vijfhonderd.allInUnitPrice)).toBe(true)
    // Het verschil is de setup: 66,1487 over 100 versus over 500.
    const verschil = honderd.allInUnitPrice.minus(vijfhonderd.allInUnitPrice)
    expect(verschil.toFixed(2)).toBe('0.53')
  })

  it('is zonder bedrukking gelijk aan de prijs na korting', () => {
    const r = calculateQuoteLine(basis)
    expect(r.allInUnitPrice.toFixed(2)).toBe(r.effectiveUnitPrice.toFixed(2))
  })
})

describe('maxPrintAreaCm2', () => {
  it('rekent millimeters om naar vierkante centimeters', () => {
    // 50 bij 30 millimeter is 1500 vierkante millimeter, oftewel 15 cm2.
    expect(maxPrintAreaCm2(50, 30)).toBe(15)
    expect(maxPrintAreaCm2('170', '90')).toBe(153)
  })

  it('rondt af op twee decimalen', () => {
    expect(maxPrintAreaCm2(33, 17)).toBe(5.61)
  })

  it('geeft null als de leverancier geen maximum opgeeft', () => {
    // Niets om op terug te vallen. Dan hoort de calculatie dat te zeggen in
    // plaats van met nul te rekenen, want nul kost niets.
    expect(maxPrintAreaCm2(null, 30)).toBeNull()
    expect(maxPrintAreaCm2(50, null)).toBeNull()
    expect(maxPrintAreaCm2(undefined, undefined)).toBeNull()
  })

  it('geeft null bij een maat van nul of minder', () => {
    expect(maxPrintAreaCm2(0, 30)).toBeNull()
    expect(maxPrintAreaCm2(50, 0)).toBeNull()
    expect(maxPrintAreaCm2(-10, 30)).toBeNull()
  })
})
