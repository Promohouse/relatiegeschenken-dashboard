import { Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import type { CreateAddress, UpdateAddress } from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { ConflictError, NotFoundError } from '../../core/errors/domain-errors'

const GEVOLGD = [
  'type', 'label', 'attention', 'street', 'houseNumber', 'postalCode', 'city', 'country', 'isDefault',
] as const

@Injectable()
export class AddressesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(customerId: string, input: CreateAddress) {
    const klant = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
    if (!klant) throw new NotFoundError('Deze klant bestaat niet of is niet voor jou zichtbaar.')

    const adres = await this.prisma.unscoped.$transaction(async (tx) => {
      // Het eerste adres van een soort is vanzelf het standaardadres; anders
      // zou een klant een afleveradres hebben dat nergens gekozen wordt.
      const aantal = await tx.address.count({ where: { customerId, type: input.type } })
      const wordtStandaard = input.isDefault ?? aantal === 0

      if (wordtStandaard) await this.ontneemStandaard(tx, customerId, input.type)
      return tx.address.create({ data: { ...input, customerId, isDefault: wordtStandaard } })
    })

    await this.audit.record({
      entity: 'Address',
      entityId: adres.id,
      action: 'CREATE',
      diff: this.audit.diff(null, adres as never, GEVOLGD as never),
    })
    return adres
  }

  async update(customerId: string, addressId: string, input: UpdateAddress) {
    const voor = await this.moetVanDezeKlantZijn(customerId, addressId)

    const na = await this.prisma.unscoped.$transaction(async (tx) => {
      if (input.isDefault) {
        await this.ontneemStandaard(tx, customerId, input.type ?? voor.type, addressId)
      }
      return tx.address.update({ where: { id: addressId }, data: input })
    })

    const verschil = this.audit.diff(voor as never, na as never, GEVOLGD as never)
    if (verschil) {
      await this.audit.record({ entity: 'Address', entityId: addressId, action: 'UPDATE', diff: verschil })
    }
    return na
  }

  /**
   * Verwijderen mag alleen als het adres nergens aan vastzit.
   *
   * De verwijzingen staan op SetNull, dus zonder deze controle zou een
   * verwijderde straat stilletjes uit een bestaande order verdwijnen - en dan
   * weet niemand meer waar die doos heen is gegaan.
   */
  async remove(customerId: string, addressId: string) {
    const adres = await this.moetVanDezeKlantZijn(customerId, addressId)
    const db = this.prisma.unscoped

    const [orders, offertes, zendingen] = await Promise.all([
      db.order.count({ where: { OR: [{ invoiceAddressId: addressId }, { deliveryAddressId: addressId }] } }),
      db.quote.count({ where: { OR: [{ invoiceAddressId: addressId }, { deliveryAddressId: addressId }] } }),
      db.shipment.count({ where: { deliveryAddressId: addressId } }),
    ])

    const gebruikt = [
      orders && `${orders} ${orders === 1 ? 'order' : 'orders'}`,
      offertes && `${offertes} ${offertes === 1 ? 'offerte' : 'offertes'}`,
      zendingen && `${zendingen} ${zendingen === 1 ? 'zending' : 'zendingen'}`,
    ].filter(Boolean)

    if (gebruikt.length > 0) {
      throw new ConflictError(
        `Dit adres is gebruikt bij ${gebruikt.join(' en ')} en kan niet verwijderd worden. ` +
          'Pas het aan of voeg een nieuw adres toe.',
      )
    }

    await db.address.delete({ where: { id: addressId } })
    await this.audit.record({
      entity: 'Address',
      entityId: addressId,
      action: 'DELETE',
      diff: this.audit.diff(adres as never, {} as never, GEVOLGD as never),
    })
  }

  private async moetVanDezeKlantZijn(customerId: string, addressId: string) {
    const adres = await this.prisma.db.address.findFirst({ where: { id: addressId, customerId } })
    if (!adres) throw new NotFoundError('Dit adres bestaat niet bij deze klant.')
    return adres
  }

  /** Eén standaardadres per soort. */
  private async ontneemStandaard(
    tx: Prisma.TransactionClient,
    customerId: string,
    type: 'INVOICE' | 'DELIVERY',
    behalve?: string,
  ) {
    await tx.address.updateMany({
      where: { customerId, type, isDefault: true, ...(behalve ? { NOT: { id: behalve } } : {}) },
      data: { isDefault: false },
    })
  }
}
