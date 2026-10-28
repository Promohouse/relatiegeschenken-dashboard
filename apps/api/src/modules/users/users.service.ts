import { Inject, Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import type {
  CreateUser, ListUsersQuery, PaginatedUsers, RoleSummary, UpdateUser, UserSummary,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { RequestContext } from '../../core/context/request-context'
import { AUTH } from '../../core/auth/auth.tokens'
import type { Auth } from '../../core/auth/auth.config'
import { ConflictError, NotFoundError, PreconditionError } from '../../core/errors/domain-errors'

/**
 * Het recht dat iemand nodig heeft om gebruikers te beheren. Er moet altijd
 * minstens één actieve gebruiker zijn die dit heeft, anders sluit het systeem
 * zichzelf af en kan niemand er meer bij.
 */
const BEHEERRECHT = 'users:update'

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(AUTH) private readonly auth: Auth,
  ) {}

  async list(query: ListUsersQuery): Promise<PaginatedUsers> {
    const where: Prisma.UserWhereInput = {}
    if (query.status !== 'all') where.isActive = query.status === 'active'
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
      ]
    }

    const [rijen, total] = await Promise.all([
      this.prisma.db.user.findMany({
        where,
        orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: { roles: { include: { role: { select: { key: true, name: true } } } } },
      }),
      this.prisma.db.user.count({ where }),
    ])

    return {
      items: rijen.map((u) => this.naarOverzicht(u)),
      total,
      page: query.page,
      pageSize: query.pageSize,
      pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
    }
  }

  async byId(id: string): Promise<UserSummary> {
    const user = await this.prisma.db.user.findUnique({
      where: { id },
      include: { roles: { include: { role: { select: { key: true, name: true } } } } },
    })
    if (!user) throw new NotFoundError('Deze gebruiker bestaat niet.')
    return this.naarOverzicht(user)
  }

  async roles(): Promise<RoleSummary[]> {
    const rollen = await this.prisma.db.role.findMany({
      orderBy: { name: 'asc' },
      include: { permissions: { include: { permission: { select: { key: true } } } } },
    })
    return rollen.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: r.permissions.map((p) => p.permission.key).sort(),
    }))
  }

  async create(input: CreateUser): Promise<UserSummary> {
    const bestaat = await this.prisma.unscoped.user.findUnique({ where: { email: input.email } })
    if (bestaat) {
      throw new ConflictError(`Er bestaat al een gebruiker met het e-mailadres ${input.email}.`)
    }

    // Eerst de rollen controleren, pas daarna de gebruiker aanmaken. Andersom
    // blijft er bij een onbekende rol een gebruiker zonder rollen achter.
    const rollen = await this.zoekRollen(input.roleKeys)

    // Via better-auth zelf, zodat het wachtwoord gehasht wordt zoals de
    // inlogroute het verwacht. De registratieroute staat naar buiten dicht;
    // deze aanroep gaat er rechtstreeks langs.
    const resultaat = await this.auth.api.signUpEmail({
      body: { email: input.email, password: input.password, name: input.name },
    })
    const userId = resultaat.user.id

    if (rollen.length > 0) {
      await this.prisma.unscoped.userRole.createMany({
        data: rollen.map((r) => ({ userId, roleId: r.id })),
      })
    }

    await this.audit.record({
      entity: 'User',
      entityId: userId,
      action: 'CREATE',
      diff: {
        email: { van: null, naar: input.email },
        name: { van: null, naar: input.name },
        roles: { van: null, naar: input.roleKeys },
      },
    })

    return this.byId(userId)
  }

  async update(id: string, input: UpdateUser): Promise<UserSummary> {
    const voor = await this.byId(id)

    await this.prisma.unscoped.$transaction(async (tx) => {
      if (input.name) await tx.user.update({ where: { id }, data: { name: input.name } })
      if (input.roleKeys) await this.zetRollen(id, input.roleKeys, tx)
      await this.beheerMoetBlijven(tx)
    })

    const na = await this.byId(id)
    const verschil: Record<string, { van: unknown; naar: unknown }> = {}
    if (voor.name !== na.name) verschil.name = { van: voor.name, naar: na.name }
    const voorRollen = voor.roles.map((r) => r.key).sort().join(',')
    const naRollen = na.roles.map((r) => r.key).sort().join(',')
    if (voorRollen !== naRollen) verschil.roles = { van: voorRollen, naar: naRollen }

    if (Object.keys(verschil).length > 0) {
      await this.audit.record({ entity: 'User', entityId: id, action: 'UPDATE', diff: verschil })
    }
    return na
  }

  async setActive(id: string, isActive: boolean): Promise<UserSummary> {
    const voor = await this.byId(id)
    if (voor.isActive === isActive) return voor

    if (!isActive && RequestContext.userId() === id) {
      throw new PreconditionError(
        'Je kunt jezelf niet op inactief zetten. Vraag een collega met beheerrechten om dat te doen.',
      )
    }

    await this.prisma.unscoped.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { isActive } })
      await this.beheerMoetBlijven(tx)
    })

    await this.audit.record({
      entity: 'User',
      entityId: id,
      action: 'UPDATE',
      diff: { isActive: { van: voor.isActive, naar: isActive } },
    })
    return this.byId(id)
  }

  /** Zoekt rollen op sleutel en weigert als er één niet bestaat. */
  private async zoekRollen(roleKeys: string[], tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma.unscoped
    const rollen = await db.role.findMany({
      where: { key: { in: roleKeys } },
      select: { id: true, key: true },
    })

    const onbekend = roleKeys.filter((k) => !rollen.some((r) => r.key === k))
    if (onbekend.length > 0) {
      throw new NotFoundError(`Onbekende rol: ${onbekend.join(', ')}.`)
    }
    return rollen
  }

  /** Vervangt alle rollen van een gebruiker door precies deze. */
  private async zetRollen(userId: string, roleKeys: string[], tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma.unscoped
    const rollen = await this.zoekRollen(roleKeys, tx)

    await db.userRole.deleteMany({ where: { userId } })
    if (rollen.length > 0) {
      await db.userRole.createMany({ data: rollen.map((r) => ({ userId, roleId: r.id })) })
    }
  }

  /**
   * Zonder deze controle kan een beheerder zichzelf en iedereen anders de
   * beheerrechten ontnemen, en dan komt niemand er meer in. De controle
   * draait binnen de transactie, dus de wijziging rolt terug.
   */
  private async beheerMoetBlijven(tx: Prisma.TransactionClient) {
    const aantal = await tx.user.count({
      where: {
        isActive: true,
        roles: {
          some: { role: { permissions: { some: { permission: { key: BEHEERRECHT } } } } },
        },
      },
    })
    if (aantal === 0) {
      throw new PreconditionError(
        'Na deze wijziging zou niemand meer gebruikers kunnen beheren. ' +
          `Zorg dat minstens één actieve gebruiker het recht ${BEHEERRECHT} houdt.`,
      )
    }
  }

  private naarOverzicht(user: {
    id: string; name: string; email: string; isActive: boolean; isDemo: boolean
    twoFactorEnabled: boolean | null; lastLoginAt: Date | null; customerId: string | null
    roles: { role: { key: string; name: string } }[]
  }): UserSummary {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      isActive: user.isActive,
      isDemo: user.isDemo,
      twoFactorEnabled: user.twoFactorEnabled ?? false,
      lastLoginAt: user.lastLoginAt?.toISOString() ?? null,
      customerId: user.customerId,
      roles: user.roles.map((r) => r.role).sort((a, b) => a.name.localeCompare(b.name)),
    }
  }
}
