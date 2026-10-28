import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post,
} from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createPriceAgreementSchema, updatePriceAgreementSchema,
  type CreatePriceAgreement, type UpdatePriceAgreement,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { CustomerPricesService } from './customer-prices.service'
import './customers.schema'

/**
 * Prijsafspraken vallen onder de klant, niet onder instellingen: ze gaan over
 * één klantrelatie en worden door verkoop gemaakt.
 */
@ApiTags('klanten')
@Controller('customers/:customerId/prices')
export class CustomerPricesController {
  constructor(private readonly prices: CustomerPricesService) {}

  @Get()
  @RequirePermission('customers:view')
  @ApiOperation({
    summary: 'Prijsafspraken van een klant',
    description:
      'Per afspraak staat erbij of hij vandaag meedoet: een afspraak kan actief staan en toch ' +
      'buiten haar geldigheidsvenster vallen.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('PriceAgreement') } })
  list(@Param('customerId') customerId: string) {
    return this.prices.list(customerId)
  }

  @Post()
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Prijsafspraak toevoegen',
    description:
      'Een afgesproken bedrag per stuk vanaf een aantal. Dit gaat voor op elke prijsregel, ' +
      'ongeacht priority: een toezegging is geen rekenvoorkeur.',
  })
  @ApiCreatedResponse({ schema: schemaRef('PriceAgreement') })
  create(
    @Param('customerId') customerId: string,
    @Body(new ZodValidationPipe(createPriceAgreementSchema)) body: CreatePriceAgreement,
  ) {
    return this.prices.create(customerId, body)
  }

  @Patch(':id')
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Prijsafspraak wijzigen',
    description:
      'Product en drempel liggen vast: samen vormen ze de afspraak. Een andere drempel is een ' +
      'andere afspraak.',
  })
  @ApiOkResponse({ schema: schemaRef('PriceAgreement') })
  update(
    @Param('customerId') customerId: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePriceAgreementSchema)) body: UpdatePriceAgreement,
  ) {
    return this.prices.update(customerId, id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Prijsafspraak verwijderen',
    description:
      'Mag: bestaande offertes en orders hebben hun prijzen al gekopieerd en veranderen hier ' +
      'niet van.',
  })
  remove(@Param('customerId') customerId: string, @Param('id') id: string) {
    return this.prices.remove(customerId, id)
  }
}
