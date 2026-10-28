import { Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import type { CreateContact, UpdateContact } from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { NotFoundError } from '../../core/errors/domain-errors'

const GEVOLGD = ['firstName', 'lastName', 'email', 'phone', 'jobTitle', 'isPrimary', 'isActive'] as const

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async create(customerId: string, input: CreateContact) {
    await this.klantMoetBestaan(customerId)

    const contact = await this.prisma.unscoped.$transaction(async (tx) => {
      if (input.isPrimary) await this.ontneemHoofdcontact(tx, customerId)
      return tx.contactPerson.create({ data: { ...input, customerId } })
    })

    await this.audit.record({
      entity: 'ContactPerson',
      entityId: contact.id,
      action: 'CREATE',
      diff: this.audit.diff(null, contact as never, GEVOLGD as never),
    })
    return contact
  }

  async update(customerId: string, contactId: string, input: UpdateContact) {
    const voor = await this.moetVanDezeKlantZijn(customerId, contactId)

    const na = await this.prisma.unscoped.$transaction(async (tx) => {
      if (input.isPrimary) await this.ontneemHoofdcontact(tx, customerId, contactId)
      return tx.contactPerson.update({ where: { id: contactId }, data: input })
    })

    const verschil = this.audit.diff(voor as never, na as never, GEVOLGD as never)
    if (verschil) {
      await this.audit.record({
        entity: 'ContactPerson', entityId: contactId, action: 'UPDATE', diff: verschil,
      })
    }
    return na
  }

  /**
   * Contactpersonen worden niet verwijderd maar op inactief gezet: ze hangen
   * aan orders en aan gegeven goedkeuringen, en die historie blijft staan.
   */
  async setActive(customerId: string, contactId: string, isActive: boolean) {
    const voor = await this.moetVanDezeKlantZijn(customerId, contactId)
    if (voor.isActive === isActive) return voor

    const na = await this.prisma.unscoped.contactPerson.update({
      where: { id: contactId },
      data: { isActive, ...(isActive ? {} : { isPrimary: false }) },
    })

    await this.audit.record({
      entity: 'ContactPerson',
      entityId: contactId,
      action: 'UPDATE',
      diff: { isActive: { van: voor.isActive, naar: isActive } },
    })
    return na
  }

  private async klantMoetBestaan(customerId: string) {
    const klant = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
    if (!klant) throw new NotFoundError('Deze klant bestaat niet of is niet voor jou zichtbaar.')
  }

  /** Voorkomt dat een id van een andere klant toegang geeft. */
  private async moetVanDezeKlantZijn(customerId: string, contactId: string) {
    const contact = await this.prisma.db.contactPerson.findFirst({
      where: { id: contactId, customerId },
    })
    if (!contact) {
      throw new NotFoundError('Deze contactpersoon bestaat niet bij deze klant.')
    }
    return contact
  }

  /** Er is hoogstens één hoofdcontact per klant. */
  private async ontneemHoofdcontact(
    tx: Prisma.TransactionClient,
    customerId: string,
    behalve?: string,
  ) {
    await tx.contactPerson.updateMany({
      where: { customerId, isPrimary: true, ...(behalve ? { NOT: { id: behalve } } : {}) },
      data: { isPrimary: false },
    })
  }
}
