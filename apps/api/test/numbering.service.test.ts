import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { TestingModule } from '@nestjs/testing'
import { createCoreModule } from './helpers'
import { NumberingService } from '../src/core/numbering/numbering.service'
import { PrismaService } from '../src/core/prisma/prisma.service'

describe('nummeruitgifte', () => {
  let moduleRef: TestingModule
  let numbering: NumberingService
  let prisma: PrismaService
  const KEY = `TEST_NUM_${Date.now()}`
  const JAAR = 2026

  beforeAll(async () => {
    moduleRef = await createCoreModule()
    numbering = moduleRef.get(NumberingService)
    prisma = moduleRef.get(PrismaService)
    await prisma.db.numberSequence.create({
      data: { key: KEY, year: JAAR, format: 'TST-{year}-{counter:4}', lastValue: 0 },
    })
  }, 30000)

  afterAll(async () => {
    await prisma.db.numberSequence.deleteMany({ where: { key: KEY } })
    await moduleRef.close()
  })

  it('geeft opeenvolgende nummers uit', async () => {
    expect(await numbering.issue(KEY, JAAR)).toBe('TST-2026-0001')
    expect(await numbering.issue(KEY, JAAR)).toBe('TST-2026-0002')
  })

  it('toont het volgende nummer zonder het te verbruiken', async () => {
    expect(await numbering.preview(KEY, JAAR)).toBe('TST-2026-0003')
    expect(await numbering.preview(KEY, JAAR)).toBe('TST-2026-0003')
    expect(await numbering.issue(KEY, JAAR)).toBe('TST-2026-0003')
  })

  it('geeft bij twintig gelijktijdige aanvragen twintig unieke nummers', async () => {
    const nummers = await Promise.all(Array.from({ length: 20 }, () => numbering.issue(KEY, JAAR)))
    expect(new Set(nummers).size).toBe(20)
  })

  it('laat de teller vooruit zetten, zodat een reeks uit Teamleader doorloopt', async () => {
    await numbering.configure(KEY, JAAR, { lastValue: 5000 })
    expect(await numbering.issue(KEY, JAAR)).toBe('TST-2026-5001')
  })

  it('laat het formaat wijzigen zonder de teller te raken', async () => {
    await numbering.configure(KEY, JAAR, { format: '{year}/{counter:6}' })
    expect(await numbering.issue(KEY, JAAR)).toBe('2026/005002')
  })

  it('weigert de teller te verlagen', async () => {
    // Anders zou een al uitgegeven nummer opnieuw uitgedeeld worden.
    await expect(numbering.configure(KEY, JAAR, { lastValue: 1 })).rejects.toThrow(/kan niet omlaag/i)
  })

  it('geeft een leesbare fout bij een onbekende reeks', async () => {
    await expect(numbering.issue('BESTAAT_NIET', JAAR)).rejects.toThrow(/bestaat niet.*Instellingen/s)
    await expect(numbering.preview('BESTAAT_NIET', JAAR)).rejects.toThrow(/bestaat niet/)
    await expect(numbering.configure('BESTAAT_NIET', JAAR, { lastValue: 5 })).rejects.toThrow(/bestaat niet/)
  })
})
