import { Injectable } from '@nestjs/common'
import {
  selectCustomerAgreement,
  type CreatePriceAgreement, type PriceAgreementView, type UpdatePriceAgreement,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { ConflictError, NotFoundError } from '../../core/errors/domain-errors'
import { ProductsService } from '../products/products.service'

const GEVOLGD = ['unitPrice', 'note', 'validFrom', 'validTo', 'isActive'] as const

/**
 * Klantprijsafspraken: een met de klant afgesproken bedrag per stuk.
 *
 * De voorrang op gewone prijsregels zit in `calculateUnitSalePrice`, niet
 * hier. Deze service bewaart en toont alleen de afspraken.
 */
@Injectable()
export class CustomerPricesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly products: ProductsService,
  ) {}

  async list(customerId: string, at: Date = new Date()): Promise<PriceAgreementView[]> {
    await this.moetBestaan(customerId)

    const rijen = await this.prisma.db.customerPriceAgreement.findMany({
      where: { customerId },
      orderBy: [{ product: { name: 'asc' } }, { minQuantity: 'asc' }],
      include: { product: { select: { name: true, articleNumber: true } } },
    })

    // Welke afspraak vandaag zou gelden bij precies haar eigen drempel: via
    // dezelfde functie die de prijsengine gebruikt, zodat het scherm niet iets
    // anders beweert dan de calculatie doet.
    const voorEngine = rijen.map((a) => ({
      id: a.id,
      customerId: a.customerId,
      productId: a.productId,
      minQuantity: a.minQuantity,
      unitPrice: a.unitPrice.toString(),
      validFrom: a.validFrom,
      validTo: a.validTo,
      isActive: a.isActive,
    }))
    const geldend = new Set(
      voorEngine
        .map(
          (r) =>
            selectCustomerAgreement(voorEngine, {
              productId: r.productId,
              customerId,
              quantity: r.minQuantity,
              at,
            })?.id,
        )
        .filter((id): id is string => !!id),
    )

    return rijen.map((r) => ({
      id: r.id,
      productId: r.productId,
      productName: r.product.name,
      productArticleNumber: r.product.articleNumber,
      minQuantity: r.minQuantity,
      unitPrice: r.unitPrice.toString(),
      note: r.note,
      validFrom: r.validFrom?.toISOString() ?? null,
      validTo: r.validTo?.toISOString() ?? null,
      isActive: r.isActive,
      appliesToday: geldend.has(r.id),
    }))
  }

  async create(customerId: string, input: CreatePriceAgreement): Promise<PriceAgreementView> {
    await this.moetBestaan(customerId)
    // Via de productservice, niet rechtstreeks in de producttabel: harde regel 1.
    await this.products.summary(input.productId)

    const bestaat = await this.prisma.db.customerPriceAgreement.findFirst({
      where: { customerId, productId: input.productId, minQuantity: input.minQuantity },
      select: { id: true },
    })
    if (bestaat) {
      throw new ConflictError(
        `Voor dit product bestaat al een afspraak vanaf ${input.minQuantity} stuks. ` +
          'Wijzig die, of maak een afspraak vanaf een ander aantal.',
      )
    }

    const afspraak = await this.prisma.db.customerPriceAgreement.create({
      data: {
        customerId,
        productId: input.productId,
        minQuantity: input.minQuantity,
        unitPrice: input.unitPrice,
        note: input.note ?? null,
        validFrom: input.validFrom ?? null,
        validTo: input.validTo ?? null,
        isActive: input.isActive,
      },
    })

    await this.audit.record({
      entity: 'CustomerPriceAgreement',
      entityId: afspraak.id,
      action: 'CREATE',
      diff: this.audit.diff(null, afspraak as never, GEVOLGD as never),
    })
    return this.een(customerId, afspraak.id)
  }

  async update(
    customerId: string,
    id: string,
    input: UpdatePriceAgreement,
  ): Promise<PriceAgreementView> {
    const voor = await this.moetVanDezeKlantZijn(customerId, id)

    const na = await this.prisma.db.customerPriceAgreement.update({
      where: { id },
      data: {
        unitPrice: input.unitPrice,
        note: input.note,
        validFrom: input.validFrom,
        validTo: input.validTo,
        isActive: input.isActive,
      },
    })

    const verschil = this.audit.diff(voor as never, na as never, GEVOLGD as never)
    if (verschil) {
      await this.audit.record({
        entity: 'CustomerPriceAgreement',
        entityId: id,
        action: 'UPDATE',
        diff: verschil,
      })
    }
    return this.een(customerId, id)
  }

  /**
   * Verwijderen mag: een prijsafspraak is een afspraak voor de toekomst, geen
   * historisch document. Wat er met een afspraak berekend is staat vast in de
   * offerteregels en orderregels zelf (harde regel 3), dus een order verandert
   * hier niet van.
   */
  async remove(customerId: string, id: string): Promise<void> {
    await this.moetVanDezeKlantZijn(customerId, id)
    await this.prisma.db.customerPriceAgreement.delete({ where: { id } })
    await this.audit.record({ entity: 'CustomerPriceAgreement', entityId: id, action: 'DELETE' })
  }

  private async een(customerId: string, id: string): Promise<PriceAgreementView> {
    const alles = await this.list(customerId)
    const gevonden = alles.find((a) => a.id === id)
    if (!gevonden) throw new NotFoundError('Deze prijsafspraak bestaat niet.')
    return gevonden
  }

  private async moetBestaan(customerId: string): Promise<void> {
    const klant = await this.prisma.db.customer.findUnique({
      where: { id: customerId },
      select: { id: true },
    })
    if (!klant) throw new NotFoundError('Deze klant bestaat niet of is niet voor jou zichtbaar.')
  }

  /**
   * Een afspraak van een andere klant levert "bestaat niet" op, geen
   * "mag niet": anders verraadt het antwoord dat het id bestaat.
   */
  private async moetVanDezeKlantZijn(customerId: string, id: string) {
    const afspraak = await this.prisma.db.customerPriceAgreement.findFirst({
      where: { id, customerId },
    })
    if (!afspraak) throw new NotFoundError('Deze prijsafspraak bestaat niet bij deze klant.')
    return afspraak
  }
}
