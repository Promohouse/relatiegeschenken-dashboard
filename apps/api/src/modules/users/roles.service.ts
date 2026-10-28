import { Injectable } from '@nestjs/common'
import type { Prisma } from '@rgh/db'
import type { CreateRole, PermissionGroup, RoleDetail, UpdateRole } from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { ConflictError, NotFoundError, PreconditionError } from '../../core/errors/domain-errors'

/** Zie UsersService: dit recht mag nooit uit het systeem verdwijnen. */
const BEHEERRECHT = 'users:update'

/** Volgorde waarin modules in het scherm staan: van dagelijks werk naar beheer. */
const MODULEVOLGORDE = [
  'dashboard', 'customers', 'quotes', 'orders', 'proofs', 'products',
  'suppliers', 'purchasing', 'documents', 'tasks', 'imports', 'channels',
  'users', 'settings',
]

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Alle rechten, gegroepeerd per module, voor het bewerkscherm. */
  async permissions(): Promise<PermissionGroup[]> {
    const rechten = await this.prisma.db.permission.findMany({ orderBy: [{ module: 'asc' }, { action: 'asc' }] })

    const perModule = new Map<string, PermissionGroup['permissions']>()
    for (const r of rechten) {
      const lijst = perModule.get(r.module) ?? []
      lijst.push({ key: r.key, module: r.module, action: r.action, description: r.description })
      perModule.set(r.module, lijst)
    }

    return [...perModule.entries()]
      .map(([module, permissions]) => ({ module, permissions }))
      .sort((a, b) => {
        const i = MODULEVOLGORDE.indexOf(a.module)
        const j = MODULEVOLGORDE.indexOf(b.module)
        return (i === -1 ? 999 : i) - (j === -1 ? 999 : j) || a.module.localeCompare(b.module)
      })
  }

  async byId(id: string): Promise<RoleDetail> {
    const rol = await this.prisma.db.role.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: { select: { key: true } } } },
        _count: { select: { users: true } },
      },
    })
    if (!rol) throw new NotFoundError('Deze rol bestaat niet.')

    return {
      id: rol.id,
      key: rol.key,
      name: rol.name,
      description: rol.description,
      isSystem: rol.isSystem,
      permissions: rol.permissions.map((p) => p.permission.key).sort(),
      userCount: rol._count.users,
    }
  }

  async create(input: CreateRole): Promise<RoleDetail> {
    if (await this.prisma.unscoped.role.findUnique({ where: { key: input.key } })) {
      throw new ConflictError(`Er bestaat al een rol met de sleutel ${input.key}.`)
    }
    const rechten = await this.zoekRechten(input.permissionKeys)

    const rol = await this.prisma.unscoped.role.create({
      data: {
        key: input.key,
        name: input.name,
        description: input.description ?? null,
        permissions: { create: rechten.map((r) => ({ permissionId: r.id })) },
      },
    })

    await this.audit.record({
      entity: 'Role',
      entityId: rol.id,
      action: 'CREATE',
      diff: {
        key: { van: null, naar: input.key },
        name: { van: null, naar: input.name },
        permissions: { van: null, naar: input.permissionKeys.length },
      },
    })
    return this.byId(rol.id)
  }

  async update(id: string, input: UpdateRole): Promise<RoleDetail> {
    const voor = await this.byId(id)

    await this.prisma.unscoped.$transaction(async (tx) => {
      if (input.name !== undefined || input.description !== undefined) {
        await tx.role.update({
          where: { id },
          data: {
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
          },
        })
      }

      if (input.permissionKeys) {
        const rechten = await this.zoekRechten(input.permissionKeys, tx)
        await tx.rolePermission.deleteMany({ where: { roleId: id } })
        if (rechten.length > 0) {
          await tx.rolePermission.createMany({
            data: rechten.map((r) => ({ roleId: id, permissionId: r.id })),
          })
        }
        await this.beheerMoetBlijven(tx)
      }
    })

    const na = await this.byId(id)
    const verschil: Record<string, { van: unknown; naar: unknown }> = {}
    if (voor.name !== na.name) verschil.name = { van: voor.name, naar: na.name }
    if (voor.description !== na.description) {
      verschil.description = { van: voor.description, naar: na.description }
    }

    const bij = na.permissions.filter((p) => !voor.permissions.includes(p))
    const af = voor.permissions.filter((p) => !na.permissions.includes(p))
    if (bij.length > 0 || af.length > 0) {
      verschil.permissions = { van: af.length ? `-${af.join(', -')}` : null, naar: bij.length ? bij.join(', ') : null }
    }

    if (Object.keys(verschil).length > 0) {
      await this.audit.record({ entity: 'Role', entityId: id, action: 'UPDATE', diff: verschil })
    }
    return na
  }

  /**
   * Verwijderen kan alleen als de rol van niemand is en niet door het systeem
   * is aangemaakt. Anders zou een medewerker ineens rechten kwijt zijn zonder
   * dat iemand het doorheeft.
   */
  async remove(id: string): Promise<void> {
    const rol = await this.byId(id)

    if (rol.isSystem) {
      throw new PreconditionError(
        `"${rol.name}" is een rol van het systeem en kan niet verwijderd worden. ` +
          'Je kunt de rechten wel aanpassen.',
      )
    }
    if (rol.userCount > 0) {
      throw new ConflictError(
        `"${rol.name}" is toegekend aan ${rol.userCount} ` +
          `${rol.userCount === 1 ? 'gebruiker' : 'gebruikers'} en kan niet verwijderd worden. ` +
          'Haal de rol eerst bij hen weg.',
      )
    }

    await this.prisma.unscoped.role.delete({ where: { id } })
    await this.audit.record({
      entity: 'Role',
      entityId: id,
      action: 'DELETE',
      diff: { key: { van: rol.key, naar: null } },
    })
  }

  private async zoekRechten(keys: string[], tx?: Prisma.TransactionClient) {
    const db = tx ?? this.prisma.unscoped
    const rechten = await db.permission.findMany({
      where: { key: { in: keys } },
      select: { id: true, key: true },
    })
    const onbekend = keys.filter((k) => !rechten.some((r) => r.key === k))
    if (onbekend.length > 0) {
      throw new NotFoundError(`Onbekend recht: ${onbekend.join(', ')}.`)
    }
    return rechten
  }

  private async beheerMoetBlijven(tx: Prisma.TransactionClient) {
    const aantal = await tx.user.count({
      where: {
        isActive: true,
        roles: { some: { role: { permissions: { some: { permission: { key: BEHEERRECHT } } } } } },
      },
    })
    if (aantal === 0) {
      throw new PreconditionError(
        'Na deze wijziging zou niemand meer gebruikers kunnen beheren. ' +
          `Zorg dat minstens één actieve gebruiker het recht ${BEHEERRECHT} houdt.`,
      )
    }
  }
}
