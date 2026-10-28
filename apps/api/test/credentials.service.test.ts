import { describe, expect, it } from 'vitest'
import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

const { CredentialsService } = await import('../src/core/connectors/credentials.service')
const { AppConfig } = await import('../src/core/config/config.service')

const dienst = () => new CredentialsService(new AppConfig())

describe('credentials van koppelingen', () => {
  it('versleutelt en ontsleutelt een sleutel', () => {
    const d = dienst()
    const bytes = d.encrypt({ apiKey: 'geheime-sleutel-123' })
    expect(d.decrypt(bytes)).toEqual({ apiKey: 'geheime-sleutel-123' })
  })

  it('levert elke keer andere bytes op, ook voor dezelfde waarde', () => {
    // Eigen salt en iv per record: anders is aan de database te zien dat twee
    // koppelingen dezelfde sleutel gebruiken.
    const d = dienst()
    const een = d.encrypt({ apiKey: 'zelfde' })
    const twee = d.encrypt({ apiKey: 'zelfde' })
    expect(Buffer.compare(een, twee)).not.toBe(0)
    expect(d.decrypt(een)).toEqual(d.decrypt(twee))
  })

  it('bevat de sleutel niet leesbaar in de opgeslagen bytes', () => {
    const d = dienst()
    const bytes = d.encrypt({ apiKey: 'xyzzy-niet-zomaar-te-vinden' })
    expect(bytes.toString('utf8')).not.toContain('xyzzy')
    expect(bytes.toString('latin1')).not.toContain('xyzzy')
  })

  it('weigert bytes die onderweg gewijzigd zijn', () => {
    // AES-GCM draagt zijn eigen echtheidscontrole: een aangepaste rij in de
    // database ontsleutelt niet, hij faalt.
    const d = dienst()
    const bytes = d.encrypt({ apiKey: 'geheim' })
    bytes[bytes.length - 1] ^= 0xff
    expect(() => d.decrypt(bytes)).toThrow(/kunnen niet ontsleuteld worden/)
  })

  it('weigert ontsleutelen met een andere hoofdsleutel', () => {
    const bytes = dienst().encrypt({ apiKey: 'geheim' })

    const oud = process.env.CONNECTOR_SECRET_KEY
    process.env.CONNECTOR_SECRET_KEY = 'een-heel-andere-sleutel-van-ruim-32-tekens'
    try {
      expect(() => new CredentialsService(new AppConfig()).decrypt(bytes))
        .toThrow(/CONNECTOR_SECRET_KEY/)
    } finally {
      process.env.CONNECTOR_SECRET_KEY = oud
    }
  })

  it('zegt het als er helemaal geen credentials zijn', () => {
    expect(() => dienst().decrypt(null)).toThrow(/geen credentials opgeslagen/)
    expect(() => dienst().decrypt(new Uint8Array())).toThrow(/geen credentials opgeslagen/)
  })

  it('noemt het ontbrekende veld bij name', () => {
    const d = dienst()
    const bytes = d.encrypt({ gebruiker: 'iemand' })
    expect(() => d.require(bytes, 'apiKey')).toThrow(/"apiKey"/)
    expect(d.require(d.encrypt({ apiKey: 'ok' }), 'apiKey')).toBe('ok')
  })
})
