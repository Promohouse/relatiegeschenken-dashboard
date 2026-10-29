import { Injectable } from '@nestjs/common'
import {
  exampleValues, renderTemplate, unknownPlaceholders, TEMPLATE_VARIABLES,
  type TemplateKind, type TemplateView, type UpdateTemplate,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { NotFoundError, ValidationFailedError } from '../../core/errors/domain-errors'

/**
 * Tekstsjablonen beheren.
 *
 * De controle op onbekende velden gebeurt bij het opslaan en niet bij het
 * tonen. Dat is met opzet: wie de tekst schrijft kan de fout herstellen, de
 * klant die het document krijgt niet.
 */
@Injectable()
export class TemplatesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<TemplateView[]> {
    const rijen = await this.prisma.db.documentTemplate.findMany({ orderBy: { name: 'asc' } })
    return rijen.map((r) => this.naarWeergave(r))
  }

  async byKey(key: string): Promise<TemplateView> {
    const sjabloon = await this.prisma.db.documentTemplate.findUnique({ where: { key } })
    if (!sjabloon) throw new NotFoundError('Dit sjabloon bestaat niet.')
    return this.naarWeergave(sjabloon)
  }

  async update(key: string, input: UpdateTemplate): Promise<TemplateView> {
    const voor = await this.prisma.db.documentTemplate.findUnique({ where: { key } })
    if (!voor) throw new NotFoundError('Dit sjabloon bestaat niet.')

    this.controleerVelden(input, voor.kind)

    const na = await this.prisma.db.documentTemplate.update({
      where: { key },
      data: {
        name: input.name,
        description: input.description,
        subject: input.subject,
        body: input.body,
        isActive: input.isActive,
      },
    })

    const diff: Record<string, { van: unknown; naar: unknown }> = {}
    for (const veld of ['name', 'description', 'subject', 'body', 'isActive'] as const) {
      if (voor[veld] !== na[veld]) diff[veld] = { van: voor[veld], naar: na[veld] }
    }
    if (Object.keys(diff).length > 0) {
      await this.audit.record({ entity: 'DocumentTemplate', entityId: voor.id, action: 'UPDATE', diff })
    }

    return this.naarWeergave(na)
  }

  /**
   * Een onbekend veld is een fout bij het veld, niet een melding achteraf.
   *
   * De melding noemt het veld bij naam, want "er klopt iets niet" helpt
   * niemand bij een tekst van twintig regels.
   */
  private controleerVelden(input: UpdateTemplate, kind: TemplateKind) {
    const fouten: { veld: string; melding: string }[] = []

    for (const [veld, tekst] of [['body', input.body], ['subject', input.subject]] as const) {
      if (!tekst) continue
      const onbekend = unknownPlaceholders(tekst, kind)
      if (onbekend.length > 0) {
        fouten.push({
          veld,
          melding:
            `Onbekend veld: ${onbekend.map((n) => `{{${n}}}`).join(', ')}. ` +
            'Gebruik een veld uit de lijst ernaast.',
        })
      }
    }

    if (fouten.length > 0) {
      throw new ValidationFailedError(
        'De tekst bevat een veld dat niet bestaat.',
        fouten.map((f) => ({ veld: f.veld, melding: f.melding })),
      )
    }
  }

  private naarWeergave(sjabloon: {
    id: string
    key: string
    kind: TemplateKind
    name: string
    description: string | null
    subject: string | null
    body: string
    isSystem: boolean
    isActive: boolean
    updatedAt: Date
  }): TemplateView {
    const voorbeeld = exampleValues(sjabloon.kind)
    return {
      id: sjabloon.id,
      key: sjabloon.key,
      kind: sjabloon.kind,
      name: sjabloon.name,
      description: sjabloon.description,
      subject: sjabloon.subject,
      body: sjabloon.body,
      isSystem: sjabloon.isSystem,
      isActive: sjabloon.isActive,
      updatedAt: sjabloon.updatedAt.toISOString(),
      variables: TEMPLATE_VARIABLES[sjabloon.kind],
      preview: {
        subject: sjabloon.subject ? renderTemplate(sjabloon.subject, voorbeeld) : null,
        body: renderTemplate(sjabloon.body, voorbeeld),
      },
    }
  }
}
