import { Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import {
  describePaymentTerm,
  type CreatePaymentTerm, type PaymentTermView, type UpdatePaymentTerm,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { ConflictError, NotFoundError, PreconditionError } from '../../core/errors/domain-errors'

type Rij = {
  id: string
  key: string
  name: string
  days: number
  endOfMonth: boolean
  prepaymentPercent: { toString(): string } | null
  invoiceText: string | null
  isDefault: boolean
  isActive: boolean
  sort: number
  _count: { customers: number }
}

/**
 * Betalingsvoorwaarden: een gedeelde lijst waaruit klanten kiezen.
 *
 * De berekening van vervaldatum en aanbetaling staat in `@rgh/contracts`, niet
 * hier: de factuurmodule, de herinneringsjob en de SnelStart-koppeling moeten
 * straks met dezelfde functie rekenen.
 */
@Injectable()
export class PaymentTermsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async list(): Promise<PaymentTermView[]> {
    const rijen = await this.prisma.db.paymentTerm.findMany({
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    })
    return rijen.map((r) => this.naarWeergave(r))
  }

  /** Alleen de actieve voorwaarden, voor een keuzelijst in een formulier. */
  async selectable(): Promise<PaymentTermView[]> {
    const rijen = await this.prisma.db.paymentTerm.findMany({
      where: { isActive: true },
      orderBy: [{ sort: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { customers: true } } },
    })
    return rijen.map((r) => this.naarWeergave(r))
  }

  /** De standaard, of null als er nog geen is ingesteld. */
  async defaultTerm(): Promise<PaymentTermView | null> {
    const rij = await this.prisma.db.paymentTerm.findFirst({
      where: { isDefault: true },
      include: { _count: { select: { customers: true } } },
    })
    return rij ? this.naarWeergave(rij) : null
  }

  /**
   * Voor andere modules: bestaat deze voorwaarde en is hij te kiezen? Geeft
   * een Nederlandse domeinfout in plaats van een vreemdesleutelfout uit de
   * database, die in het scherm onbegrijpelijk zou zijn.
   */
  async mustBeSelectable(id: string): Promise<PaymentTermView> {
    const term = await this.prisma.db.paymentTerm.findUnique({
      where: { id },
      include: { _count: { select: { customers: true } } },
    })
    if (!term) throw new NotFoundError('Deze betalingsvoorwaarde bestaat niet.')
    if (!term.isActive) {
      throw new PreconditionError(`De betalingsvoorwaarde "${term.name}" staat op inactief.`)
    }
    return this.naarWeergave(term)
  }

  async byId(id: string): Promise<PaymentTermView> {
    const rij = await this.prisma.db.paymentTerm.findUnique({
      where: { id },
      include: { _count: { select: { customers: true } } },
    })
    if (!rij) throw new NotFoundError('Deze betalingsvoorwaarde bestaat niet.')
    return this.naarWeergave(rij)
  }

  async create(input: CreatePaymentTerm): Promise<PaymentTermView> {
    if (await this.prisma.unscoped.paymentTerm.findUnique({ where: { key: input.key } })) {
      throw new ConflictError(`Er bestaat al een betalingsvoorwaarde met de sleutel ${input.key}.`)
    }

    const id = await this.prisma.db.$transaction(async (tx) => {
      if (input.isDefault) await this.maakStandaardVrij(tx, null)
      const rij = await tx.paymentTerm.create({
        data: {
          key: input.key,
          name: input.name,
          days: input.days,
          endOfMonth: input.endOfMonth,
          prepaymentPercent: input.prepaymentPercent ?? null,
          invoiceText: input.invoiceText ?? null,
          isDefault: input.isDefault,
          isActive: input.isActive,
          sort: input.sort,
        },
      })
      return rij.id
    })

    await this.audit.record({ entity: 'PaymentTerm', entityId: id, action: 'CREATE' })
    return this.byId(id)
  }

  async update(id: string, input: UpdatePaymentTerm): Promise<PaymentTermView> {
    const huidig = await this.byId(id)

    await this.prisma.db.$transaction(async (tx) => {
      // De standaard uitzetten zonder een andere aan te wijzen zou betekenen
      // dat een nieuwe klant geen voorwaarde krijgt.
      if (input.isDefault === false && huidig.isDefault) {
        throw new PreconditionError(
          'Zet eerst een andere betalingsvoorwaarde als standaard. Zonder standaard krijgt een ' +
            'nieuwe klant geen betalingsvoorwaarde.',
        )
      }

      // Een voorwaarde die klanten hebben kan niet op inactief: dan staat er
      // bij die klanten een voorwaarde die niet meer te kiezen is.
      if (input.isActive === false && huidig.customerCount > 0) {
        throw new PreconditionError(
          `Deze betalingsvoorwaarde is bij ${huidig.customerCount} ${
            huidig.customerCount === 1 ? 'klant' : 'klanten'
          } ingesteld. Wijzig die eerst.`,
        )
      }

      if (input.isDefault === true) await this.maakStandaardVrij(tx, id)

      await tx.paymentTerm.update({
        where: { id },
        data: {
          name: input.name,
          days: input.days,
          endOfMonth: input.endOfMonth,
          prepaymentPercent: input.prepaymentPercent,
          invoiceText: input.invoiceText,
          isDefault: input.isDefault,
          isActive: input.isActive,
          sort: input.sort,
        },
      })
    })

    const nieuw = await this.byId(id)
    await this.audit.record({
      entity: 'PaymentTerm',
      entityId: id,
      action: 'UPDATE',
      diff: this.verschil(huidig, nieuw),
    })
    return nieuw
  }

  async remove(id: string): Promise<void> {
    const term = await this.byId(id)

    if (term.customerCount > 0) {
      throw new ConflictError(
        `Deze betalingsvoorwaarde is bij ${term.customerCount} ${
          term.customerCount === 1 ? 'klant' : 'klanten'
        } ingesteld en kan niet verwijderd worden.`,
      )
    }
    if (term.isDefault) {
      throw new PreconditionError(
        'Dit is de standaard betalingsvoorwaarde. Wijs eerst een andere standaard aan.',
      )
    }

    await this.prisma.db.paymentTerm.delete({ where: { id } })
    await this.audit.record({ entity: 'PaymentTerm', entityId: id, action: 'DELETE' })
  }

  /**
   * Haalt de standaard bij de andere rijen weg. Moet vóór het zetten van de
   * nieuwe standaard gebeuren: de partiele unieke index staat hoogstens één
   * rij met `isDefault` toe, en die controleert per statement.
   */
  private async maakStandaardVrij(
    tx: Prisma.TransactionClient,
    behalve: string | null,
  ): Promise<void> {
    await tx.paymentTerm.updateMany({
      where: behalve ? { isDefault: true, id: { not: behalve } } : { isDefault: true },
      data: { isDefault: false },
    })
  }

  private naarWeergave(rij: Rij): PaymentTermView {
    const prepaymentPercent = rij.prepaymentPercent?.toString() ?? null
    return {
      id: rij.id,
      key: rij.key,
      name: rij.name,
      days: rij.days,
      endOfMonth: rij.endOfMonth,
      prepaymentPercent,
      invoiceText: rij.invoiceText,
      isDefault: rij.isDefault,
      isActive: rij.isActive,
      sort: rij.sort,
      customerCount: rij._count.customers,
      description: describePaymentTerm({
        days: rij.days,
        endOfMonth: rij.endOfMonth,
        prepaymentPercent,
        invoiceText: rij.invoiceText,
      }),
    }
  }

  private verschil(voor: PaymentTermView, na: PaymentTermView) {
    const velden = ['name', 'days', 'endOfMonth', 'prepaymentPercent', 'invoiceText', 'isDefault', 'isActive', 'sort'] as const
    const diff: Record<string, { van: unknown; naar: unknown }> = {}
    for (const veld of velden) {
      if (voor[veld] !== na[veld]) diff[veld] = { van: voor[veld], naar: na[veld] }
    }
    return Object.keys(diff).length > 0 ? diff : null
  }
}
