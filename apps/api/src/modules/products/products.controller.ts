import { Controller, Get, Query } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { productPickerItemSchema } from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { registerSchema, schemaRef } from '../../core/openapi/schema-registry'
import { ProductsService } from './products.service'

registerSchema('ProductPickerItem', productPickerItemSchema)

const zoekSchema = z.object({
  q: z.string().trim().min(1, 'Vul een zoekterm in').max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

@ApiTags('producten')
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('search')
  @RequirePermission('products:view')
  @ApiOperation({
    summary: 'Producten zoeken op artikelnummer of naam',
    description: 'Voor de productkiezer in formulieren. Volledig productbeheer volgt in Fase 2.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('ProductPickerItem') } })
  search(@Query(new ZodValidationPipe(zoekSchema)) query: z.infer<typeof zoekSchema>) {
    return this.products.search(query.q, query.limit)
  }
}
