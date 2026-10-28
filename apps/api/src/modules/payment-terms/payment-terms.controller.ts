import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post,
} from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createPaymentTermSchema, updatePaymentTermSchema,
  type CreatePaymentTerm, type UpdatePaymentTerm,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { PaymentTermsService } from './payment-terms.service'
import './payment-terms.schema'

/**
 * Betalingsvoorwaarden zijn een instelling: ze gelden voor alle klanten en
 * raken de boekhouding. Daarom `settings:*` en niet `customers:*` - wie een
 * klant mag wijzigen hoeft niet te kunnen bepalen wanneer facturen vervallen.
 */
@ApiTags('instellingen')
@Controller('payment-terms')
export class PaymentTermsController {
  constructor(private readonly terms: PaymentTermsService) {}

  @Get()
  @RequirePermission('settings:view')
  @ApiOperation({ summary: 'Betalingsvoorwaarden, met het aantal klanten per voorwaarde' })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('PaymentTerm') } })
  list() {
    return this.terms.list()
  }

  /**
   * Voor de keuzelijst in het klantformulier. Staat onder `customers:view` en
   * niet onder `settings:view`: een verkoper moet een voorwaarde kunnen kiezen
   * zonder de instellingen te mogen wijzigen. Daarom ook minder gegevens:
   * geen aantallen, en alleen wat te kiezen is.
   *
   * Vóór `:id` gedeclareerd, anders vangt die route dit pad af.
   */
  @Get('selectable')
  @RequirePermission('customers:view')
  @ApiOperation({ summary: 'Kiesbare betalingsvoorwaarden, voor een keuzelijst' })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('PaymentTerm') } })
  selectable() {
    return this.terms.selectable()
  }

  @Get(':id')
  @RequirePermission('settings:view')
  @ApiOperation({ summary: 'Eén betalingsvoorwaarde' })
  @ApiOkResponse({ schema: schemaRef('PaymentTerm') })
  byId(@Param('id') id: string) {
    return this.terms.byId(id)
  }

  @Post()
  @RequirePermission('settings:update')
  @ApiOperation({ summary: 'Betalingsvoorwaarde aanmaken' })
  @ApiCreatedResponse({ schema: schemaRef('PaymentTerm') })
  create(@Body(new ZodValidationPipe(createPaymentTermSchema)) body: CreatePaymentTerm) {
    return this.terms.create(body)
  }

  @Patch(':id')
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Betalingsvoorwaarde wijzigen',
    description:
      'De sleutel wijzigt niet. Een nieuwe standaard aanwijzen haalt de standaard automatisch ' +
      'bij de vorige weg; er is altijd precies één standaard.',
  })
  @ApiOkResponse({ schema: schemaRef('PaymentTerm') })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePaymentTermSchema)) body: UpdatePaymentTerm,
  ) {
    return this.terms.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Betalingsvoorwaarde verwijderen',
    description: 'Alleen als geen enkele klant hem heeft en het niet de standaard is.',
  })
  remove(@Param('id') id: string) {
    return this.terms.remove(id)
  }
}
