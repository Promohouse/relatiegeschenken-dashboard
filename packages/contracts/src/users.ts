import { z } from 'zod'
import { verplichteTekst } from './customers'

/**
 * Medewerkers en hun rollen.
 *
 * Rechten horen bij een rol, niet bij een persoon: anders moet je bij elke
 * nieuwe medewerker opnieuw bedenken wat iemand mag.
 */

const emailVeld = () =>
  z
    .string({ error: 'Vul een e-mailadres in' })
    .trim()
    .toLowerCase()
    .regex(/^[^@\s]+@[^@\s]+\.[^@\s]+$/, 'Dit is geen geldig e-mailadres')

export const listUsersQuerySchema = z.object({
  search: z.string().trim().min(1).max(100).optional(),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const createUserSchema = z.object({
  name: verplichteTekst('Vul een naam in', { min: 2 }),
  email: emailVeld(),
  /**
   * Beginwachtwoord. Er is nog geen e-mail, dus een beheerder stelt het in en
   * geeft het veilig door. Twaalf tekens is de ondergrens van de api zelf.
   */
  password: z
    .string({ error: 'Vul een wachtwoord in' })
    .min(12, 'Een wachtwoord is minstens 12 tekens'),
  roleKeys: z.array(z.string()).default([]),
})

export const updateUserSchema = z.object({
  name: verplichteTekst('Vul een naam in', { min: 2 }).optional(),
  roleKeys: z.array(z.string()).optional(),
})

export const roleSummarySchema = z.object({
  id: z.string(),
  key: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  permissions: z.array(z.string()),
})

export const userSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  isActive: z.boolean(),
  isDemo: z.boolean(),
  twoFactorEnabled: z.boolean(),
  lastLoginAt: z.string().nullable(),
  /** Leeg bij een medewerker; gevuld bij een klantgebruiker. */
  customerId: z.string().nullable(),
  roles: z.array(z.object({ key: z.string(), name: z.string() })),
})

export const paginatedUsersSchema = z.object({
  items: z.array(userSummarySchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
  pageCount: z.number().int(),
})

export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>
export type CreateUser = z.infer<typeof createUserSchema>
export type UpdateUser = z.infer<typeof updateUserSchema>
export type UserSummary = z.infer<typeof userSummarySchema>
export type RoleSummary = z.infer<typeof roleSummarySchema>
export type PaginatedUsers = z.infer<typeof paginatedUsersSchema>

// --- Rollen bewerken -------------------------------------------------------

/** Sleutels zijn kleine letters, cijfers en koppeltekens: ze staan in de code. */
const rolSleutel = () =>
  z
    .string({ error: 'Vul een sleutel in' })
    .trim()
    .toLowerCase()
    .min(2, 'Een sleutel is minstens 2 tekens')
    .max(40)
    .regex(/^[a-z][a-z0-9_-]*$/, 'Gebruik kleine letters, cijfers, - en _, beginnend met een letter')

export const createRoleSchema = z.object({
  key: rolSleutel(),
  name: verplichteTekst('Vul een naam in', { min: 2, max: 80 }),
  description: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(300).nullable(),
  ).optional(),
  permissionKeys: z.array(z.string()).default([]),
})

export const updateRoleSchema = z.object({
  name: verplichteTekst('Vul een naam in', { min: 2, max: 80 }).optional(),
  description: z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().trim().max(300).nullable(),
  ).optional(),
  permissionKeys: z.array(z.string()).optional(),
})

export const permissionSchema = z.object({
  key: z.string(),
  module: z.string(),
  action: z.string(),
  description: z.string().nullable(),
})

/** Rechten gegroepeerd per module, zoals het bewerkscherm ze toont. */
export const permissionGroupSchema = z.object({
  module: z.string(),
  permissions: z.array(permissionSchema),
})

export const roleDetailSchema = roleSummarySchema.extend({
  /** Hoeveel gebruikers deze rol hebben; bepaalt of hij te verwijderen is. */
  userCount: z.number().int(),
})

export type CreateRole = z.infer<typeof createRoleSchema>
export type UpdateRole = z.infer<typeof updateRoleSchema>
export type Permission = z.infer<typeof permissionSchema>
export type PermissionGroup = z.infer<typeof permissionGroupSchema>
export type RoleDetail = z.infer<typeof roleDetailSchema>
