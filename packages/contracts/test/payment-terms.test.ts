import { describe, expect, it } from 'vitest'
import {
  calculateDueDate, calculatePrepayment, describePaymentTerm, isOverdue,
  createPaymentTermSchema, updatePaymentTermSchema, type PaymentTerm,
} from '../src/payment-terms'

const net30: PaymentTerm = { days: 30, endOfMonth: false }
const eom30: PaymentTerm = { days: 30, endOfMonth: true }

const utc = (iso: string) => new Date(iso)

describe('vervaldatum', () => {
  it('telt dagen op bij de factuurdatum', () => {
    expect(calculateDueDate(utc('2026-01-15T00:00:00Z'), net30).toISOString()).toBe(
      '2026-02-14T00:00:00.000Z',
    )
  })

  it('rekent bij einde maand vanaf de laatste dag van de factuurmaand', () => {
    // 15 januari, einde maand is 31 januari, plus 30 dagen is 2 maart.
    expect(calculateDueDate(utc('2026-01-15T00:00:00Z'), eom30).toISOString()).toBe(
      '2026-03-02T00:00:00.000Z',
    )
  })

  it('kent de lengte van februari, ook in een schrikkeljaar', () => {
    expect(calculateDueDate(utc('2024-02-03T00:00:00Z'), { days: 0, endOfMonth: true }).toISOString())
      .toBe('2024-02-29T00:00:00.000Z')
    expect(calculateDueDate(utc('2026-02-03T00:00:00Z'), { days: 0, endOfMonth: true }).toISOString())
      .toBe('2026-02-28T00:00:00.000Z')
  })

  it('verschuift niet door de overgang naar zomertijd', () => {
    // In Nederland gaat de klok in de nacht van 29 maart 2026 vooruit. Zou er
    // in lokale tijd gerekend worden, dan werd dit 27 april 23:00 en daarmee
    // een dag eerder op de kalender.
    expect(calculateDueDate(utc('2026-03-29T00:00:00Z'), net30).toISOString()).toBe(
      '2026-04-28T00:00:00.000Z',
    )
  })

  it('noemt een factuur op de vervaldag zelf nog niet te laat', () => {
    const vervalt = utc('2026-02-14T00:00:00Z')
    expect(isOverdue(vervalt, utc('2026-02-14T00:00:00Z'))).toBe(false)
    expect(isOverdue(vervalt, utc('2026-02-14T00:00:01Z'))).toBe(true)
  })
})

describe('vooruitbetaling', () => {
  it('is nul zonder percentage, niet null', () => {
    expect(calculatePrepayment('1000.00', net30).toString()).toBe('0')
  })

  it('rekent het percentage over het totaal, op twee decimalen', () => {
    const term: PaymentTerm = { days: 0, endOfMonth: false, prepaymentPercent: '50' }
    expect(calculatePrepayment('1234.57', term).toString()).toBe('617.29')
  })

  it('rondt af met half naar boven, zoals de rest van het geldwerk', () => {
    const term: PaymentTerm = { days: 0, endOfMonth: false, prepaymentPercent: '33.33' }
    expect(calculatePrepayment('100.00', term).toString()).toBe('33.33')
  })
})

describe('omschrijving op het document', () => {
  it('gebruikt de eigen tekst als die er is', () => {
    expect(describePaymentTerm({ ...net30, invoiceText: 'Binnen 30 dagen, graag onder vermelding van het ordernummer' }))
      .toBe('Binnen 30 dagen, graag onder vermelding van het ordernummer')
  })

  it('bouwt anders een tekst op, zodat een factuur nooit leeg blijft', () => {
    expect(describePaymentTerm(net30)).toBe('30 dagen netto')
    expect(describePaymentTerm(eom30)).toBe('30 dagen na einde maand')
    expect(describePaymentTerm({ days: 1, endOfMonth: false })).toBe('1 dag netto')
    expect(describePaymentTerm({ days: 14, endOfMonth: false, prepaymentPercent: '50' }))
      .toBe('50% vooruit, 14 dagen netto')
  })
})

describe('schema', () => {
  it('weigert een percentage boven honderd', () => {
    const uitkomst = createPaymentTermSchema.safeParse({
      key: 'test', name: 'Test', days: 30, prepaymentPercent: '120',
    })
    expect(uitkomst.success).toBe(false)
    expect(uitkomst.error?.issues[0]?.message).toBe('Meer dan 100% vooruit kan niet')
  })

  it('weigert een sleutel met hoofdletters of spaties', () => {
    for (const key of ['Net 30', 'NET30', '30-dagen ']) {
      expect(createPaymentTermSchema.safeParse({ key, name: 'Test', days: 30 }).success).toBe(false)
    }
  })

  it('maakt een leeg percentage null in plaats van nul', () => {
    const uitkomst = createPaymentTermSchema.parse({ key: 'net_30', name: '30 dagen', days: 30, prepaymentPercent: '' })
    expect(uitkomst.prepaymentPercent).toBeNull()
  })
})

describe('wijzigingsschema laat weggelaten velden weg', () => {
  // Deze test bestaat omdat `.partial()` een veld optioneel maakt maar
  // `.default()` laat staan. Een PATCH met alleen een naam zette daardoor
  // endOfMonth op false, sort op 100 en de standaardvlag uit - en dat laatste
  // haalde de standaard onder een voorwaarde vandaan.
  it('vult niets in wat niet is meegestuurd', () => {
    expect(updatePaymentTermSchema.parse({ name: 'Andere naam' })).toEqual({ name: 'Andere naam' })
    expect(updatePaymentTermSchema.parse({})).toEqual({})
  })

  it('controleert nog wel wat er wél in staat', () => {
    expect(updatePaymentTermSchema.safeParse({ days: -1 }).success).toBe(false)
    expect(updatePaymentTermSchema.safeParse({ prepaymentPercent: '120' }).success).toBe(false)
  })
})
