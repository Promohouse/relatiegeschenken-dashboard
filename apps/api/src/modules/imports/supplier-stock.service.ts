import { Injectable } from '@nestjs/common'
import { PrismaService } from '../../core/prisma/prisma.service'

export interface VariantStock {
  quantity: number
  /** Wanneer deze stand is opgehaald; bij voorraad is dat het halve verhaal. */
  fetchedAt: Date
  firstArrivalDate: Date | null
  firstArrivalQuantity: number | null
  nextArrivalDate: Date | null
  nextArrivalQuantity: number | null
}

/**
 * Voorraadstanden van leveranciers uitlezen.
 *
 * `supplier_stock` hoort bij de importmodule: die vult hem. Andere modules
 * lezen hier, niet in de tabel (harde regel 1). Dat is niet alleen
 * boekhouding: zo staat op één plek dat een stand bij een tijdstip hoort en
 * dat een leverancier meerdere koppelingen kan hebben.
 */
@Injectable()
export class SupplierStockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * De laatst bekende stand per variant.
   *
   * Levert een leverancier via meer dan één koppeling voorraad voor dezelfde
   * variant, dan wint de meest recente meting. Een stand optellen over
   * koppelingen zou dubbeltellen.
   */
  async forVariants(variantIds: string[]): Promise<Map<string, VariantStock>> {
    if (variantIds.length === 0) return new Map()

    const rijen = await this.prisma.db.supplierStock.findMany({
      where: { variantId: { in: variantIds } },
      orderBy: { fetchedAt: 'desc' },
    })

    const perVariant = new Map<string, VariantStock>()
    for (const rij of rijen) {
      if (!rij.variantId || perVariant.has(rij.variantId)) continue
      perVariant.set(rij.variantId, {
        quantity: rij.quantity,
        fetchedAt: rij.fetchedAt,
        firstArrivalDate: rij.firstArrivalDate,
        firstArrivalQuantity: rij.firstArrivalQuantity,
        nextArrivalDate: rij.nextArrivalDate,
        nextArrivalQuantity: rij.nextArrivalQuantity,
      })
    }
    return perVariant
  }

  /** Totale voorraad per product, voor een overzicht. Null als niets bekend is. */
  async totalsForProducts(productIds: string[]): Promise<Map<string, number>> {
    if (productIds.length === 0) return new Map()

    const rijen = await this.prisma.db.supplierStock.findMany({
      where: { variant: { productId: { in: productIds } } },
      select: { quantity: true, fetchedAt: true, variant: { select: { productId: true, id: true } } },
      orderBy: { fetchedAt: 'desc' },
    })

    const gezien = new Set<string>()
    const totalen = new Map<string, number>()
    for (const rij of rijen) {
      const variantId = rij.variant?.id
      const productId = rij.variant?.productId
      if (!variantId || !productId || gezien.has(variantId)) continue
      gezien.add(variantId)
      totalen.set(productId, (totalen.get(productId) ?? 0) + rij.quantity)
    }
    return totalen
  }
}
