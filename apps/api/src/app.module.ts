import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common'
import { AppConfigModule } from './core/config/config.module'
import { AuthModule } from './core/auth/auth.module'
import { ConnectorsModule } from './core/connectors/connectors.module'
import { CoreModule } from './core/core.module'
import { RequestContextMiddleware } from './core/context/request-context.middleware'
import { PrismaModule } from './core/prisma/prisma.module'
import { CustomersModule } from './modules/customers/customers.module'
import { HealthModule } from './modules/health/health.module'
import { ImportsModule } from './modules/imports/imports.module'
import { MeModule } from './modules/me/me.module'
import { PaymentTermsModule } from './modules/payment-terms/payment-terms.module'
import { ProductsModule } from './modules/products/products.module'
import { QuotesModule } from './modules/quotes/quotes.module'
import { SettingsModule } from './modules/settings/settings.module'
import { UsersModule } from './modules/users/users.module'

/**
 * Domeinmodules komen hier één voor één bij. Regel uit CLAUDE.md: een module
 * praat nooit met de tabellen van een andere module, alleen via de
 * geexporteerde service.
 */
@Module({
  imports: [AppConfigModule, PrismaModule, AuthModule, CoreModule, ConnectorsModule, HealthModule, MeModule, CustomersModule, UsersModule, PaymentTermsModule, ProductsModule, ImportsModule, QuotesModule, SettingsModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Op alle routes: zonder verzoekcontext weet het auditlog niet wie wat deed.
    consumer.apply(RequestContextMiddleware).forRoutes('*splat')
  }
}
