import { Injectable } from '@nestjs/common'
import {
  calculatePrintPositionCost, calculateQuoteLine, parseSupplierDecimal, selectTier,
  type CalculateQuoteLine, type CalculateTiers, type PrintPositionInput, type PrintPricingType,
  type PrintVarCost, type QuoteLineCalculation, type QuoteTiers,
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

  /**
   * Dezelfde calculatie voor een rij aantallen.
   *
   * Eén onmogelijk aantal houdt de rest niet tegen: bij 50 stuks bestaat een
   * drukstaffel soms niet terwijl 250 prima gaat, en dan hoort de klant
   * gewoon de aantallen te zien die wel kunnen, met bij het ene aantal de
   * reden erbij.
   */
  async calculateTiers(input: CalculateTiers): Promise<QuoteTiers> {
    const aantallen = [...new Set(input.quantities)].sort((a, b) => a - b)

    const rows = []
    for (const quantity of aantallen) {
      try {
        rows.push({
          quantity,
          calculation: await this.calculate({ ...input, quantity }),
          error: null,
        })
      } catch (fout) {
        rows.push({
          quantity,
          calculation: null,
          error: fout instanceof Error ? fout.message : String(fout),
        })
      }
    }
    return { rows }
  }

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

    const posities = await this.drukposities(
      input,
      // Wat er met de hand is ingevuld gaat voor, dan de ingestelde
      // drukmarge, dan de marge die de margeregel het artikel geeft.
      prijs.printMarginPercent ?? prijs.ruleMarginPercent,
      waarschuwingen,
    )
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
      shippingCost: input.shippingCost,
      shippingContribution: input.shippingContribution,
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
      allInUnitPrice: uitkomst.allInUnitPrice.toFixed(4),
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
      shippingCost: uitkomst.shippingCost.toFixed(2),
      shippingContribution: uitkomst.shippingContribution.toFixed(2),
      shippingResult: uitkomst.shippingResult.toFixed(2),
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
    ingesteldeDrukmarge: string | null,
    waarschuwingen: string[],
  ): Promise<PrintPositionInput[]> {
    if (input.printOptionIds.length === 0) return []

    /**
     * Wat er met de hand is ingevuld gaat voor op wat er is ingesteld. Die
     * laatste is de ingestelde drukmarge, of anders de marge die de
     * margeregel het artikel geeft - niet de marge die het artikel werkelijk
     * haalt. Dat verschil telt zodra een klantprijsafspraak of een handmatig
     * bedrag de artikelprijs bepaalt: het drukwerk houdt dan de normale
     * marge in plaats van mee te zakken (ADR-0017).
     *
     * Drie trappen, één plek: anders staat dezelfde voorrang straks ook in
     * het offertescherm.
     */
    const drukmarge =
      input.printMarginPercent !== undefined && input.printMarginPercent !== null
        ? String(input.printMarginPercent)
        : ingesteldeDrukmarge

    const opties = await this.prisma.db.productPrintOption.findMany({
      where: { id: { in: input.printOptionIds }, productId: input.productId },
      include: {
        printMethod: { select: { name: true } },
        printPosition: { select: { name: true } },
        priceTiers: true,
        product: { select: { printManipulationCode: true } },
      },
    })

    // De drukprijslijst van de leverancier van dit product, als die er is.
    const leveranciersprijzen = await this.drukprijslijst(input)

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

      // Eerst de weg van de leverancier: die rekent met een prijsstructuur en
      // niet met vaste staffels, want twee van zijn vijf prijstypes hangen af
      // van het formaat van het logo (ADR-0016).
      const viaLeverancier = await this.drukprijsViaLeverancier(
        optie, kleuren, index, input, leveranciersprijzen, drukmarge, waarschuwingen,
      )
      if (viaLeverancier) {
        posities.push(viaLeverancier)
        continue
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
        marginPercent: drukmarge,
      })
    }
    return posities
  }

  /**
   * De drukprijslijst van de leverancier die dit product levert.
   *
   * Null als er geen koppeling of geen prijslijst is; dan vallen we terug op
   * onze eigen drukstaffels.
   */
  private async drukprijslijst(input: CalculateQuoteLine) {
    const koppeling = await this.prisma.db.productSupplier.findFirst({
      where: {
        productId: input.productId,
        ...(input.productSupplierId ? { id: input.productSupplierId } : { isActive: true }),
      },
      orderBy: [{ isPreferred: 'desc' }, { purchasePrice: 'asc' }],
      select: { supplierId: true },
    })
    if (!koppeling) return null

    const verbinding = await this.prisma.db.supplierConnection.findFirst({
      where: { supplierId: koppeling.supplierId, printTechniques: { some: {} } },
      select: { id: true },
    })
    if (!verbinding) return null

    const [technieken, manipulaties] = await Promise.all([
      this.prisma.db.supplierPrintTechnique.findMany({ where: { connectionId: verbinding.id } }),
      this.prisma.db.supplierPrintManipulation.findMany({ where: { connectionId: verbinding.id } }),
    ])

    return {
      technieken: new Map(technieken.map((t) => [t.code, t])),
      manipulaties: new Map(manipulaties.map((m) => [m.code, m])),
    }
  }

  /**
   * De drukprijs uitrekenen zoals de leverancier hem rekent.
   *
   * Geeft null terug als dat niet kan - geen prijslijst, geen techniekcode -
   * zodat de aanroeper op onze eigen staffels kan terugvallen. Lukt het wel
   * maar ontbreekt er iets dat de gebruiker moet weten, dan komt dat als
   * waarschuwing mee.
   */
  private async drukprijsViaLeverancier(
    optie: {
      supplierTechniqueCode: string | null
      printMethod: { name: string }
      printPosition: { name: string }
      positionLabel: string | null
      product: { printManipulationCode: string | null }
    },
    kleuren: number,
    /** Plaats in de gekozen bedrukkingen; de invoervelden lopen gelijk op. */
    index: number,
    input: CalculateQuoteLine,
    prijslijst: Awaited<ReturnType<CalculatorService['drukprijslijst']>>,
    /** De marge die voor dit drukwerk geldt; null volgt de artikelmarge. */
    drukmarge: string | null,
    waarschuwingen: string[],
  ): Promise<PrintPositionInput | null> {
    if (!prijslijst || !optie.supplierTechniqueCode) return null

    const techniek = prijslijst.technieken.get(optie.supplierTechniqueCode)
    if (!techniek) return null

    const handling = optie.product.printManipulationCode
      ? prijslijst.manipulaties.get(optie.product.printManipulationCode)
      : null

    const positienaam = optie.positionLabel ?? optie.printPosition.name
    // De invoervelden lopen gelijk op met de gekozen bedrukkingen.
    const oppervlak = input.printAreaCm2?.[index] ?? null

    try {
      const uitkomst = calculatePrintPositionCost({
        technique: {
          id: techniek.code,
          pricingType: techniek.pricingType as PrintPricingType,
          setup: techniek.setup?.toString() ?? '0',
          setupRepeat: techniek.setupRepeat?.toString() ?? null,
          nextColourCostIndicator: techniek.nextColourCostIndicator ? 'true' : 'false',
        },
        varCosts: techniek.varCosts as unknown as PrintVarCost[],
        manipulationPrice: handling?.pricePerPiece.toString() ?? null,
        quantity: input.quantity,
        colours: kleuren,
        areaCm2: oppervlak,
      })

      // De berekening geeft het totaal voor deze positie; de calculator werkt
      // per stuk, dus de handling zit al in de inkoopprijs per stuk.
      const perStuk = uitkomst.printCost
        .plus(uitkomst.handlingCost)
        .dividedBy(input.quantity)

      if (techniek.pricingType === 'Area') {
        waarschuwingen.push(
          `${techniek.name} rekent per vierkante centimeter. Die berekening staat niet in de ` +
            'documentatie van midocean en is afgeleid; controleer het bedrag met een echte order.',
        )
      }

      return {
        positionName: positienaam,
        methodName: optie.printMethod.name,
        colors: kleuren,
        unitPurchaseCost: perStuk.toFixed(4),
        setupPurchaseCost: uitkomst.setupCost.toFixed(4),
        marginPercent: drukmarge,
      }
    } catch (fout) {
      waarschuwingen.push(
        `De drukprijs van ${optie.printMethod.name} op ${positienaam} kon niet berekend worden: ` +
          `${fout instanceof Error ? fout.message : String(fout)}`,
      )
      return {
        positionName: positienaam,
        methodName: optie.printMethod.name,
        colors: kleuren,
        unitPurchaseCost: '0',
        setupPurchaseCost: '0',
        marginPercent: drukmarge,
      }
    }
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

