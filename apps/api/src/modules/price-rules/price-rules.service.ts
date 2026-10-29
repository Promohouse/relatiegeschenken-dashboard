import { Injectable } from '@nestjs/common'
import {
  toSaleMarginPercent,
  type CreatePriceRule, type PriceRuleMarginBasis, type PriceRuleView, type UpdatePriceRule,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { NotFoundError, PreconditionError } from '../../core/errors/domain-errors'

/** Het veld waarin het doel van een regel staat, per bereik. */
const DOELVELD = {
  GLOBAL: null,
  SUPPLIER: 'supplierId',
  CATEGORY: 'categoryId',
  PRODUCT: 'productId',
  CUSTOMER: 'customerId',
  CHANNEL: 'channelId',
} as const

type Rij = {
  id: string
  scope: keyof typeof DOELVELD
  supplierId: string | null
  categoryId: string | null
  productId: string | null
  customerId: string | null
  channelId: string | null
  minQuantity: number
  marginBasis: PriceRuleMarginBasis
  marginPercent: { toString(): string } | null
  markupAmount: { toString(): string } | null
  printMarginPercent: { toString(): string } | null
  priority: number
  note: string | null
  validFrom: Date | null
  validTo: Date | null
  isActive: boolean
  supplier: { name: string } | null
  category: { name: string } | null
  product: { name: string; articleNumber: string } | null
  customer: { name: string } | null
  channel: { name: string } | null
}

const MET_DOEL = {
  supplier: { select: { name: true } },
  category: { select: { name: true } },
  product: { select: { name: true, articleNumber: true } },
  customer: { select: { name: true } },
  channel: { select: { name: true } },
} as const

/**
 * Beheer van margeregels: wat er op de inkoopprijs komt, voor iedereen of
 * voor één klant.
 *
 * Het rekenwerk en de voorrang staan in `@rgh/contracts` en worden door de
 * `PricingService` toegepast; deze service gaat alleen over het vastleggen.
 * Zo kan het orderscherm, de webshop en een feed straks nooit een andere
 * voorrang hanteren dan dit scherm laat zien (harde regel 11).
 */
@Injectable()
export class PriceRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(filter?: { customerId?: string }): Promise<PriceRuleView[]> {
    const rijen = await this.prisma.db.priceRule.findMany({
      where: filter?.customerId ? { scope: 'CUSTOMER', customerId: filter.customerId } : {},
      orderBy: [{ scope: 'asc' }, { priority: 'asc' }, { minQuantity: 'desc' }],
      include: MET_DOEL,
    })
    return rijen.map((r) => this.naarWeergave(r as Rij))
  }

  async byId(id: string): Promise<PriceRuleView> {
    const rij = await this.prisma.db.priceRule.findUnique({ where: { id }, include: MET_DOEL })
    if (!rij) throw new NotFoundError('Deze margeregel bestaat niet.')
    return this.naarWeergave(rij as Rij)
  }

  async create(input: CreatePriceRule): Promise<PriceRuleView> {
    await this.controleerDoel(input)

    const rij = await this.prisma.db.priceRule.create({
      data: {
        scope: input.scope,
        supplierId: input.supplierId ?? null,
        categoryId: input.categoryId ?? null,
        productId: input.productId ?? null,
        customerId: input.customerId ?? null,
        channelId: input.channelId ?? null,
        minQuantity: input.minQuantity,
        marginBasis: input.marginBasis,
        marginPercent: input.marginPercent,
        printMarginPercent: input.printMarginPercent ?? null,
        priority: input.priority,
        note: input.note ?? null,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        isActive: input.isActive,
      },
    })

    await this.audit.record({ entity: 'PriceRule', entityId: rij.id, action: 'CREATE' })
    return this.byId(rij.id)
  }

  async update(id: string, input: UpdatePriceRule): Promise<PriceRuleView> {
    const huidig = await this.byId(id)

    await this.prisma.db.priceRule.update({
      where: { id },
      data: {
        minQuantity: input.minQuantity,
        marginBasis: input.marginBasis,
        marginPercent: input.marginPercent,
        printMarginPercent: input.printMarginPercent,
        priority: input.priority,
        note: input.note,
        validFrom: input.validFrom,
        validTo: input.validTo,
        isActive: input.isActive,
      },
    })

    const nieuw = await this.byId(id)
    await this.audit.record({
      entity: 'PriceRule',
      entityId: id,
      action: 'UPDATE',
      diff: this.verschil(huidig, nieuw),
    })
    return nieuw
  }

  /**
   * Een regel gaat op inactief en wordt niet verwijderd: prijzen moeten
   * navraagbaar blijven, en de auditlog verwijst naar deze regel (harde
   * regel 9).
   */
  async deactivate(id: string): Promise<PriceRuleView> {
    const regel = await this.byId(id)
    if (!regel.isActive) return regel
    return this.update(id, { isActive: false })
  }

  /**
   * Bestaat datgene waar de regel over gaat? De database weigert een
   * onbestaande sleutel ook, maar met een vreemdesleutelfout die in het
   * scherm nergens op slaat.
   */
  private async controleerDoel(input: CreatePriceRule): Promise<void> {
    const controles: Record<string, () => Promise<unknown>> = {
      supplierId: () => this.prisma.db.supplier.findUnique({ where: { id: input.supplierId! } }),
      categoryId: () =>
        this.prisma.db.productCategory.findUnique({ where: { id: input.categoryId! } }),
      productId: () => this.prisma.db.product.findUnique({ where: { id: input.productId! } }),
      customerId: () => this.prisma.db.customer.findUnique({ where: { id: input.customerId! } }),
      channelId: () => this.prisma.db.shopChannel.findUnique({ where: { id: input.channelId! } }),
    }

    const veld = DOELVELD[input.scope]
    if (!veld) return

    const gevonden = await controles[veld]()
    if (!gevonden) {
      throw new PreconditionError('Datgene waar deze regel over gaat bestaat niet (meer).')
    }
  }

  private naarWeergave(r: Rij): PriceRuleView {
    const nu = new Date()
    const binnenVenster =
      (!r.validFrom || r.validFrom.getTime() <= nu.getTime()) &&
      (!r.validTo || r.validTo.getTime() >= nu.getTime())

    const doel = {
      GLOBAL: { id: null, naam: null },
      SUPPLIER: { id: r.supplierId, naam: r.supplier?.name ?? null },
      CATEGORY: { id: r.categoryId, naam: r.category?.name ?? null },
      PRODUCT: {
        id: r.productId,
        naam: r.product ? `${r.product.articleNumber} — ${r.product.name}` : null,
      },
      CUSTOMER: { id: r.customerId, naam: r.customer?.name ?? null },
      CHANNEL: { id: r.channelId, naam: r.channel?.name ?? null },
    }[r.scope]

    return {
      id: r.id,
      scope: r.scope,
      targetId: doel.id,
      targetName: doel.naam,
      minQuantity: r.minQuantity,
      marginBasis: r.marginBasis,
      marginPercent: r.marginPercent?.toString() ?? null,
      // Eén keer omgerekend, hier: zo kan geen scherm er een eigen antwoord
      // op geven en staat in de lijst wat een regel werkelijk oplevert.
      saleMarginPercent: r.marginPercent
        ? toSaleMarginPercent(r.marginPercent.toString(), r.marginBasis).toFixed(2)
        : null,
      printSaleMarginPercent: r.printMarginPercent
        ? toSaleMarginPercent(r.printMarginPercent.toString(), r.marginBasis).toFixed(2)
        : null,
      markupAmount: r.markupAmount?.toString() ?? null,
      printMarginPercent: r.printMarginPercent?.toString() ?? null,
      priority: r.priority,
      note: r.note,
      validFrom: r.validFrom?.toISOString() ?? null,
      validTo: r.validTo?.toISOString() ?? null,
      isActive: r.isActive,
      appliesToday: r.isActive && binnenVenster,
    }
  }

  private verschil(
    voor: PriceRuleView,
    na: PriceRuleView,
  ): Record<string, { van: unknown; naar: unknown }> {
    const diff: Record<string, { van: unknown; naar: unknown }> = {}
    for (const sleutel of Object.keys(na) as (keyof PriceRuleView)[]) {
      if (voor[sleutel] !== na[sleutel]) diff[sleutel] = { van: voor[sleutel], naar: na[sleutel] }
    }
    return diff
  }
}
