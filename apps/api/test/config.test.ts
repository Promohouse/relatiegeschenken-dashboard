import { describe, it, expect } from 'vitest'
import { parseEnv, databaseName } from '../src/core/config/config.schema'

const geldig = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/relatiegeschenken_dev?schema=public',
  DB_NAME_PREFIX: 'relatiegeschenken_',
  API_BASE_URL: 'http://localhost:3101',
  WEB_BASE_URL: 'http://localhost:3100',
  AUTH_SECRET: 'x'.repeat(32),
  CONNECTOR_SECRET_KEY: 'y'.repeat(32),
}

describe('omgevingsvalidatie', () => {
  it('accepteert een geldige omgeving en vult standaardwaarden in', () => {
    const env = parseEnv(geldig as never)
    expect(env.API_PORT).toBe(3101)
    expect(env.VALKEY_DB).toBe(3)
    expect(env.QUEUE_PREFIX).toBe('rgh')
    expect(env.STORAGE_DRIVER).toBe('local')
    expect(env.NODE_ENV).toBe('development')
  })

  it('leest booleans uit tekst', () => {
    expect(parseEnv({ ...geldig, DEMO_MODE: 'true' } as never).DEMO_MODE).toBe(true)
    expect(parseEnv({ ...geldig, DEMO_MODE: '1' } as never).DEMO_MODE).toBe(true)
    expect(parseEnv({ ...geldig, DEMO_MODE: 'false' } as never).DEMO_MODE).toBe(false)
    // Niet opgegeven: JOBS_ENABLED staat standaard aan, DEMO_MODE standaard uit.
    expect(parseEnv(geldig as never).JOBS_ENABLED).toBe(true)
    expect(parseEnv(geldig as never).DEMO_MODE).toBe(false)
  })

  it('weigert een te kort geheim en noemt de sleutel', () => {
    expect(() => parseEnv({ ...geldig, AUTH_SECRET: 'kort' } as never)).toThrow(/AUTH_SECRET/)
  })

  it('weigert een ontbrekende databaseverbinding', () => {
    const { DATABASE_URL: _weg, ...zonder } = geldig
    expect(() => parseEnv(zonder as never)).toThrow(/DATABASE_URL/)
  })

  it('weigert een URL zonder protocol', () => {
    expect(() => parseEnv({ ...geldig, API_BASE_URL: 'localhost:3101' } as never)).toThrow(/API_BASE_URL/)
  })

  it('weigert een database die buiten het voorvoegsel valt', () => {
    // Het veiligheidsslot: deze machine deelt PostgreSQL met andere projecten.
    expect(() =>
      parseEnv({ ...geldig, DATABASE_URL: 'postgresql://u:p@localhost:5432/promohouse' } as never),
    ).toThrow(/promohouse.*relatiegeschenken_|veiligheidsslot/s)
  })

  it('bundelt meerdere fouten in één melding', () => {
    try {
      parseEnv({ DB_NAME_PREFIX: 'relatiegeschenken_' } as never)
      throw new Error('had moeten falen')
    } catch (e) {
      const melding = (e as Error).message
      expect(melding).toContain('DATABASE_URL')
      expect(melding).toContain('AUTH_SECRET')
      expect(melding).toContain('.env.example')
    }
  })

  it('haalt de databasenaam uit een verbindingsreeks', () => {
    expect(databaseName('postgresql://u:p@host:5432/mijn_db?schema=public')).toBe('mijn_db')
    expect(databaseName('geen-url')).toBeNull()
  })
})
