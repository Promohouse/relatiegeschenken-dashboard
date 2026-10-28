import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { z } from 'zod'
import { startImportSchema, type StartImport } from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { ImportsService } from './imports.service'
import { StagedChangesService } from './staged-changes.service'
import './imports.schema'

const lijstQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(25) })

/**
 * Imports vallen onder `imports:*`. Een import starten is niet hetzelfde als
 * producten wijzigen: een proefimport raakt niets en mag door iedereen die
 * imports beheert gedraaid worden, maar het toepassen van wijzigingen is een
 * aparte handeling met een eigen recht.
 */
@ApiTags('imports')
@Controller('imports')
export class ImportsController {
  constructor(
    private readonly imports: ImportsService,
    private readonly beoordeling: StagedChangesService,
  ) {}

  @Get('connections')
  @RequirePermission('imports:view')
  @ApiOperation({
    summary: 'Leverancierskoppelingen met hun capabilities',
    description:
      'Per capability staat erbij of er code is die hem kan uitvoeren. Een capability zonder ' +
      'connector is bewust: hij is gedocumenteerd maar niet gebouwd.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('SupplierConnection') } })
  connections() {
    return this.imports.listConnections()
  }

  @Get('runs')
  @RequirePermission('imports:view')
  @ApiOperation({ summary: 'Laatste imports' })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('ImportRun') } })
  runs(@Query(new ZodValidationPipe(lijstQuery)) query: z.infer<typeof lijstQuery>) {
    return this.imports.listRuns(query.limit)
  }

  @Get('runs/:id')
  @RequirePermission('imports:view')
  @ApiOperation({ summary: 'Eén import' })
  @ApiOkResponse({ schema: schemaRef('ImportRun') })
  run(@Param('id') id: string) {
    return this.imports.runById(id)
  }

  @Get('runs/:id/changes')
  @RequirePermission('imports:view')
  @ApiOperation({
    summary: 'Voorgestelde wijzigingen van een import',
    description:
      'Wat deze import zou veranderen. Niets hiervan is toegepast; dat is een aparte handeling ' +
      'na beoordeling (ADR-0004).',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('StagedChange') } })
  changes(@Param('id') id: string) {
    return this.imports.changesFor(id)
  }

  @Post('changes/:id/apply')
  @RequirePermission('imports:update')
  @ApiOperation({
    summary: 'Eén voorgestelde wijziging toepassen',
    description:
      'Dit raakt de catalogus. Geweigerd als het veld sinds de import door iemand anders is ' +
      'gewijzigd, en als de wijziging uit een proefimport komt: die legt de brongegevens niet vast.',
  })
  applyChange(@Param('id') id: string) {
    return this.beoordeling.apply(id)
  }

  @Post('changes/:id/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('imports:update')
  @ApiOperation({
    summary: 'Een voorgestelde wijziging afwijzen',
    description: 'De wijziging blijft bewaard met wie hem afwees; de volgende import stelt hem opnieuw voor.',
  })
  rejectChange(@Param('id') id: string) {
    return this.beoordeling.reject(id)
  }

  @Post('runs/:id/apply')
  @RequirePermission('imports:update')
  @ApiOperation({
    summary: 'Alle openstaande wijzigingen van een import toepassen',
    description:
      'Niet in één transactie: een wijziging die niet meer klopt houdt de rest niet tegen. Wat ' +
      'blijft liggen komt met reden terug.',
  })
  applyRun(@Param('id') id: string) {
    return this.beoordeling.applyRun(id)
  }

  @Post('run')
  @RequirePermission('imports:create')
  @ApiOperation({
    summary: 'Een import starten',
    description:
      'Standaard een proefimport: er wordt opgehaald en vergeleken, maar niets weggeschreven. ' +
      'Zet dryRun op false om de ruwe data vast te leggen; de catalogus wijzigt ook dan pas na ' +
      'beoordeling van de voorgestelde wijzigingen.',
  })
  @ApiCreatedResponse({ schema: schemaRef('ImportRun') })
  start(@Body(new ZodValidationPipe(startImportSchema)) body: StartImport) {
    return this.imports.run(body.connectionKey, body.capability, { dryRun: body.dryRun })
  }
}
