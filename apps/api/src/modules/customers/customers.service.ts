import { Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import type {
  CreateCustomer, CustomerDetail, ListCustomersQuery, PaginatedCustomers, UpdateCustomer,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { NumberingService } from '../../core/numbering/numbering.service'
import { NotFoundError } from '../../core/errors/domain-errors'

/** Velden waarvan een wijziging in het auditlog terechtkomt. */
const GEVOLGDE_VELDEN = [
  'name', 'vatNumber', 'email', 'phone', 'website', 'notes', 'isActive',
] as const

@Injectable()
export class CustomersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly numbering: NumberingService,
  ) {}

  async list(query: ListCustomersQuery): Promise<PaginatedCustomers> {
    const where: Prisma.CustomerWhereInput = {}

    if (query.status !== 'all') {
      where.isActive = query.status === 'active'
    }

    if (query.search) {
      const zoek = query.search
      where.OR = [
        { name: { contains: zoek, mode: 'insensitive' } },
        { number: { contains: zoek, mode: 'insensitive' } },
        { email: { contains: zoek, mode: 'insensitive' } },
        { vatNumber: { contains: zoek, mode: 'insensitive' } },
        { contacts: { some: { lastName: { contains: zoek, mode: 'insensitive' } } } },
      ]
    }

    const orderBy: Prisma.CustomerOrderByWithRelationInput =
      query.sort === 'createdAt'
        ? { createdAt: query.direction }
        : query.sort === 'number'
          ? { number: query.direction }
          : { name: query.direction }

    const [rijen, total] = await Promise.all([
      this.prisma.db.customer.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        select: {
          id: true, number: true, name: true, email: true, phone: true,
          isActive: true, isDemo: true,
          addresses: {
            where: { type: 'DELIVERY', isDefault: true },
            select: { city: true },
            take: 1,
          },
          _count: {
            select: {
              quotes: { where: { status: { in: ['SENT', 'AWAITING_CUSTOMER', 'CHANGES_REQUESTED'] } } },
              orders: { where: { status: 'ACTIVE' } },
            },
          },
        },
      }),
      this.prisma.db.customer.count({ where }),
    ])

    return {
      items: rijen.map((r) => ({
        id: r.id,
        number: r.number,
        name: r.name,
        email: r.email,
        phone: r.phone,
        city: r.addresses[0]?.city ?? null,
        isActive: r.isActive,
        isDemo: r.isDemo,
        openQuotes: r._count.quotes,
        activeOrders: r._count.orders,
      })),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async byId(id: string): Promise<CustomerDetail> {
    const klant = await this.prisma.db.customer.findUnique({
      where: { id },
      include: {
        contacts: { orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }] },
        addresses: { orderBy: [{ type: 'asc' }, { isDefault: 'desc' }] },
        _count: {
          select: {
            quotes: { where: { status: { in: ['SENT', 'AWAITING_CUSTOMER', 'CHANGES_REQUESTED'] } } },
            orders: { where: { status: 'ACTIVE' } },
          },
        },
      },
    })

    if (!klant) throw new NotFoundError('Deze klant bestaat niet of is niet voor jou zichtbaar.')

    const afleveradres = klant.addresses.find((a) => a.type === 'DELIVERY' && a.isDefault)

    return {
      id: klant.id,
      number: klant.number,
      name: klant.name,
      email: klant.email,
      phone: klant.phone,
      city: afleveradres?.city ?? null,
      isActive: klant.isActive,
      isDemo: klant.isDemo,
      openQuotes: klant._count.quotes,
      activeOrders: klant._count.orders,
      vatNumber: klant.vatNumber,
      website: klant.website,
      notes: klant.notes,
      createdAt: klant.createdAt.toISOString(),
      updatedAt: klant.updatedAt.toISOString(),
      contacts: klant.contacts.map((c) => ({
        id: c.id, firstName: c.firstName, lastName: c.lastName,
        email: c.email, phone: c.phone, jobTitle: c.jobTitle,
        isPrimary: c.isPrimary, isActive: c.isActive,
      })),
      addresses: klant.addresses.map((a) => ({
        id: a.id, type: a.type, label: a.label, street: a.street,
        houseNumber: a.houseNumber, postalCode: a.postalCode, city: a.city,
        country: a.country, isDefault: a.isDefault,
      })),
    }
  }

  async create(input: CreateCustomer): Promise<CustomerDetail> {
    // Nummer en klant in één transactie: anders raakt een nummer kwijt als het
    // aanmaken daarna faalt.
    const klant = await this.prisma.unscoped.$transaction(async (tx) => {
      const number = await this.numbering.issueIn(tx, 'CUSTOMER', 0)
      return tx.customer.create({ data: { ...input, number } })
    })

    await this.audit.record({
      entity: 'Customer',
      entityId: klant.id,
      action: 'CREATE',
      diff: this.audit.diff(null, klant as never, GEVOLGDE_VELDEN as never),
    })

    return this.byId(klant.id)
  }

  async update(id: string, input: UpdateCustomer): Promise<CustomerDetail> {
    const voor = await this.prisma.db.customer.findUnique({ where: { id } })
    if (!voor) throw new NotFoundError('Deze klant bestaat niet of is niet voor jou zichtbaar.')

    const na = await this.prisma.db.customer.update({ where: { id }, data: input })

    const verschil = this.audit.diff(voor as never, na as never, GEVOLGDE_VELDEN as never)
    if (verschil) {
      await this.audit.record({ entity: 'Customer', entityId: id, action: 'UPDATE', diff: verschil })
    }

    return this.byId(id)
  }

  /**
   * Klanten worden niet verwijderd maar op inactief gezet: orderhistorie en
   * facturen moeten bewaard blijven (harde regel 9).
   */
  async setActive(id: string, isActive: boolean): Promise<CustomerDetail> {
    const voor = await this.prisma.db.customer.findUnique({ where: { id }, select: { isActive: true } })
    if (!voor) throw new NotFoundError('Deze klant bestaat niet of is niet voor jou zichtbaar.')

    if (voor.isActive !== isActive) {
      await this.prisma.db.customer.update({ where: { id }, data: { isActive } })
      await this.audit.record({
        entity: 'Customer',
        entityId: id,
        action: 'UPDATE',
        diff: { isActive: { van: voor.isActive, naar: isActive } },
      })
    }

    return this.byId(id)
  }
}
