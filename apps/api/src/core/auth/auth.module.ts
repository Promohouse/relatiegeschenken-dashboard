import { Global, Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { AppConfig } from '../config/config.service'
import { PrismaService } from '../prisma/prisma.service'
import { createAuth } from './auth.config'
import { AuthService } from './auth.service'
import { AUTH } from './auth.tokens'
import { SessionGuard } from './session.guard'
import { PermissionsGuard } from './permissions.guard'

/**
 * Identiteit komt van better-auth, autorisatie is van ons (ADR-0012).
 *
 * De volgorde van de guards telt: eerst vaststellen wie het is, dan of die
 * persoon dit mag.
 */
@Global()
@Module({
  providers: [
    {
      provide: AUTH,
      inject: [AppConfig, PrismaService],
      useFactory: (config: AppConfig, prisma: PrismaService) =>
        createAuth(prisma.unscoped, {
          secret: config.env.AUTH_SECRET,
          baseURL: config.env.API_BASE_URL,
          issuer: config.env.MFA_ISSUER,
        }),
    },
    AuthService,
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
  exports: [AUTH, AuthService],
})
export class AuthModule {}
