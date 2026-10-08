import { describe, it, expect } from 'vitest'
import {
  canonicalJson, computePayloadHash, hasChanged,
  generateApiKey, hashApiKey, apiKeyMatches, API_KEY_PREFIX,
} from '../src/hashing'

describe('canonieke JSON', () => {
  it('geeft dezelfde weergave ongeacht de sleutelvolgorde', () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }))
  })

  it('laat de volgorde binnen een lijst wel meetellen', () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]))
  })

  it('werkt op geneste structuren', () => {
    const a = { product: { name: 'Beker', colors: ['zwart', 'wit'], price: 4.85 } }
    const b = { product: { price: 4.85, colors: ['zwart', 'wit'], name: 'Beker' } }
    expect(canonicalJson(a)).toBe(canonicalJson(b))
  })
})

describe('importhash', () => {
  it('geeft dezelfde hash voor dezelfde inhoud in andere veldvolgorde', () => {
    // Een leverancier die zijn velden omgooit mag geen volledige herverwerking
    // van de catalogus veroorzaken.
    const een = computePayloadHash({ sku: 'S1001', price: '4.85', name: 'Beker' })
    const twee = computePayloadHash({ name: 'Beker', sku: 'S1001', price: '4.85' })
    expect(een).toBe(twee)
  })

  it('verandert bij een gewijzigde waarde', () => {
    const voor = computePayloadHash({ sku: 'S1001', price: '4.85' })
    const na = computePayloadHash({ sku: 'S1001', price: '4.95' })
    expect(na).not.toBe(voor)
    expect(hasChanged(voor, na)).toBe(true)
    expect(hasChanged(na, na)).toBe(false)
  })

  it('beschouwt een onbekende vorige hash als gewijzigd', () => {
    expect(hasChanged(null, 'abc')).toBe(true)
    expect(hasChanged(undefined, 'abc')).toBe(true)
  })
})

describe('API-sleutels', () => {
  it('genereert een sleutel met voorvoegsel en bewaart alleen de hash', () => {
    const { key, keyHash } = generateApiKey()
    expect(key.startsWith(API_KEY_PREFIX)).toBe(true)
    expect(keyHash).not.toContain(key)
    expect(keyHash).toHaveLength(64)
  })

  it('genereert elke keer een andere sleutel', () => {
    const keys = new Set(Array.from({ length: 20 }, () => generateApiKey().key))
    expect(keys.size).toBe(20)
  })

  it('verifieert de juiste sleutel en wijst een verkeerde af', () => {
    const { key, keyHash } = generateApiKey()
    expect(apiKeyMatches(key, keyHash)).toBe(true)
    expect(apiKeyMatches(key + 'x', keyHash)).toBe(false)
    expect(apiKeyMatches(generateApiKey().key, keyHash)).toBe(false)
  })

  it('wijst een onzinnige hash af zonder te crashen', () => {
    expect(apiKeyMatches('rgh_test', 'kort')).toBe(false)
    expect(hashApiKey('rgh_test')).toHaveLength(64)
  })
})
