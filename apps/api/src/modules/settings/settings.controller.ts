import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  companySettingsSchema, shippingMethodSchema, updateCompanySettingsSchema,
  updateShippingMethodsSchema,
  type UpdateCompanySettings, type UpdateShippingMethods,
} from '@rgh/contracts'
import { RequireLogin, RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { registerSchema, schemaRef } from '../../core/openapi/schema-registry'
import { SettingsService } from './settings.service'

registerSchema('CompanySettings', companySettingsSchema)
registerSchema('ShippingMethod', shippingMethodSchema)

@ApiTags('instellingen')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('quote-tiers')
  @RequireLogin()
  @ApiOperation({
    summary: 'Standaardaantallen voor de staffel in de calculator',
    description: 'Welke aantallen zinvol zijn verschilt per handel, dus is het een instelling.',
  })
  quoteTiers() {
    return this.settings.tierQuantities()
  }

  @Get('shipping-methods')
  @RequireLogin()
  @ApiOperation({
    summary: 'Verzendwijzen met kosten en bijdrage',
    description:
      'Iedereen die is ingelogd mag deze lezen: de calculator heeft ze nodig. Wijzigen vraagt ' +
      'settings:update.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('ShippingMethod') } })
  shippingMethods() {
    return this.settings.shippingMethods()
  }

  @Patch('shipping-methods')
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Verzendwijzen wijzigen',
    description: 'Vervangt de hele lijst. Komt in het auditlog.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('ShippingMethod') } })
  updateShippingMethods(
    @Body(new ZodValidationPipe(updateShippingMethodsSchema)) body: UpdateShippingMethods,
  ) {
    return this.settings.updateShippingMethods(body)
  }

  @Get('company')
  @RequireLogin()
  @ApiOperation({
    summary: 'Bedrijfsgegevens',
    description:
      'Iedereen die is ingelogd mag deze lezen: ze staan op elk document en in de kop van het ' +
      'scherm. Wijzigen vraagt settings:update.',
  })
  @ApiOkResponse({ schema: schemaRef('CompanySettings') })
  company() {
    return this.settings.company()
  }

  @Patch('company')
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Bedrijfsgegevens wijzigen',
    description: 'Komt in het auditlog, want dit raakt elk document dat daarna uitgaat.',
  })
  @ApiOkResponse({ schema: schemaRef('CompanySettings') })
  updateCompany(
    @Body(new ZodValidationPipe(updateCompanySettingsSchema)) body: UpdateCompanySettings,
  ) {
    return this.settings.updateCompany(body)
  }
}
