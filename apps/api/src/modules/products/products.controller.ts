import { Controller, Get, Param, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { listProductsQuerySchema, type ListProductsQuery } from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { ProductsService } from './products.service'
import './products.schema'

const zoekSchema = z.object({
  q: z.string().trim().min(1, 'Vul een zoekterm in').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

/**
 * De catalogus is voorlopig alleen te lezen. Wat erin verandert loopt via de
 * importpijplijn, met een beoordeling vooraf; handmatig aanmaken en wijzigen
 * volgt later.
 */
@ApiTags('producten')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  @RequirePermission('products:view')
  @ApiOperation({
    summary: 'Producten doorbladeren',
    description:
      'Zoekt op artikelnummer, naam, merk, variantnummer en leveranciersartikelnummer. ' +
      'Filteren op status en leverancier, sorteren en pagineren.',
  })
  @ApiOkResponse({ schema: schemaRef('ProductPage') })
  list(@Query(new ZodValidationPipe(listProductsQuerySchema)) query: ListProductsQuery) {
    return this.products.list(query)
  }

  @Get('search')
  @RequirePermission('products:view')
  @ApiOperation({
    summary: 'Producten zoeken op artikelnummer of naam',
    description: 'Voor de productkiezer in formulieren; een korte lijst zonder paginering.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('ProductPickerItem') } })
  search(@Query(new ZodValidationPipe(zoekSchema)) query: z.infer<typeof zoekSchema>) {
    return this.products.search(query.q, query.limit)
  }

  @Get(':id')
  @RequirePermission('products:view')
  @ApiOperation({
    summary: 'Eén product met varianten, leveranciers en bedrukopties',
  })
  @ApiOkResponse({ schema: schemaRef('ProductDetail') })
  byId(@Param('id') id: string) {
    return this.products.byId(id)
  }
}
