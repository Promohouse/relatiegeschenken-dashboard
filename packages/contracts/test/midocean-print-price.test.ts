import { describe, expect, it } from 'vitest'
import {
  calculatePrintCost, calculatePrintPositionCost, PrintPriceError,
  type PrintCostInput, type PrintVarCost,
} from '../src/midocean-print-price'

/**
 * De vier doorgerekende voorbeelden uit Appendix F van de midocean-handleiding
 * (v1.12.2). Als onze uitkomst afwijkt van die van midocean, moet dat hier
 * opvallen en niet pas op hun factuur.
 *
 * Twee voorbeelden kloppen intern niet; dat staat hieronder per geval en in
 * docs/leveranciers/midocean.md.
 */

const enkelBereik = (scales: { minimumQuantity: number; price: string; nextPrice?: string }[]): PrintVarCost[] => [
  { rangeId: '', areaFrom: 0, areaTo: 0, scales },
]

describe('Appendix F: prijstype NumberOfColours', () => {
  // Setup 29,25 | 1e kleur 0,16 | volgende kleur 0,8 | handling A 0,05
  // 100 stuks, 3 kleuren, 1 positie.
  const invoer: PrintCostInput = {
    technique: {
      id: 'B',
      pricingType: 'NumberOfColours',
      setup: '29,25',
      nextColourCostIndicator: 'false',
    },
    varCosts: enkelBereik([{ minimumQuantity: 1, price: '0,16', nextPrice: '0,8' }]),
    manipulationPrice: '0,05',
    quantity: 100,
    colours: 3,
  }

  it('rekent het drukwerk en de handling zoals midocean', () => {
    const uitkomst = calculatePrintPositionCost(invoer)
    expect(uitkomst.printCost.toFixed(2)).toBe('48.00') // 100 * 0,16 * 3
    expect(uitkomst.handlingCost.toFixed(2)).toBe('5.00') // 0,05 * 100
  })

  it('wijkt bewust af van het totaal in de tabel, want die telt niet op', () => {
    // De tabel zegt "29,25 * 3 colors = 88,5" en komt op 141,5 uit. 29,25 * 3
    // is 87,75; 88,5 hoort bij een setup van 29,50. Eén van beide is een
    // typefout in de handleiding (vraag 2 in docs/leveranciers/midocean.md).
    // Wij volgen de formule met de opgegeven setup.
    const uitkomst = calculatePrintPositionCost(invoer)
    expect(uitkomst.setupCost.toFixed(2)).toBe('87.75')
    expect(uitkomst.total.toFixed(2)).toBe('140.75')

    // Met setup 29,50 komt hun eigen totaal er wel uit.
    const metAndereSetup = calculatePrintPositionCost({
      ...invoer,
      technique: { ...invoer.technique, setup: '29,50' },
    })
    expect(metAndereSetup.total.toFixed(2)).toBe('141.50')
  })

  it('gebruikt de vervolgprijs alleen als de indicator X is', () => {
    const metX = calculatePrintPositionCost({
      ...invoer,
      technique: { ...invoer.technique, nextColourCostIndicator: 'X' },
    })
    // 100 * 0,16 + 100 * 0,8 * 2 = 16 + 160
    expect(metX.printCost.toFixed(2)).toBe('176.00')
  })
})

describe('Appendix F: prijstype ColourAreaRange', () => {
  // Setup 31,5 | bereik A 1e kleur 0,44, volgende 0,23 | handling A 0,05
  // 350 stuks, 5 kleuren, tot 150 cm2, 1 positie. Verwacht totaal: 651.
  const invoer: PrintCostInput = {
    technique: {
      id: 'E',
      pricingType: 'ColourAreaRange',
      setup: '31,50',
      nextColourCostIndicator: 'X',
    },
    varCosts: [
      { rangeId: 'A', areaFrom: 0, areaTo: 150, scales: [{ minimumQuantity: 1, price: '0,44', nextPrice: '0,23' }] },
      { rangeId: 'B', areaFrom: 150, areaTo: 300, scales: [{ minimumQuantity: 1, price: '0,88', nextPrice: '0,46' }] },
    ],
    manipulationPrice: '0,05',
    quantity: 350,
    colours: 5,
    areaCm2: 120,
  }

  it('komt uit op het bedrag uit de handleiding', () => {
    const uitkomst = calculatePrintPositionCost(invoer)
    expect(uitkomst.setupCost.toFixed(2)).toBe('157.50') // 31,5 * 5 kleuren
    expect(uitkomst.printCost.toFixed(2)).toBe('476.00') // 350*0,44 + 350*0,23*4
    expect(uitkomst.handlingCost.toFixed(2)).toBe('17.50')
    expect(uitkomst.total.toFixed(2)).toBe('651.00')
    expect(uitkomst.rangeId).toBe('A')
  })

  it('kiest het bereik op het formaat van het logo', () => {
    expect(calculatePrintPositionCost({ ...invoer, areaCm2: 200 }).rangeId).toBe('B')
  })
})

describe('Appendix F: prijstype AreaRange', () => {
  // Setup 29,5 | bereiken A 1,64 / B 1,86 / D 2,21 | handling A 0,05
  // 350 stuks, 2 posities. Verwachte totalen: 1242, 1396, 1641.
  const basis: PrintCostInput = {
    technique: { id: 'E', pricingType: 'AreaRange', setup: '29,50' },
    varCosts: [
      { rangeId: 'A', areaFrom: 0, areaTo: 8, scales: [{ minimumQuantity: 1, price: '1,64' }] },
      { rangeId: 'B', areaFrom: 8, areaTo: 15, scales: [{ minimumQuantity: 1, price: '1,86' }] },
      { rangeId: 'D', areaFrom: 15, areaTo: 0, scales: [{ minimumQuantity: 1, price: '2,21' }] },
    ],
    manipulationPrice: '0,05',
    quantity: 350,
    colours: 4,
  }

  it.each([
    { cm2: 5, bereik: 'A', totaal: '1242.00' },
    { cm2: 10, bereik: 'B', totaal: '1396.00' },
    { cm2: 25.01, bereik: 'D', totaal: '1641.00' },
  ])('$cm2 cm2 valt in bereik $bereik en kost $totaal voor twee posities', ({ cm2, bereik, totaal }) => {
    // Twee posities met dezelfde configuratie: bij midocean "x 2 positions",
    // bij ons de som over posities.
    const positie = { ...basis, areaCm2: cm2 }
    const uitkomst = calculatePrintCost([positie, positie])
    expect(uitkomst.positions[0].rangeId).toBe(bereik)
    expect(uitkomst.total.toFixed(2)).toBe(totaal)
  })

  it('negeert het aantal kleuren, want dit prijstype rekent op oppervlak', () => {
    const een = calculatePrintPositionCost({ ...basis, areaCm2: 5, colours: 1 })
    const acht = calculatePrintPositionCost({ ...basis, areaCm2: 5, colours: 8 })
    expect(een.total.toFixed(2)).toBe(acht.total.toFixed(2))
  })
})

describe('Appendix F: prijstype NumberOfPositions', () => {
  // Setup 45 | print 0,48 | handling C 0,14 | 250 stuks, 3 posities.
  // Verwacht totaal: 600.
  const positie: PrintCostInput = {
    technique: { id: 'P9', pricingType: 'NumberOfPositions', setup: '45,00' },
    varCosts: enkelBereik([{ minimumQuantity: 1, price: '0,48' }]),
    manipulationPrice: '0,14',
    quantity: 250,
    colours: 4,
  }

  it('komt uit op het bedrag uit de handleiding', () => {
    const uitkomst = calculatePrintCost([positie, positie, positie])
    expect(uitkomst.total.toFixed(2)).toBe('600.00')
    // Per positie: 45 + 120 + 35 = 200.
    expect(uitkomst.positions[0].total.toFixed(2)).toBe('200.00')
  })

  it('telt de setup per positie en niet per kleur', () => {
    const een = calculatePrintPositionCost(positie)
    expect(een.setupCost.toFixed(2)).toBe('45.00')
  })
})

describe('staffels, herhaalorders en de witte onderlaag', () => {
  const basis: PrintCostInput = {
    technique: { id: 'B', pricingType: 'NumberOfColours', setup: '29,25', setupRepeat: '20,00' },
    varCosts: enkelBereik([
      { minimumQuantity: 1, price: '1,56' },
      { minimumQuantity: 50, price: '0,94' },
      { minimumQuantity: 100, price: '0,81' },
    ]),
    quantity: 60,
    colours: 1,
  }

  it('kiest bij 60 stuks de staffel van 50, zoals de handleiding uitlegt', () => {
    const uitkomst = calculatePrintPositionCost(basis)
    expect(uitkomst.scaleMinimumQuantity).toBe(50)
    expect(uitkomst.printCost.toFixed(2)).toBe('56.40') // 60 * 0,94
  })

  it('gebruikt setup_repeat alleen bij een herhaalorder', () => {
    expect(calculatePrintPositionCost(basis).setupCost.toFixed(2)).toBe('29.25')
    expect(calculatePrintPositionCost({ ...basis, isRepeat: true }).setupCost.toFixed(2)).toBe('20.00')
  })

  it('valt bij een herhaalorder zonder setup_repeat terug op de gewone setup', () => {
    const zonder = { ...basis, technique: { ...basis.technique, setupRepeat: '' }, isRepeat: true }
    expect(calculatePrintPositionCost(zonder).setupCost.toFixed(2)).toBe('29.25')
  })

  it('rekent bij techniek ST een witte onderlaag op een gekleurd artikel', () => {
    const st: PrintCostInput = {
      technique: { id: 'ST', pricingType: 'NumberOfColours', setup: '10,00' },
      varCosts: enkelBereik([{ minimumQuantity: 1, price: '0,50', nextPrice: '0,30' }]),
      quantity: 100,
      colours: 1,
    }
    expect(calculatePrintPositionCost(st).printCost.toFixed(2)).toBe('50.00')
    // Eenmaal de vervolgprijs maal het aantal erbij: 50 + 100 * 0,30.
    expect(calculatePrintPositionCost({ ...st, itemIsColoured: true }).printCost.toFixed(2)).toBe('80.00')
  })
})

describe('weigeren in plaats van gokken', () => {
  const technique = { id: 'E', pricingType: 'AreaRange' as const, setup: '10,00' }
  const varCosts: PrintVarCost[] = [
    { rangeId: 'A', areaFrom: 0, areaTo: 8, scales: [{ minimumQuantity: 100, price: '1,00' }] },
  ]

  it('weigert een oppervlakte-techniek zonder formaat', () => {
    expect(() => calculatePrintPositionCost({ technique, varCosts, quantity: 100, colours: 1 }))
      .toThrow(/formaat van het logo/)
  })

  it('weigert een formaat waarvoor geen bereik bestaat', () => {
    expect(() =>
      calculatePrintPositionCost({ technique, varCosts, quantity: 100, colours: 1, areaCm2: 99 }),
    ).toThrow(/geen prijsbereik/)
  })

  it('weigert een aantal onder de laagste staffel', () => {
    expect(() =>
      calculatePrintPositionCost({ technique, varCosts, quantity: 50, colours: 1, areaCm2: 5 }),
    ).toThrow(/geen drukstaffel voor 50 stuks/)
  })

  it('weigert een onzinnig aantal of aantal kleuren', () => {
    const goed = { technique, varCosts, areaCm2: 5 }
    expect(() => calculatePrintPositionCost({ ...goed, quantity: 0, colours: 1 })).toThrow(PrintPriceError)
    expect(() => calculatePrintPositionCost({ ...goed, quantity: 2.5, colours: 1 })).toThrow(PrintPriceError)
    expect(() => calculatePrintPositionCost({ ...goed, quantity: 100, colours: 0 })).toThrow(PrintPriceError)
  })

  it('weigert een drukprijs zonder enige positie', () => {
    expect(() => calculatePrintCost([])).toThrow(/zonder drukpositie/)
  })
})

describe('wat de echte prijslijst anders doet dan de handleiding', () => {
  // Gemeten op 29-10-2026 tegen api.midocean.com. Drie afwijkingen, elk met
  // gevolgen voor de prijs.

  it('herkent "true" als indicator voor een eigen vervolgkleurprijs', () => {
    // De handleiding noemt "X". De echte lijst gebruikt "true"/"false". Met
    // alleen de X-controle zou de goedkopere vervolgkleur nooit gelden en
    // werd elke kleur voor de volle prijs gerekend.
    const invoer: PrintCostInput = {
      technique: { id: 'P0', pricingType: 'NumberOfColours', setup: '27,50', nextColourCostIndicator: 'true' },
      varCosts: enkelBereik([{ minimumQuantity: 1, price: '0,40', nextPrice: '0,10' }]),
      quantity: 100,
      colours: 3,
    }
    // 100 * 0,40 + 100 * 0,10 * 2 = 40 + 20.
    expect(calculatePrintPositionCost(invoer).printCost.toFixed(2)).toBe('60.00')

    const uit = calculatePrintPositionCost({
      ...invoer,
      technique: { ...invoer.technique, nextColourCostIndicator: 'false' },
    })
    expect(uit.printCost.toFixed(2)).toBe('120.00')
  })

  it('kent het prijstype Area, dat niet in de handleiding staat', () => {
    // Techniek DPT, digitale textieldruk: prijs per cm2, geen setup.
    const invoer: PrintCostInput = {
      technique: { id: 'DPT', pricingType: 'Area', setup: '', setupRepeat: '' },
      varCosts: enkelBereik([{ minimumQuantity: 1, price: '0,011' }]),
      quantity: 100,
      colours: 1,
      areaCm2: 150,
    }
    const uitkomst = calculatePrintPositionCost(invoer)
    // 100 * 0,011 * 150 cm2.
    expect(uitkomst.printCost.toFixed(2)).toBe('165.00')
    // Een lege setup is nul, geen fout.
    expect(uitkomst.setupCost.toFixed(2)).toBe('0.00')
  })

  it('weigert een prijs per cm2 zonder formaat', () => {
    expect(() =>
      calculatePrintPositionCost({
        technique: { id: 'DPT', pricingType: 'Area', setup: '' },
        varCosts: enkelBereik([{ minimumQuantity: 1, price: '0,011' }]),
        quantity: 100,
        colours: 1,
      }),
    ).toThrow(/per vierkante centimeter/)
  })
})
