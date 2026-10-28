import { Injectable } from '@nestjs/common'
import {
  calculateQuoteLine, selectTier,
  type CalculateQuoteLine, type PrintPositionInput, type QuoteLineCalculation,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { PricingService } from '../../core/pricing/pricing.service'
import { NotFoundError, PreconditionError } from '../../core/errors/domain-errors'
import { SupplierStockService } from '../imports/supplier-stock.service'

/**
 * De offertecalculator.
 *
 * Verzamelt wat de database weet - inkoopstaffel, prijsregel of
 * klantafspraak, drukstaffels, btw-tarief, voorraad - en laat het rekenwerk
 * over aan `calculateQuoteLine` in `@rgh/contracts`. Zo rekent het scherm,
 * straks de offerte-PDF en later de webshop met exact dezelfde som.
 *
 * Deze service slaat niets op. Een calculatie is een vraag, geen handeling.
 */
@Injectable()
export class CalculatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly stock: SupplierStockService,
  ) {}

  async calculate(input: CalculateQuoteLine): Promise<QuoteLineCalculation> {
    const waarschuwingen: string[] = []

    const product = await this.prisma.db.product.findUnique({
      where: { id: input.productId },
      select: { id: true, name: true, articleNumber: true, isActive: true },
    })
    if (!product) throw new NotFoundError('Dit product bestaat niet.')
    if (!product.isActive) {
      waarschuwingen.push('Dit product staat op inactief. Controleer of het nog leverbaar is.')
    }

    // De prijsengine kiest de inkoopstaffel, de prijsregel of de
    // klantafspraak, en weigert als er geen prijs te bepalen is.
    const prijs = await this.pricing.resolveUnitPrice({
      productId: input.productId,
      quantity: input.quantity,
      customerId: input.customerId ?? null,
      productSupplierId: input.productSupplierId ?? null,
    })

    if (prijs.purchasePrice.isZero()) {
      waarschuwingen.push(
        'De inkoopprijs van dit product staat op nul. Draai een prijsimport, anders klopt de ' +
          'marge niet.',
      )
    }
    if (prijs.belowCost) {
      waarschuwingen.push('De berekende verkoopprijs ligt onder de inkoopprijs.')
    }

    const posities = await this.drukposities(input, waarschuwingen)
    const btw = await this.btwTarief()

    await this.controleerVoorraad(input, waarschuwingen)

    const uitkomst = calculateQuoteLine({
      quantity: input.quantity,
      unitPurchasePrice: prijs.purchasePrice,
      unitSalePrice: prijs.unitPrice,
      priceOrigin: prijs.source,
      manualUnitSalePrice: input.manualUnitSalePrice ?? null,
      discountPercent: input.discountPercent,
      otherSetupCost: input.otherSetupCost,
      vatRate: btw.percentage,
      vatRegime: input.vatRegime,
      printPositions: posities,
    })

    return {
      productId: product.id,
      productName: product.name,
      articleNumber: product.articleNumber,
      quantity: input.quantity,
      supplierName: prijs.supplierName,
      purchaseTierMinQuantity: prijs.tierMinQuantity,
      unitPurchasePrice: prijs.purchasePrice.toFixed(4),
      unitSalePrice: (uitkomst.priceOrigin === 'MANUAL'
        ? uitkomst.effectiveUnitPrice
        : uitkomst.calculatedUnitSalePrice
      ).toFixed(4),
      effectiveUnitPrice: uitkomst.effectiveUnitPrice.toFixed(4),
      calculatedUnitSalePrice: uitkomst.calculatedUnitSalePrice.toFixed(4),
      priceOrigin: uitkomst.priceOrigin,
      priceOriginLabel: this.herkomst(uitkomst.priceOrigin, prijs),
      discountPercent: String(input.discountPercent ?? 0),
      vatRate: btw.percentage,
      vatRegime: input.vatRegime,
      printPositions: uitkomst.printPositions.map((p) => ({
        positionName: p.positionName,
        methodName: p.methodName,
        colors: p.colors,
        unitPurchaseCost: p.unitPurchaseCost.toFixed(4),
        setupPurchaseCost: p.setupPurchaseCost.toFixed(4),
        marginPercent: p.marginPercent.toFixed(2),
        unitSalePrice: p.unitSalePrice.toFixed(4),
        setupSaleCost: p.setupSaleCost.toFixed(4),
      })),
      setupTotal: uitkomst.setupTotal.toFixed(2),
      subtotalExclVat: uitkomst.subtotalExclVat.toFixed(2),
      vatAmount: uitkomst.vatAmount.toFixed(2),
      totalInclVat: uitkomst.totalInclVat.toFixed(2),
      purchaseTotal: uitkomst.purchaseTotal.toFixed(2),
      marginAmount: uitkomst.marginAmount.toFixed(2),
      marginPercent: uitkomst.marginPercent.toFixed(2),
      belowCost: uitkomst.belowCost,
      warnings: waarschuwingen,
    }
  }

  /**
   * De gekozen bedrukkingen met hun inkoopprijs uit de drukstaffel.
   *
   * De staffel hangt aan de combinatie van bedrukoptie, aantal kleuren en
   * aantal stuks. Is er geen staffel voor die combinatie, dan wordt er niet
   * geraden: de bedrukking komt zonder prijs in de uitkomst met een
   * waarschuwing erbij, want een offerte met een verzonnen drukprijs is erger
   * dan een offerte waarbij staat dat de prijs ontbreekt.
   */
  private async drukposities(
    input: CalculateQuoteLine,
    waarschuwingen: string[],
  ): Promise<PrintPositionInput[]> {
    if (input.printOptionIds.length === 0) return []

    const opties = await this.prisma.db.productPrintOption.findMany({
      where: { id: { in: input.printOptionIds }, productId: input.productId },
      include: {
        printMethod: { select: { name: true } },
        printPosition: { select: { name: true } },
        priceTiers: true,
      },
    })

    const posities: PrintPositionInput[] = []
    for (const [index, optieId] of input.printOptionIds.entries()) {
      const optie = opties.find((o) => o.id === optieId)
      if (!optie) {
        throw new PreconditionError(
          'Een gekozen bedrukoptie hoort niet bij dit product.',
        )
      }

      const kleuren = input.printColors[index] ?? 1
      if (optie.maxColors > 0 && kleuren > optie.maxColors) {
        throw new PreconditionError(
          `${optie.printMethod.name} op ${optie.printPosition.name} kan hoogstens ` +
            `${optie.maxColors} ${optie.maxColors === 1 ? 'kleur' : 'kleuren'}.`,
        )
      }

      // Eerst de staffels voor dit aantal kleuren; daarbinnen het aantal stuks.
      const voorKleuren = optie.priceTiers.filter((t) => t.colors === kleuren)
      const staffel = selectTier(
        voorKleuren.map((t) => ({
          minQuantity: t.minQuantity,
          unitPrice: t.unitPrice.toString(),
          setupCost: t.setupCost.toString(),
        })),
        input.quantity,
      )

      if (!staffel) {
        waarschuwingen.push(
          `Voor ${optie.printMethod.name} op ${optie.printPosition.name} met ${kleuren} ` +
            `${kleuren === 1 ? 'kleur' : 'kleuren'} is geen drukstaffel bij ${input.quantity} ` +
            'stuks. De bedrukking staat op nul; vul de prijs met de hand in.',
        )
      }

      posities.push({
        positionName: optie.printPosition.name,
        methodName: optie.printMethod.name,
        colors: kleuren,
        unitPurchaseCost: staffel?.unitPrice ?? '0',
        // De instelkosten van de staffel gaan voor op die van de bedrukoptie.
        setupPurchaseCost: staffel?.setupCost ?? optie.setupCost.toString(),
        marginPercent: input.printMarginPercent ?? null,
      })
    }
    return posities
  }

  /** Het standaard btw-tarief uit de instellingen. */
  private async btwTarief(): Promise<{ code: string; percentage: string }> {
    const instelling = await this.prisma.db.setting.findUnique({ where: { key: 'vat.defaultCode' } })
    const code = typeof instelling?.value === 'string' ? instelling.value : 'NL21'

    const tarief = await this.prisma.db.vatRate.findUnique({ where: { code } })
    if (!tarief) {
      throw new PreconditionError(
        `Het btw-tarief "${code}" uit de instellingen bestaat niet. Controleer Instellingen.`,
      )
    }
    return { code: tarief.code, percentage: tarief.percentage.toString() }
  }

  /**
   * Voorraad is geen blokkade maar een waarschuwing: je kunt offreren wat nog
   * moet komen, als je maar weet dat het zo is.
   */
  private async controleerVoorraad(input: CalculateQuoteLine, waarschuwingen: string[]) {
    const varianten = await this.prisma.db.productVariant.findMany({
      where: input.variantId ? { id: input.variantId } : { productId: input.productId },
      select: { id: true },
    })
    const standen = await this.stock.forVariants(varianten.map((v) => v.id))
    if (standen.size === 0) return

    const totaal = [...standen.values()].reduce((som, s) => som + s.quantity, 0)
    if (totaal < input.quantity) {
      const laatste = [...standen.values()].sort(
        (a, b) => b.fetchedAt.getTime() - a.fetchedAt.getTime(),
      )[0]
      const komt = [...standen.values()]
        .filter((s) => s.firstArrivalDate && s.firstArrivalQuantity)
        .sort((a, b) => a.firstArrivalDate!.getTime() - b.firstArrivalDate!.getTime())[0]

      waarschuwingen.push(
        `Er is ${totaal} op voorraad bij de leverancier en er wordt ${input.quantity} gevraagd ` +
          `(stand van ${laatste.fetchedAt.toLocaleString('nl-NL')})` +
          (komt
            ? `. Er komt ${komt.firstArrivalQuantity} bij op ${komt.firstArrivalDate!.toLocaleDateString('nl-NL')}.`
            : '.'),
      )
    }
  }

  private herkomst(
    origin: 'RULE' | 'AGREEMENT' | 'MANUAL',
    prijs: { source: 'RULE' | 'AGREEMENT' },
  ): string {
    if (origin === 'MANUAL') {
      return prijs.source === 'AGREEMENT'
        ? 'Handmatig ingevoerd, in plaats van de klantprijsafspraak'
        : 'Handmatig ingevoerd, in plaats van de prijsregel'
    }
    return origin === 'AGREEMENT'
      ? 'Klantprijsafspraak; die gaat voor op elke prijsregel'
      : 'Prijsregel op de inkoopprijs'
  }
}

