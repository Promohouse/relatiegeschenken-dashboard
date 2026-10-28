import { Module } from '@nestjs/common'
import { AppConfigModule } from './core/config/config.module'
import { PrismaModule } from './core/prisma/prisma.module'
import { HealthModule } from './modules/health/health.module'

/**
 * Domeinmodules komen hier één voor één bij. Regel uit CLAUDE.md: een module
 * praat nooit met de tabellen van een andere module, alleen via de
 * geexporteerde service.
 */
@Module({
  imports: [AppConfigModule, PrismaModule, HealthModule],
})
export class AppModule {}
