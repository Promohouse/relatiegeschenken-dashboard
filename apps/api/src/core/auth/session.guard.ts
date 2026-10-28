import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ForbiddenError, UnauthorizedError } from '../errors/domain-errors'
import { RequestContext } from '../context/request-context'
import { AuthService, type ActiveUser } from './auth.service'
import { PUBLIC_KEY } from './auth.decorators'

declare module 'express' {
  interface Request {
    user?: ActiveUser
  }
}

/**
 * Stelt vast wie er aanklopt en vult dat in de verzoekcontext, zodat het
 * auditlog en de klantscope het verderop weten.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true

    const publiek = this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (publiek) return true

    const request = context.switchToHttp().getRequest<Request>()
    const user = await this.auth.userFromHeaders(request.headers)

    if (!user) {
      throw new UnauthorizedError('Log in om verder te gaan.')
    }
    if (!user.isActive) {
      throw new ForbiddenError('Dit account is gedeactiveerd. Neem contact op met een beheerder.')
    }

    request.user = user
    RequestContext.setUser({ userId: user.id, customerId: user.customerId })
    return true
  }
}
