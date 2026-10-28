import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'
import { ForbiddenError, UnauthorizedError } from '../errors/domain-errors'
import { AuthService } from './auth.service'
import { PERMISSIONS_KEY, PUBLIC_KEY } from './auth.decorators'

/**
 * Rechten worden op de backend gecontroleerd (harde regel 4). De frontend
 * verbergt alleen; deze guard beslist.
 *
 * Sluit dicht bij twijfel: een route zonder `@Public()` en zonder
 * `@RequirePermission()` wordt geweigerd. Beveiliging vergeten moet opvallen,
 * niet stilletjes doorglippen.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') return true

    const doelen = [context.getHandler(), context.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, doelen)) return true

    const vereist = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, doelen)
    if (!vereist || vereist.length === 0) {
      throw new ForbiddenError(
        'Deze route heeft geen permissie gedeclareerd. Voeg @RequirePermission(...) toe, ' +
          'of @Public() als hij bewust open is.',
      )
    }

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user
    if (!user) throw new UnauthorizedError('Log in om verder te gaan.')

    const aanwezig = await this.auth.permissionsFor(user.id)
    const ontbreekt = vereist.filter((p) => !aanwezig.has(p))

    if (ontbreekt.length > 0) {
      throw new ForbiddenError(
        `Je hebt niet het recht ${ontbreekt.join(' en ')} dat voor deze handeling nodig is.`,
      )
    }
    return true
  }
}
