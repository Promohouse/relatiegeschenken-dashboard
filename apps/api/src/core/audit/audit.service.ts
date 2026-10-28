import { Injectable, Logger } from '@nestjs/common'
import type { AuditAction, Prisma } from '@rgh/db'
import { PrismaService } from '../prisma/prisma.service'
import { RequestContext } from '../context/request-context'

export interface AuditInput {
  entity: string
  entityId: string
  action: AuditAction
  /** Alleen de gewijzigde velden, als { veld: { van, naar } }. */
  diff?: Record<string, { van: unknown; naar: unknown }> | null
  /** Overschrijft de gebruiker uit de verzoekcontext; voor achtergrondtaken. */
  userId?: string | null
}

/**
 * Auditlog op iedere betekenisvolle handeling (regel 7 uit CLAUDE.md).
 *
 * Services roepen dit aan op het punt waar de wijziging gebeurt. Een
 * interceptor op HTTP-niveau kan dat niet vervangen: die weet niet welke
 * entiteit veranderde of welke velden.
 *
 * Een mislukt auditlog laat de handeling zelf niet mislukken, maar wordt wel
 * als fout gelogd. Een order die niet wordt opgeslagen omdat het logboek
 * hapert is erger dan een ontbrekende logregel.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput): Promise<void> {
    const context = RequestContext.get()
    try {
      await this.prisma.db.auditLog.create({
        data: {
          entity: input.entity,
          entityId: input.entityId,
          action: input.action,
          userId: input.userId ?? context?.userId ?? null,
          diff: (input.diff ?? undefined) as Prisma.InputJsonValue | undefined,
          ipAddress: context?.ipAddress ?? null,
          userAgent: context?.userAgent ?? null,
        },
      })
    } catch (error) {
      this.logger.error(
        `Auditregel voor ${input.entity} ${input.entityId} (${input.action}) kon niet worden ` +
          `weggeschreven: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  /**
   * Verschil tussen twee toestanden, alleen de velden die echt wijzigden.
   * Geeft null als er niets veranderde, zodat er geen lege regels ontstaan.
   */
  diff<T extends Record<string, unknown>>(
    voor: T | null | undefined,
    na: T,
    velden?: (keyof T)[],
  ): Record<string, { van: unknown; naar: unknown }> | null {
    const sleutels = (velden ?? (Object.keys(na) as (keyof T)[])).map(String)
    const verschil: Record<string, { van: unknown; naar: unknown }> = {}

    for (const sleutel of sleutels) {
      const oud = voor ? normaliseer((voor as Record<string, unknown>)[sleutel]) : undefined
      const nieuw = normaliseer((na as Record<string, unknown>)[sleutel])
      if (oud !== nieuw) verschil[sleutel] = { van: oud ?? null, naar: nieuw ?? null }
    }

    return Object.keys(verschil).length > 0 ? verschil : null
  }
}

/** Datums en Decimals vergelijkbaar maken zonder ze te verliezen. */
function normaliseer(waarde: unknown): unknown {
  if (waarde === null || waarde === undefined) return waarde
  if (waarde instanceof Date) return waarde.toISOString()
  if (typeof waarde === 'object' && 'toString' in waarde && waarde.constructor?.name === 'Decimal') {
    return String(waarde)
  }
  return waarde
}
