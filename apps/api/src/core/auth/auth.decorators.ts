import { SetMetadata } from '@nestjs/common'

export const PUBLIC_KEY = 'rgh:public'
export const PERMISSIONS_KEY = 'rgh:permissions'
export const LOGIN_ONLY_KEY = 'rgh:login-only'

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

/**
 * Ingelogd zijn is genoeg, zonder specifiek recht. Alleen voor routes die
 * over de gebruiker zelf gaan, zoals "wie ben ik en wat mag ik".
 */
export const RequireLogin = () => SetMetadata(LOGIN_ONLY_KEY, true)
