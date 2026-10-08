import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { config } from 'dotenv'
import { resolve } from 'node:path'
import { createPrismaClient, issueNumber, renderNumberFormat, type Db } from '../src/index'

config({ path: resolve(__dirname, '../../../.env') })

describe('renderNumberFormat', () => {
  it('vult jaar en teller met voorloopnullen in', () => {
    expect(renderNumberFormat('ORD-{year}-{counter:5}', { year: 2026, counter: 42 })).toBe('ORD-2026-00042')
    expect(renderNumberFormat('OFF-{year}-{counter:5}', { year: 2026, counter: 1 })).toBe('OFF-2026-00001')
    expect(renderNumberFormat('{counter:5}', { year: 0, counter: 10001 })).toBe('10001')
  })

  it('werkt zonder cijferaanduiding', () => {
    expect(renderNumberFormat('K{counter}', { year: 0, counter: 7 })).toBe('K7')
  })

  it('laat een gewijzigd formaat meteen gelden', () => {
    expect(renderNumberFormat('2026/{counter:6}', { year: 2026, counter: 123 })).toBe('2026/000123')
  })
})

describe('issueNumber tegen de testdatabase', () => {
  let db: Db
  const KEY = 'TEST_SEQ'

  beforeAll(async () => {
    db = createPrismaClient(process.env.TEST_DATABASE_URL)
    await db.numberSequence.deleteMany({ where: { key: KEY } })
    await db.numberSequence.create({
      data: { key: KEY, year: 2026, format: 'TST-{year}-{counter:4}', lastValue: 0 },
    })
  })

  afterAll(async () => {
    await db.numberSequence.deleteMany({ where: { key: KEY } })
    await db.$disconnect()
  })

  it('geeft opeenvolgende nummers uit', async () => {
    const a = await db.$transaction((tx) => issueNumber(tx, KEY, 2026))
    const b = await db.$transaction((tx) => issueNumber(tx, KEY, 2026))
    expect(a).toBe('TST-2026-0001')
    expect(b).toBe('TST-2026-0002')
  })

  it('geeft bij tien gelijktijdige aanvragen tien unieke nummers', async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        db.$transaction((tx) => issueNumber(tx, KEY, 2026), { maxWait: 15000, timeout: 20000 }),
      ),
    )
    expect(new Set(results).size).toBe(10)
  })

  it('respecteert een handmatig gewijzigde startwaarde', async () => {
    await db.numberSequence.updateMany({ where: { key: KEY, year: 2026 }, data: { lastValue: 5000 } })
    const next = await db.$transaction((tx) => issueNumber(tx, KEY, 2026))
    expect(next).toBe('TST-2026-5001')
  })

  it('weigert een onbekende reeks in plaats van stil een nummer te verzinnen', async () => {
    await expect(db.$transaction((tx) => issueNumber(tx, 'BESTAAT_NIET', 2026))).rejects.toThrow(
      /bestaat niet/i,
    )
  })
})
