import { Body, Controller, Get, Patch } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  companySettingsSchema, updateCompanySettingsSchema, type UpdateCompanySettings,
} from '@rgh/contracts'
import { RequireLogin, RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { registerSchema, schemaRef } from '../../core/openapi/schema-registry'
import { SettingsService } from './settings.service'

registerSchema('CompanySettings', companySettingsSchema)

@ApiTags('instellingen')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

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
