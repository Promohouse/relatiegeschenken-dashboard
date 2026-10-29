import { Injectable } from '@nestjs/common'
import {
  applicableRules, calculateUnitSalePrice, ruleSaleMarginPercent,
  selectPriceRule, selectPrintMarginPercent, selectTier,
  type PriceContext, type PriceRule, type PriceResult, type CustomerPriceAgreement,
} from '@rgh/contracts'
import { PrismaService } from '../prisma/prisma.service'
import { NotFoundError, PreconditionError } from '../errors/domain-errors'

export interface PriceRequest {
  productId: string
  quantity: number
  /** Klant waarvoor geprijsd wordt; laat klantafspraken meetellen. */
  customerId?: string | null
  /** Kanaal: eigen webshop, klantomgeving of partner. */
  channelId?: string | null
  /** Dwingt een bepaalde leverancier af; anders de voorkeursleverancier. */
  productSupplierId?: string | null
  /** Peildatum, voor een prijs zoals die op een moment in het verleden gold. */
  at?: Date
}

/**
 * Een intersectie en geen `extends`: `PriceResult` is een union op `source`,
 * en die eigenschap moet behouden blijven. Zo kan de aanroeper de regel of de
 * afspraak pas uitlezen nadat hij op `source` heeft gekeken.
 */
export type PriceBreakdown = PriceResult & {
  productId: string
  quantity: number
  supplierId: string | null
  supplierName: string | null
  /** De inkoopstaffel die bij dit aantal hoort, als die er is. */
  tierMinQuantity: number | null
  /**
   * De ingestelde drukmarge, of null als geen enkele regel er iets over zegt.
   * Null is geen nul: het betekent "volg de marge op het artikel".
   */
  printMarginPercent: string | null
  /**
   * De marge die de margeregel op dit artikel geeft, ook wanneer een
   * klantprijsafspraak de prijs overneemt. Dit is de "normale marge" die het
   * drukwerk aanhoudt als er niets anders is ingesteld.
   */
  ruleMarginPercent: string | null
  /** Alle regels die golden, op volgorde. Maakt navraagbaar waarom deze prijs. */
  consideredRuleIds: string[]
}

/**
 * De prijsengine. Haalt de gegevens op en laat het rekenwerk over aan
 * `packages/contracts`, zodat de frontend, de webshop en de partnerfeeds met
 * exact dezelfde functie rekenen (ADR-0005).
 */
@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  async resolveUnitPrice(request: PriceRequest): Promise<PriceBreakdown> {
    if (!Number.isInteger(request.quantity) || request.quantity < 1) {
      throw new PreconditionError('Het aantal moet een geheel getal groter dan nul zijn.')
    }

    const product = await this.prisma.db.product.findUnique({
      where: { id: request.productId },
      select: {
        id: true,
        name: true,
        categoryId: true,
        suppliers: {
          where: request.productSupplierId ? { id: request.productSupplierId } : { isActive: true },
          orderBy: [{ isPreferred: 'desc' }, { purchasePrice: 'asc' }],
          take: 1,
          select: {
            id: true,
            supplierId: true,
            purchasePrice: true,
            supplier: { select: { name: true } },
            purchaseTiers: { select: { minQuantity: true, unitPrice: true } },
          },
        },
      },
    })

    if (!product) throw new NotFoundError(`Product ${request.productId} bestaat niet.`)

    const leverancier = product.suppliers[0]
    if (!leverancier) {
      throw new PreconditionError(
        `Voor "${product.name}" is geen actieve leverancier ingesteld, dus is er geen inkoopprijs.`,
      )
    }

    // Staffel bepaalt de inkoopprijs; zonder passende staffel de basisprijs.
    const staffel = selectTier(
      leverancier.purchaseTiers.map((t) => ({
        minQuantity: t.minQuantity,
        unitPrice: t.unitPrice.toString(),
      })),
      request.quantity,
    )
    const inkoopprijs = staffel?.unitPrice ?? leverancier.purchasePrice.toString()

    const context: PriceContext = {
      productId: product.id,
      categoryId: product.categoryId,
      supplierId: leverancier.supplierId,
      customerId: request.customerId ?? null,
      channelId: request.channelId ?? null,
      quantity: request.quantity,
      at: request.at,
    }

    const [regels, afspraken] = await Promise.all([
      this.laadRegels(context),
      this.laadAfspraken(context),
    ])
    const uitkomst = calculateUnitSalePrice(inkoopprijs, regels, context, afspraken)
    // Los van de afspraak: die gaat over de prijs van het artikel, niet over
    // wat bedrukken kost.
    const drukmarge = selectPrintMarginPercent(regels, context)
    const regel = selectPriceRule(regels, context)
    const regelmarge = regel ? ruleSaleMarginPercent(inkoopprijs, regel) : null

    if (!uitkomst) {
      throw new PreconditionError(
        `Er is geen prijsregel die geldt voor "${product.name}" bij ${request.quantity} stuks. ` +
          'Zonder regel wordt er geen prijs bepaald, want terugvallen op de inkoopprijs zou ' +
          'betekenen dat er zonder marge verkocht wordt.',
      )
    }

    return {
      ...uitkomst,
      productId: product.id,
      quantity: request.quantity,
      supplierId: leverancier.supplierId,
      supplierName: leverancier.supplier.name,
      tierMinQuantity: staffel?.minQuantity ?? null,
      printMarginPercent: drukmarge === null ? null : drukmarge.toFixed(2),
      ruleMarginPercent: regelmarge === null ? null : regelmarge.toFixed(2),
      consideredRuleIds: applicableRules(regels, context).map((r) => r.id),
    }
  }

  /**
   * De klantprijsafspraken voor dit product. Een afspraak gaat voor op elke
   * prijsregel; de voorrang zelf zit in `calculateUnitSalePrice`, niet hier.
   */
  private async laadAfspraken(context: PriceContext): Promise<CustomerPriceAgreement[]> {
    if (!context.customerId) return []

    const rijen = await this.prisma.db.customerPriceAgreement.findMany({
      where: {
        customerId: context.customerId,
        productId: context.productId,
        isActive: true,
        minQuantity: { lte: context.quantity },
      },
    })

    return rijen.map((a) => ({
      id: a.id,
      customerId: a.customerId,
      productId: a.productId,
      minQuantity: a.minQuantity,
      unitPrice: a.unitPrice.toString(),
      validFrom: a.validFrom,
      validTo: a.validTo,
      isActive: a.isActive,
    }))
  }

  /**
   * Haalt ruim op en filtert fijn in de domeinlogica: de database selecteert
   * wat mogelijk van toepassing is, de gedeelde functie beslist wat geldt.
   */
  private async laadRegels(context: PriceContext): Promise<PriceRule[]> {
    const rijen = await this.prisma.db.priceRule.findMany({
      where: {
        isActive: true,
        minQuantity: { lte: context.quantity },
        OR: [
          { scope: 'GLOBAL' },
          { scope: 'PRODUCT', productId: context.productId },
          ...(context.categoryId ? [{ scope: 'CATEGORY' as const, categoryId: context.categoryId }] : []),
          ...(context.supplierId ? [{ scope: 'SUPPLIER' as const, supplierId: context.supplierId }] : []),
          ...(context.customerId ? [{ scope: 'CUSTOMER' as const, customerId: context.customerId }] : []),
          ...(context.channelId ? [{ scope: 'CHANNEL' as const, channelId: context.channelId }] : []),
        ],
      },
    })

    // Prisma heeft zijn eigen Decimal; via tekst omzetten voorkomt dat twee
    // decimal-implementaties door elkaar lopen.
    return rijen.map((r) => ({
      id: r.id,
      scope: r.scope,
      supplierId: r.supplierId,
      categoryId: r.categoryId,
      productId: r.productId,
      customerId: r.customerId,
      channelId: r.channelId,
      minQuantity: r.minQuantity,
      marginBasis: r.marginBasis,
      marginPercent: r.marginPercent?.toString() ?? null,
      markupAmount: r.markupAmount?.toString() ?? null,
      printMarginPercent: r.printMarginPercent?.toString() ?? null,
      priority: r.priority,
      validFrom: r.validFrom,
      validTo: r.validTo,
      isActive: r.isActive,
    }))
  }
}
