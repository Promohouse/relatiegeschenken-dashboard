import { Injectable } from '@nestjs/common'
import { issueNumber, nextQuoteVersionNumber, type Prisma } from '@rgh/db'
import {
  round2, sumOrderTotals,
  type AddQuoteLine, type CreateQuote, type QuoteSummary, type QuoteView, type UpdateQuote,
} from '@rgh/contracts'
import Decimal from 'decimal.js'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { SettingsService } from '../settings/settings.service'
import { NotFoundError, PreconditionError } from '../../core/errors/domain-errors'
import { CalculatorService } from './calculator.service'

/**
 * De offerte als document.
 *
 * Een offerteregel is een bewaarde calculatie: dezelfde `CalculatorService`
 * die het scherm gebruikt, rekent hem uit, en het resultaat wordt
 * overgeschreven naar eigen kolommen. Dat laatste is harde regel 3 - een
 * latere prijswijziging op het product raakt een bestaande offerte nooit.
 *
 * Deze service zet geen status. Een offerte ontstaat als CONCEPT en blijft
 * dat; versturen, accepteren en verlopen zijn overgangen en horen bij de
 * workflow-engine (harde regel 10), die nog gebouwd moet worden. Vastzetten
 * hoort bij versturen en zit hier dus ook nog niet in.
 */
@Injectable()
export class QuotesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly settings: SettingsService,
    private readonly calculator: CalculatorService,
  ) {}

  async list(): Promise<QuoteSummary[]> {
    const offertes = await this.prisma.db.quote.findMany({
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        customer: { select: { name: true } },
        currentVersion: { include: { _count: { select: { items: true } } } },
      },
    })

    return offertes.map((o) => ({
      id: o.id,
      number: o.number,
      status: o.status,
      customerName: o.customer.name,
      reference: o.reference,
      versionNumber: o.currentVersion?.versionNumber ?? 0,
      lineCount: o.currentVersion?._count.items ?? 0,
      totalInclVat: (o.currentVersion?.totalInclVat ?? new Decimal(0)).toString(),
      validUntil: o.currentVersion?.validUntil?.toISOString() ?? null,
      createdAt: o.createdAt.toISOString(),
    }))
  }

  async byId(id: string): Promise<QuoteView> {
    const offerte = await this.prisma.db.quote.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        contactPerson: { select: { firstName: true, lastName: true } },
        currentVersion: {
          include: {
            items: {
              orderBy: { lineNumber: 'asc' },
              include: { printJobs: { orderBy: { createdAt: 'asc' } } },
            },
          },
        },
      },
    })
    if (!offerte) throw new NotFoundError('Deze offerte bestaat niet.')
    if (!offerte.currentVersion) {
      throw new PreconditionError(
        `Offerte ${offerte.number} heeft geen versie. Dat hoort niet te kunnen; meld dit.`,
      )
    }

    const versie = offerte.currentVersion
    const subtotaal = new Decimal(versie.subtotalExclVat.toString())

    return {
      id: offerte.id,
      number: offerte.number,
      status: offerte.status,
      customerId: offerte.customerId,
      customerName: offerte.customer.name,
      contactPersonId: offerte.contactPersonId,
      contactPersonName: offerte.contactPerson
        ? `${offerte.contactPerson.firstName ?? ''} ${offerte.contactPerson.lastName}`.trim()
        : null,
      reference: offerte.reference,
      requestedDeliveryDate: offerte.requestedDeliveryDate?.toISOString() ?? null,
      notes: offerte.notes,
      createdAt: offerte.createdAt.toISOString(),
      currentVersion: {
        id: versie.id,
        versionNumber: versie.versionNumber,
        validUntil: versie.validUntil?.toISOString() ?? null,
        vatRegime: versie.vatRegime,
        currency: versie.currency,
        subtotalExclVat: versie.subtotalExclVat.toFixed(2),
        vatAmount: versie.vatAmount.toFixed(2),
        totalInclVat: versie.totalInclVat.toFixed(2),
        purchaseTotal: versie.purchaseTotal.toFixed(2),
        marginAmount: versie.marginAmount.toFixed(2),
        marginPercent: subtotaal.isZero()
          ? '0.00'
          : round2(new Decimal(versie.marginAmount.toString()).dividedBy(subtotaal).times(100)).toFixed(2),
        deliveryTerms: versie.deliveryTerms,
        customerNotes: versie.customerNotes,
        lockedAt: versie.lockedAt?.toISOString() ?? null,
        sentAt: versie.sentAt?.toISOString() ?? null,
        lines: versie.items.map((r) => ({
          id: r.id,
          lineNumber: r.lineNumber,
          productId: r.productId,
          productArticleNumber: r.productArticleNumber,
          productName: r.productName,
          description: r.description,
          supplierName: r.supplierName,
          quantity: r.quantity,
          unitSalePrice: r.unitSalePrice.toFixed(4),
          unitPurchasePrice: r.unitPurchasePrice.toFixed(4),
          discountPercent: r.discountPercent.toFixed(2),
          setupCost: r.setupCost.toFixed(4),
          vatRate: r.vatRate.toFixed(2),
          lineSubtotalExclVat: r.lineSubtotalExclVat.toFixed(2),
          lineVatAmount: r.lineVatAmount.toFixed(2),
          lineTotalInclVat: r.lineTotalInclVat.toFixed(2),
          linePurchaseTotal: r.linePurchaseTotal.toFixed(2),
          lineMarginAmount: r.lineMarginAmount.toFixed(2),
          notes: r.notes,
          printJobs: r.printJobs.map((d) => ({
            printMethodName: d.printMethodName,
            position: d.position,
            colors: d.colors,
            unitPrice: d.unitPrice.toFixed(4),
            setupCost: d.setupCost.toFixed(4),
          })),
        })),
      },
    }
  }

  /**
   * Een nieuwe offerte met een lege eerste versie.
   *
   * Het nummer komt uit de reeks `QUOTE` en wordt binnen dezelfde transactie
   * uitgegeven als de offerte zelf: valt er iets om, dan is er ook geen gat
   * in de nummering.
   */
  async create(input: CreateQuote): Promise<QuoteView> {
    const klant = await this.prisma.db.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, isActive: true, name: true },
    })
    if (!klant) throw new NotFoundError('Deze klant bestaat niet.')
    if (!klant.isActive) {
      throw new PreconditionError(
        `${klant.name} staat op inactief. Zet de klant eerst weer actief voordat je offreert.`,
      )
    }

    if (input.contactPersonId) {
      const contact = await this.prisma.db.contactPerson.findFirst({
        where: { id: input.contactPersonId, customerId: input.customerId },
        select: { id: true },
      })
      if (!contact) {
        throw new PreconditionError('Deze contactpersoon hoort niet bij deze klant.')
      }
    }

    const dagen = await this.settings.quoteValidityDays()
    const geldigTot = new Date()
    geldigTot.setDate(geldigTot.getDate() + dagen)

    const id = await this.prisma.unscoped.$transaction(async (tx) => {
      const nummer = await issueNumber(tx, 'QUOTE', new Date().getFullYear())

      const offerte = await tx.quote.create({
        data: {
          number: nummer,
          customerId: input.customerId,
          contactPersonId: input.contactPersonId ?? null,
          reference: input.reference ?? null,
          requestedDeliveryDate: input.requestedDeliveryDate ?? null,
          notes: input.notes ?? null,
        },
      })

      const versie = await tx.quoteVersion.create({
        data: {
          quoteId: offerte.id,
          versionNumber: await nextQuoteVersionNumber(tx, offerte.id),
          validUntil: geldigTot,
          vatRegime: input.vatRegime,
          customerNotes: input.customerNotes ?? null,
          deliveryTerms: input.deliveryTerms ?? null,
        },
      })

      await tx.quote.update({
        where: { id: offerte.id },
        data: { currentVersionId: versie.id },
      })

      return offerte.id
    })

    await this.audit.record({ entity: 'Quote', entityId: id, action: 'CREATE' })
    return this.byId(id)
  }

  async update(id: string, input: UpdateQuote): Promise<QuoteView> {
    const versie = await this.bewerkbareVersie(id)

    await this.prisma.unscoped.$transaction(async (tx) => {
      await tx.quote.update({
        where: { id },
        data: {
          contactPersonId: input.contactPersonId,
          reference: input.reference,
          requestedDeliveryDate: input.requestedDeliveryDate,
          notes: input.notes,
        },
      })
      if (input.customerNotes !== undefined || input.deliveryTerms !== undefined) {
        await tx.quoteVersion.update({
          where: { id: versie.id },
          data: {
            customerNotes: input.customerNotes,
            deliveryTerms: input.deliveryTerms,
          },
        })
      }
    })

    await this.audit.record({ entity: 'Quote', entityId: id, action: 'UPDATE' })
    return this.byId(id)
  }

  /**
   * Een regel toevoegen: doorrekenen met de calculator en de uitkomst
   * overschrijven naar eigen kolommen.
   *
   * De klant komt van de offerte en niet uit de invoer, zodat er niet voor de
   * ene klant geprijsd kan worden terwijl de offerte naar de andere gaat.
   */
  async addLine(quoteId: string, input: AddQuoteLine): Promise<QuoteView> {
    const versie = await this.bewerkbareVersie(quoteId)

    const uitkomst = await this.calculator.calculate({
      ...input,
      customerId: versie.quote.customerId,
      vatRegime: input.vatRegime,
    })

    await this.prisma.unscoped.$transaction(async (tx) => {
      const laatste = await tx.quoteItem.findFirst({
        where: { quoteVersionId: versie.id },
        orderBy: { lineNumber: 'desc' },
        select: { lineNumber: true },
      })

      await tx.quoteItem.create({
        data: {
          quoteVersionId: versie.id,
          lineNumber: (laatste?.lineNumber ?? 0) + 1,
          productId: uitkomst.productId,
          productSupplierId: input.productSupplierId ?? null,
          productArticleNumber: uitkomst.articleNumber,
          productName: uitkomst.productName,
          supplierName: uitkomst.supplierName,
          description: input.description ?? null,
          quantity: uitkomst.quantity,
          // De prijs vóór korting; de korting staat ernaast, zodat op de
          // offerte te zien is wat er is weggegeven.
          unitSalePrice: uitkomst.unitSalePrice,
          unitPurchasePrice: uitkomst.unitPurchasePrice,
          discountPercent: uitkomst.discountPercent,
          setupCost: uitkomst.setupTotal,
          vatRate: uitkomst.vatRate,
          lineSubtotalExclVat: uitkomst.subtotalExclVat,
          lineVatAmount: uitkomst.vatAmount,
          lineTotalInclVat: uitkomst.totalInclVat,
          linePurchaseTotal: uitkomst.purchaseTotal,
          lineMarginAmount: uitkomst.marginAmount,
          notes: input.notes ?? null,
          printJobs: {
            create: uitkomst.printPositions.map((p) => ({
              printMethodName: p.methodName,
              position: p.positionName,
              colors: p.colors,
              unitPrice: p.unitSalePrice,
              setupCost: p.setupSaleCost,
            })),
          },
        },
      })

      await this.herberekenTotalen(tx, versie.id)
    })

    await this.audit.record({ entity: 'Quote', entityId: quoteId, action: 'UPDATE' })
    return this.byId(quoteId)
  }

  async removeLine(quoteId: string, lineId: string): Promise<QuoteView> {
    const versie = await this.bewerkbareVersie(quoteId)

    const regel = await this.prisma.db.quoteItem.findFirst({
      where: { id: lineId, quoteVersionId: versie.id },
      select: { id: true },
    })
    if (!regel) throw new NotFoundError('Deze regel hoort niet bij deze offerte.')

    await this.prisma.unscoped.$transaction(async (tx) => {
      await tx.quoteItem.delete({ where: { id: lineId } })
      await this.herberekenTotalen(tx, versie.id)
    })

    await this.audit.record({ entity: 'Quote', entityId: quoteId, action: 'UPDATE' })
    return this.byId(quoteId)
  }

  /**
   * De versie waarop gewerkt mag worden.
   *
   * Een vastgezette versie weigeren we hier met een leesbare melding. De
   * databasetriggers weigeren het ook (ADR-0007), maar die melding is voor
   * een gebruiker niet te plaatsen.
   */
  private async bewerkbareVersie(quoteId: string) {
    const offerte = await this.prisma.db.quote.findUnique({
      where: { id: quoteId },
      include: { currentVersion: true },
    })
    if (!offerte) throw new NotFoundError('Deze offerte bestaat niet.')
    if (!offerte.currentVersion) {
      throw new PreconditionError(`Offerte ${offerte.number} heeft geen versie.`)
    }
    if (offerte.currentVersion.lockedAt) {
      throw new PreconditionError(
        `Versie ${offerte.currentVersion.versionNumber} van offerte ${offerte.number} is ` +
          'vastgezet en kan niet meer wijzigen. Maak een nieuwe versie aan.',
      )
    }
    return { ...offerte.currentVersion, quote: offerte }
  }

  /**
   * Totalen zijn de som van de al afgeronde regelbedragen (ADR-0005). Niet
   * opnieuw uitrekenen vanaf de stuksprijzen: dan wijkt het totaal af van de
   * optelling die de klant op papier ziet.
   */
  private async herberekenTotalen(tx: Prisma.TransactionClient, quoteVersionId: string) {
    const regels = await tx.quoteItem.findMany({
      where: { quoteVersionId },
      select: {
        lineSubtotalExclVat: true,
        lineVatAmount: true,
        lineTotalInclVat: true,
        linePurchaseTotal: true,
        lineMarginAmount: true,
      },
    })

    const totalen = sumOrderTotals(
      regels.map((r) => ({
        subtotalExclVat: new Decimal(r.lineSubtotalExclVat.toString()),
        vatAmount: new Decimal(r.lineVatAmount.toString()),
        totalInclVat: new Decimal(r.lineTotalInclVat.toString()),
        purchaseTotal: new Decimal(r.linePurchaseTotal.toString()),
        marginAmount: new Decimal(r.lineMarginAmount.toString()),
        marginPercent: new Decimal(0),
      })),
    )

    await tx.quoteVersion.update({
      where: { id: quoteVersionId },
      data: {
        subtotalExclVat: totalen.subtotalExclVat.toFixed(2),
        vatAmount: totalen.vatAmount.toFixed(2),
        totalInclVat: totalen.totalInclVat.toFixed(2),
        purchaseTotal: totalen.purchaseTotal.toFixed(2),
        marginAmount: totalen.marginAmount.toFixed(2),
      },
    })
  }
}
