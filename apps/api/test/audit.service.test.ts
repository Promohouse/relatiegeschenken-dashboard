import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { TestingModule } from '@nestjs/testing'
import { createCoreModule, uniqueNumber } from './helpers'
import { AuditService } from '../src/core/audit/audit.service'
import { PrismaService } from '../src/core/prisma/prisma.service'
import { RequestContext } from '../src/core/context/request-context'

describe('auditlogging', () => {
  let moduleRef: TestingModule
  let audit: AuditService
  let prisma: PrismaService
  let userId: string
  const entityId = randomUUID()

  beforeAll(async () => {
    moduleRef = await createCoreModule()
    audit = moduleRef.get(AuditService)
    prisma = moduleRef.get(PrismaService)
    userId = (await prisma.db.user.create({
      data: { email: `audit-${Date.now()}@test.local`, name: 'Testgebruiker' },
    })).id
  }, 30000)

  afterAll(async () => {
    await prisma.db.auditLog.deleteMany({ where: { entityId } })
    await prisma.db.user.deleteMany({ where: { id: userId } })
    await moduleRef.close()
  })

  it('legt vast wie de handeling deed, vanaf welk adres', async () => {
    await RequestContext.run(
      { requestId: 'req-1', userId, ipAddress: '203.0.113.9', userAgent: 'vitest' },
      () => audit.record({ entity: 'Customer', entityId, action: 'CREATE' }),
    )

    const regel = await prisma.db.auditLog.findFirstOrThrow({ where: { entityId } })
    expect(regel.action).toBe('CREATE')
    expect(regel.userId).toBe(userId)
    expect(regel.ipAddress).toBe('203.0.113.9')
    expect(regel.userAgent).toBe('vitest')
  })

  it('werkt ook zonder verzoekcontext, bijvoorbeeld vanuit een achtergrondtaak', async () => {
    await audit.record({ entity: 'Customer', entityId, action: 'UPDATE', userId: null })
    const regels = await prisma.db.auditLog.findMany({ where: { entityId, action: 'UPDATE' } })
    expect(regels).toHaveLength(1)
    expect(regels[0].userId).toBeNull()
  })

  it('laat de handeling niet mislukken als het logboek hapert', async () => {
    // Een niet-bestaande gebruiker schendt de verwijzing; dat mag de
    // onderliggende handeling nooit tegenhouden.
    const onbekend = randomUUID()
    await expect(
      audit.record({ entity: 'Customer', entityId, action: 'DELETE', userId: onbekend }),
    ).resolves.toBeUndefined()
    expect(await prisma.db.auditLog.count({ where: { entityId, action: 'DELETE' } })).toBe(0)
  })

  it('bewaart alleen de velden die echt wijzigden', async () => {
    const verschil = audit.diff(
      { name: 'Oude naam', city: 'Zwolle', notes: null },
      { name: 'Nieuwe naam', city: 'Zwolle', notes: null },
    )
    expect(verschil).toEqual({ name: { van: 'Oude naam', naar: 'Nieuwe naam' } })
  })

  it('geeft null als er niets veranderde, zodat er geen lege regels ontstaan', () => {
    expect(audit.diff({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull()
  })

  it('beperkt het verschil tot de opgegeven velden', () => {
    const verschil = audit.diff({ a: 1, b: 2 }, { a: 9, b: 9 }, ['b'])
    expect(verschil).toEqual({ b: { van: 2, naar: 9 } })
  })

  it('vergelijkt datums op hun waarde en niet op objectidentiteit', () => {
    const zelfde = audit.diff({ d: new Date('2026-01-01') }, { d: new Date('2026-01-01') })
    expect(zelfde).toBeNull()
    const anders = audit.diff({ d: new Date('2026-01-01') }, { d: new Date('2026-02-01') })
    expect(anders?.d.naar).toContain('2026-02-01')
  })

  it('ziet een nieuw record als volledig gewijzigd', () => {
    const verschil = audit.diff(null, { number: uniqueNumber(), name: 'Nieuw' })
    expect(Object.keys(verschil ?? {})).toEqual(['number', 'name'])
    expect(verschil?.name.van).toBeNull()
  })
})
