import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createPriceRuleSchema, updatePriceRuleSchema,
  type CreatePriceRule, type UpdatePriceRule,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { PriceRulesService } from './price-rules.service'
import './price-rules.schema'

/**
 * Margeregels bepalen wat er op elke inkoopprijs komt, voor iedereen of voor
 * één klant. Daarom `settings:*` en niet `customers:*`: wie een klant mag
 * wijzigen hoeft nog niet te mogen bepalen waarmee het bedrijf verdient.
 */
@ApiTags('instellingen')
@Controller('price-rules')
export class PriceRulesController {
  constructor(private readonly rules: PriceRulesService) {}

  @Get()
  @RequirePermission('settings:view')
  @ApiOperation({ summary: 'Margeregels, met de standaardregel vooraan' })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('PriceRule') } })
  list(@Query('customerId') customerId?: string) {
    return this.rules.list(customerId ? { customerId } : undefined)
  }

  @Get(':id')
  @RequirePermission('settings:view')
  @ApiOperation({ summary: 'Eén margeregel' })
  @ApiOkResponse({ schema: schemaRef('PriceRule') })
  byId(@Param('id') id: string) {
    return this.rules.byId(id)
  }

  @Post()
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Margeregel aanmaken',
    description:
      'De marge is een percentage van de verkoopprijs, niet een opslag op de inkoop. Een lege ' +
      'drukmarge betekent: drukwerk volgt de marge op het artikel.',
  })
  @ApiCreatedResponse({ schema: schemaRef('PriceRule') })
  create(@Body(new ZodValidationPipe(createPriceRuleSchema)) body: CreatePriceRule) {
    return this.rules.create(body)
  }

  @Patch(':id')
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Margeregel wijzigen',
    description: 'Het bereik en het doel liggen vast; die omzetten maakt er een andere regel van.',
  })
  @ApiOkResponse({ schema: schemaRef('PriceRule') })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updatePriceRuleSchema)) body: UpdatePriceRule,
  ) {
    return this.rules.update(id, body)
  }

  @Patch(':id/deactivate')
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Margeregel op inactief zetten',
    description:
      'Een regel wordt niet verwijderd: prijzen moeten navraagbaar blijven en de auditlog ' +
      'verwijst ernaar.',
  })
  @ApiOkResponse({ schema: schemaRef('PriceRule') })
  deactivate(@Param('id') id: string) {
    return this.rules.deactivate(id)
  }
}
