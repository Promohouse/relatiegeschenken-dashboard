import { Injectable } from '@nestjs/common'
import type { ProductPickerItem } from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { NotFoundError } from '../../core/errors/domain-errors'

/**
 * Het begin van de productmodule: alleen opzoeken.
 *
 * Volledig productbeheer is Fase 2. Deze service bestaat nu al omdat andere
 * modules productnamen nodig hebben - prijsafspraken bijvoorbeeld - en harde
 * regel 1 zegt dat een module nooit in de tabellen van een andere module
 * kijkt. Dus liever een kleine eigenaar nu, dan een `products`-query in de
 * klantmodule die later weer uitgehaald moet worden.
 */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Zoeken op artikelnummer of naam, voor een productkiezer in een formulier. */
  async search(query: string, limit = 20): Promise<ProductPickerItem[]> {
    const rijen = await this.prisma.db.product.findMany({
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
    return rijen
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
}
