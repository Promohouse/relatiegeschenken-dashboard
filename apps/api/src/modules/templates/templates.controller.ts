import { Body, Controller, Get, Param, Patch } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { templateSchema, updateTemplateSchema, type UpdateTemplate } from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { registerSchema, schemaRef } from '../../core/openapi/schema-registry'
import { TemplatesService } from './templates.service'

registerSchema('DocumentTemplate', templateSchema)

@ApiTags('instellingen')
@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  @RequirePermission('settings:view')
  @ApiOperation({
    summary: 'Tekstsjablonen, met de velden die erin mogen',
    description:
      'Per sjabloon komt ook een proefweergave mee: dezelfde tekst met voorbeeldwaarden ' +
      'ingevuld, zodat te zien is wat een klant krijgt.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('DocumentTemplate') } })
  list() {
    return this.templates.list()
  }

  @Get(':key')
  @RequirePermission('settings:view')
  @ApiOperation({ summary: 'Eén sjabloon' })
  @ApiOkResponse({ schema: schemaRef('DocumentTemplate') })
  byKey(@Param('key') key: string) {
    return this.templates.byKey(key)
  }

  @Patch(':key')
  @RequirePermission('settings:update')
  @ApiOperation({
    summary: 'Een sjabloon wijzigen',
    description:
      'Een veld dat niet bij dit soort sjabloon hoort wordt geweigerd met de naam erbij. Dat ' +
      'gebeurt hier en niet bij het versturen: een typefout hoort opgemerkt te worden door wie ' +
      'de tekst schrijft, niet door de klant die hem krijgt.',
  })
  @ApiOkResponse({ schema: schemaRef('DocumentTemplate') })
  update(
    @Param('key') key: string,
    @Body(new ZodValidationPipe(updateTemplateSchema)) body: UpdateTemplate,
  ) {
    return this.templates.update(key, body)
  }
}
