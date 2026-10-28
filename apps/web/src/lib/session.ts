import { apiGet } from './api'

export interface CurrentUser {
  id: string
  name: string
  email: string
  customerId: string | null
  twoFactorEnabled: boolean
  permissions: string[]
}

/** De ingelogde gebruiker, of null als er geen geldige sessie is. */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  try {
    return await apiGet<CurrentUser>('/api/me')
  } catch {
    return null
  }
}

export const mag = (user: CurrentUser | null, permissie: string) =>
  !!user?.permissions.includes(permissie)
