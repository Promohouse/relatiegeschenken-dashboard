import { SetMetadata } from '@nestjs/common'

export const PUBLIC_KEY = 'rgh:public'
export const PERMISSIONS_KEY = 'rgh:permissions'

/** Route zonder inlog, bijvoorbeeld de healthcheck of het inlogformulier. */
export const Public = () => SetMetadata(PUBLIC_KEY, true)

/**
 * Vereiste permissies in de vorm `module:actie`, bijvoorbeeld
 * `orders:goedkeuren`. Alle opgegeven permissies moeten aanwezig zijn.
 *
 * Elke route die geen `@Public()` is hoort hier een permissie te dragen; de
 * guard weigert anders. Vergeten beveiligen moet opvallen, niet doorglippen.
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions)
