import { Controller, Get } from '@nestjs/common'
import { Public } from '../../core/auth/auth.decorators'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { AppConfig } from '../../core/config/config.service'
import { PrismaService } from '../../core/prisma/prisma.service'
import { schemaRef } from '../../core/openapi/schema-registry'
import { healthSchema, type Health } from './health.schema'

// Importeren zorgt dat het schema geregistreerd is; de verwijzing hieronder
// wordt pas bij het opbouwen van het document gecontroleerd.
void healthSchema

const startedAt = Date.now()

@ApiTags('systeem')
@Controller('health')
export class HealthController {
  constructor(
    private readonly config: AppConfig,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @ApiOperation({
    summary: 'Gezondheid van de applicatie',
    description:
      'Controleert de databaseverbinding. De Valkey-controle komt erbij zodra de jobqueue bestaat.',
  })
  @ApiOkResponse({ schema: schemaRef('Health') })
  async check(): Promise<Health> {
    let database: Health['database'] = 'ok'
    try {
      await this.prisma.db.$queryRaw`SELECT 1`
    } catch {
      database = 'fout'
    }

    return {
      status: database === 'ok' ? 'ok' : 'degraded',
      version: '0.1.0',
      environment: this.config.env.NODE_ENV,
      uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      database,
      demoMode: this.config.env.DEMO_MODE,
      checkedAt: new Date().toISOString(),
    }
  }
}
