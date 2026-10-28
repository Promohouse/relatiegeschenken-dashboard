import {
  paginatedUsersSchema, permissionGroupSchema, roleDetailSchema, roleSummarySchema, userSummarySchema,
} from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const User = registerSchema('User', userSummarySchema)
export const UserPage = registerSchema('UserPage', paginatedUsersSchema)
export const Role = registerSchema('Role', roleSummarySchema)
export const RoleDetail = registerSchema('RoleDetail', roleDetailSchema)
export const PermissionGroup = registerSchema('PermissionGroup', permissionGroupSchema)
