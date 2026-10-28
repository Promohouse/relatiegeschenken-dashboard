import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AppConfigModule } from './core/config/config.module'
import { CoreModule } from './core/core.module'
import { RequestContextMiddleware } from './core/context/request-context.middleware'
import { PrismaModule } from './core/prisma/prisma.module'
import { HealthModule } from './modules/health/health.module'

/**
 * Domeinmodules komen hier één voor één bij. Regel uit CLAUDE.md: een module
 * praat nooit met de tabellen van een andere module, alleen via de
 * geexporteerde service.
 */
@Module({
  imports: [AppConfigModule, PrismaModule, CoreModule, HealthModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Op alle routes: zonder verzoekcontext weet het auditlog niet wie wat deed.
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}
