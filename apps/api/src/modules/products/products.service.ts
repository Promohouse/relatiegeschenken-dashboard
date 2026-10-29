import { Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import type {
  ListProductsQuery, PaginatedProducts, ProductDetail, ProductPickerItem, ProductSummary,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { NotFoundError } from '../../core/errors/domain-errors'
import { SupplierStockService } from '../imports/supplier-stock.service'

/**
 * De productcatalogus: opzoeken, doorbladeren en bekijken.
 *
 * Producten komen voorlopig uit imports; handmatig aanmaken en wijzigen volgt
 * later. Deze service leest dus alleen - wat er in de catalogus verandert
 * loopt via de importpijplijn en de beoordeling daarvan (ADR-0004).
 *
 * Harde regel 1: andere modules die een productnaam nodig hebben gaan hier
 * langs en niet via de `products`-tabel.
 */
@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly stock: SupplierStockService,
  ) {}

  async list(query: ListProductsQuery): Promise<PaginatedProducts> {
    const where: Prisma.ProductWhereInput = {}

    if (query.status !== 'all') where.isActive = query.status === 'active'
    if (query.supplier) {
      where.suppliers = { some: { supplier: { code: query.supplier } } }
    }
    if (query.search) {
      const zoek = query.search
      where.OR = [
        { articleNumber: { contains: zoek, mode: 'insensitive' } },
        { name: { contains: zoek, mode: 'insensitive' } },
        { brand: { contains: zoek, mode: 'insensitive' } },
        { variants: { some: { sku: { contains: zoek, mode: 'insensitive' } } } },
        { suppliers: { some: { supplierArticleNumber: { contains: zoek, mode: 'insensitive' } } } },
      ]
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput =
      query.sort === 'articleNumber'
        ? { articleNumber: query.direction }
        : query.sort === 'updatedAt'
          ? { updatedAt: query.direction }
          : { name: query.direction }

    const [rijen, total] = await Promise.all([
      this.prisma.db.product.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          category: { select: { name: true } },
          _count: { select: { variants: true } },
          suppliers: {
            orderBy: [{ isPreferred: 'desc' }, { purchasePrice: 'asc' }],
            take: 1,
            include: { supplier: { select: { name: true } } },
          },
        },
      }),
      this.prisma.db.product.count({ where }),
    ])

    const voorraad = await this.stock.totalsForProducts(rijen.map((p) => p.id))

    return {
      items: rijen.map((p) => this.naarSamenvatting(p, voorraad.get(p.id) ?? null)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async byId(id: string): Promise<ProductDetail> {
    const product = await this.prisma.db.product.findUnique({
      where: { id },
      include: {
        category: { select: { name: true } },
        _count: { select: { variants: true } },
        variants: { orderBy: { sku: 'asc' } },
        suppliers: {
          orderBy: [{ isPreferred: 'desc' }, { purchasePrice: 'asc' }],
          include: {
            supplier: { select: { name: true, code: true } },
            purchaseTiers: { orderBy: { minQuantity: 'asc' } },
          },
        },
        printOptions: {
          include: {
            printMethod: { select: { name: true } },
            printPosition: { select: { name: true } },
          },
        },
        salesTiers: { orderBy: { minQuantity: 'asc' } },
      },
    })
    if (!product) throw new NotFoundError('Dit product bestaat niet.')

    const voorraad = await this.stock.forVariants(product.variants.map((v) => v.id))
    const totaal = [...voorraad.values()].reduce((som, s) => som + s.quantity, 0)

    return {
      ...this.naarSamenvatting(product, voorraad.size > 0 ? totaal : null),
      description: product.description,
      material: product.material,
      dimensions: product.dimensions,
      countryOfOrigin: product.countryOfOrigin,
      commodityCode: product.commodityCode,
      printable: product.printable,
      createdAt: product.createdAt.toISOString(),
      updatedAt: product.updatedAt.toISOString(),
      variants: product.variants.map((v) => ({
        id: v.id,
        sku: v.sku,
        colorName: v.colorName,
        colorCode: v.colorCode,
        colorGroup: v.colorGroup,
        pmsColor: v.pmsColor,
        size: v.size,
        eanCode: v.eanCode,
        isActive: v.isActive,
        stock: this.naarVoorraad(voorraad.get(v.id)),
      })),
      suppliers: product.suppliers.map((s) => ({
        id: s.id,
        supplierName: s.supplier.name,
        supplierCode: s.supplier.code,
        supplierArticleNumber: s.supplierArticleNumber,
        purchasePrice: s.purchasePrice.toString(),
        currency: s.currency,
        minimumOrderQuantity: s.minimumOrderQuantity,
        leadTimeDays: s.leadTimeDays,
        isPreferred: s.isPreferred,
        isActive: s.isActive,
        tiers: s.purchaseTiers.map((t) => ({
          minQuantity: t.minQuantity,
          unitPrice: t.unitPrice.toString(),
        })),
      })),
      printOptions: product.printOptions.map((o) => ({
        id: o.id,
        printMethodName: o.printMethod.name,
        printPositionName: o.printPosition.name,
        supplierLabel: o.positionLabel,
        maxColors: o.maxColors,
        printArea: o.printArea,
        maxPrintWidthMm: o.maxPrintWidthMm?.toString() ?? null,
        maxPrintHeightMm: o.maxPrintHeightMm?.toString() ?? null,
        setupCost: o.setupCost.toString(),
      })),
      salesTiers: product.salesTiers.map((t) => ({
        minQuantity: t.minQuantity,
        unitPrice: t.unitPrice.toString(),
      })),
    }
  }

  /** Zoeken op artikelnummer of naam, voor een productkiezer in een formulier. */
  async search(query: string, limit = 20): Promise<ProductPickerItem[]> {
    return this.prisma.db.product.findMany({
      where: {
        OR: [
          { articleNumber: { contains: query, mode: 'insensitive' } },
          { name: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      take: Math.min(limit, 50),
      select: { id: true, articleNumber: true, name: true, isActive: true },
    })
  }

  /**
   * Bestaat dit product, en hoe heet het? Geeft een domeinfout als het niet
   * bestaat, zodat de aanroeper geen eigen melding hoeft te verzinnen.
   */
  async summary(id: string): Promise<ProductPickerItem> {
    const product = await this.prisma.db.product.findUnique({
      where: { id },
      select: { id: true, articleNumber: true, name: true, isActive: true },
    })
    if (!product) throw new NotFoundError('Dit product bestaat niet.')
    return product
  }

  /** Null blijft null: niet bekend is iets anders dan nul op voorraad. */
  private naarVoorraad(stand: {
    quantity: number
    fetchedAt: Date
    firstArrivalDate: Date | null
    firstArrivalQuantity: number | null
    nextArrivalDate: Date | null
    nextArrivalQuantity: number | null
  } | undefined) {
    if (!stand) return null
    return {
      quantity: stand.quantity,
      fetchedAt: stand.fetchedAt.toISOString(),
      firstArrivalDate: stand.firstArrivalDate?.toISOString() ?? null,
      firstArrivalQuantity: stand.firstArrivalQuantity,
      nextArrivalDate: stand.nextArrivalDate?.toISOString() ?? null,
      nextArrivalQuantity: stand.nextArrivalQuantity,
    }
  }

  private naarSamenvatting(product: {
    id: string
    articleNumber: string
    name: string
    brand: string | null
    isActive: boolean
    isDemo: boolean
    category: { name: string } | null
    _count: { variants: number }
    suppliers: {
      supplierArticleNumber: string
      purchasePrice: { toString(): string }
      currency: string
      supplier: { name: string }
    }[]
  }, stockQuantity: number | null): ProductSummary {
    const voorkeur = product.suppliers[0]
    return {
      id: product.id,
      articleNumber: product.articleNumber,
      name: product.name,
      brand: product.brand,
      categoryName: product.category?.name ?? null,
      isActive: product.isActive,
      isDemo: product.isDemo,
      variantCount: product._count.variants,
      supplierName: voorkeur?.supplier.name ?? null,
      supplierArticleNumber: voorkeur?.supplierArticleNumber ?? null,
      purchasePrice: voorkeur?.purchasePrice.toString() ?? null,
      currency: voorkeur?.currency ?? null,
      stockQuantity,
    }
  }
}
