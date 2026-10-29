import type { CompanySettings, ThemePreference } from '@rgh/contracts'
import { apiGet } from './api'

export interface CurrentUser {
  id: string
  name: string
  email: string
  customerId: string | null
  twoFactorEnabled: boolean
  themePreference: ThemePreference
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

/**
 * Bedrijfsgegevens voor in het scherm en op documenten.
 *
 * Staan in de database en niet in de code, zodat een verhuizing of een nieuw
 * rekeningnummer geen nieuwe versie van de software vraagt.
 */
export async function getCompany(): Promise<CompanySettings | null> {
  try {
    return await apiGet<CompanySettings>('/api/settings/company')
  } catch {
    return null
  }
}
