import { Inject, Injectable } from '@nestjs/common'
import { fromNodeHeaders } from 'better-auth/node'
import type { IncomingHttpHeaders } from 'node:http'
import { PrismaService } from '../prisma/prisma.service'
import { AUTH } from './auth.tokens'
import type { Auth } from './auth.config'

export interface ActiveUser {
  id: string
  email: string
  name: string
  isActive: boolean
  /** Gevuld bij een klantgebruiker; leeg bij een medewerker. */
  customerId: string | null
  twoFactorEnabled: boolean
}

@Injectable()
export class AuthService {
  constructor(
    @Inject(AUTH) private readonly auth: Auth,
    private readonly prisma: PrismaService,
  ) {}

  /** De ingelogde gebruiker, of null. Leest de sessiecookie uit de headers. */
  async userFromHeaders(headers: IncomingHttpHeaders): Promise<ActiveUser | null> {
    const sessie = await this.auth.api.getSession({ headers: fromNodeHeaders(headers) })
    if (!sessie?.user?.id) return null

    // De sessie van better-auth kent onze domeinvelden niet; die halen we er
    // los bij. Bewust de onbegrensde client: op dit moment is de klantscope
    // nog niet bekend, want die komt juist uit dit record.
    const user = await this.prisma.unscoped.user.findUnique({
      where: { id: sessie.user.id },
      select: {
        id: true, email: true, name: true, isActive: true,
        customerId: true, twoFactorEnabled: true,
      },
    })
    if (!user) return null

    return { ...user, twoFactorEnabled: user.twoFactorEnabled ?? false }
  }

  /**
   * Alle permissies van een gebruiker, uit zijn rollen. Permissies staan in de
   * database, dus rechten zijn te wijzigen zonder code-release.
   */
  async permissionsFor(userId: string): Promise<Set<string>> {
    const rijen = await this.prisma.unscoped.userRole.findMany({
      where: { userId },
      select: { role: { select: { permissions: { select: { permission: { select: { key: true } } } } } } },
    })

    const sleutels = new Set<string>()
    for (const rij of rijen) {
      for (const rp of rij.role.permissions) sleutels.add(rp.permission.key)
    }
    return sleutels
  }
}
