import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  parseSupplierDecimal, parseOptionalSupplierDecimal, parseSupplierInteger,
  parseSupplierBoolean, SupplierValueError,
} from '../src/supplier-values'

describe('bedragen uit leveranciersdata', () => {
  it('leest een decimale komma, zoals midocean die levert', () => {
    expect(parseSupplierDecimal('4,22').toFixed(2)).toBe('4.22')
    expect(parseSupplierDecimal('0,08').toFixed(2)).toBe('0.08')
    expect(parseSupplierDecimal('60,00').toFixed(2)).toBe('60.00')
  })

  it('leest ook een punt, want niet elke leverancier doet het gelijk', () => {
    expect(parseSupplierDecimal('4.22').toFixed(2)).toBe('4.22')
    expect(parseSupplierDecimal(4.22).toFixed(2)).toBe('4.22')
    expect(parseSupplierDecimal(new Decimal('4.22')).toFixed(2)).toBe('4.22')
  })

  it('doet niet wat parseFloat zou doen', () => {
    // Dit is de hele reden dat deze functie bestaat: parseFloat('4,22') is 4.
    expect(parseFloat('4,22')).toBe(4)
    expect(parseSupplierDecimal('4,22').toNumber()).toBe(4.22)
  })

  it('weigert een duizendtalnotatie in plaats van te gokken', () => {
    // "1.234,56" en "1,234.56" betekenen per land iets anders. Daar hoort een
    // afspraak bij, geen aanname.
    expect(() => parseSupplierDecimal('1.234,56', 'price')).toThrow(SupplierValueError)
    expect(() => parseSupplierDecimal('1,234.56', 'price')).toThrow(SupplierValueError)
  })

  it('weigert leeg, onzin en oneindig', () => {
    for (const waarde of ['', '   ', 'gratis', 'n.v.t.', '4,2,2', null, undefined, {}, NaN, Infinity]) {
      expect(() => parseSupplierDecimal(waarde, 'price')).toThrow(SupplierValueError)
    }
  })

  it('noemt het veld in de melding, zodat een importfout vindbaar is', () => {
    expect(() => parseSupplierDecimal('gratis', 'setup')).toThrow(/"setup"/)
  })

  it('laat een negatief bedrag door; dat kan een correctie zijn', () => {
    expect(parseSupplierDecimal('-1,50').toFixed(2)).toBe('-1.50')
  })
})

describe('optionele bedragen', () => {
  it('maakt van leeg een null, niet van onzin', () => {
    expect(parseOptionalSupplierDecimal('')).toBeNull()
    expect(parseOptionalSupplierDecimal(null)).toBeNull()
    expect(parseOptionalSupplierDecimal(undefined)).toBeNull()
    expect(() => parseOptionalSupplierDecimal('gratis')).toThrow(SupplierValueError)
  })

  it('leest een waarde die er wel is', () => {
    expect(parseOptionalSupplierDecimal('0,23')?.toFixed(2)).toBe('0.23')
  })
})

describe('aantallen en vlaggen', () => {
  it('leest een staffeldrempel als geheel getal', () => {
    expect(parseSupplierInteger('1000')).toBe(1000)
    expect(parseSupplierInteger(811)).toBe(811)
  })

  it('weigert een gebroken aantal in plaats van af te ronden', () => {
    expect(() => parseSupplierInteger('2,5', 'minimum_quantity')).toThrow(SupplierValueError)
  })

  it('leest de ja/nee-velden die midocean door elkaar gebruikt', () => {
    expect(parseSupplierBoolean('yes')).toBe(true)
    expect(parseSupplierBoolean('no')).toBe(false)
    expect(parseSupplierBoolean('false')).toBe(false)
    expect(parseSupplierBoolean(true)).toBe(true)
    expect(() => parseSupplierBoolean('misschien', 'printable')).toThrow(SupplierValueError)
  })
})
