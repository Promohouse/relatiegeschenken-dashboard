import { randomUUID } from 'node:crypto'
import { betterAuth } from 'better-auth'
import { prismaAdapter } from 'better-auth/adapters/prisma'
import { twoFactor } from 'better-auth/plugins'
import { createPrismaClient, type Db } from '@rgh/db'

/**
 * Authenticatie-instelling (ADR-0003, ADR-0012).
 *
 * Let op de werkverdeling: better-auth doet identiteit - wachtwoorden,
 * sessies, tweefactor. **Autorisatie blijft van ons**: rollen en permissies
 * als `module:actie` staan in onze eigen tabellen, want die zijn
 * domeinspecifiek en moeten configureerbaar zijn zonder code.
 */
export function createAuth(db: Db, options: { secret: string; baseURL: string; issuer: string }) {
  return betterAuth({
    appName: 'Relatiegeschenken Hub',
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: '/api/auth',

    database: prismaAdapter(db, { provider: 'postgresql' }),

    advanced: {
      database: {
        // users.id is een UUID-kolom. De standaard-id van better-auth is een
        // willekeurige tekenreeks en zou daar niet in passen.
        generateId: () => randomUUID(),
      },
    },

    emailAndPassword: {
      enabled: true,
      minPasswordLength: 12,
      // E-mail versturen kan pas als Microsoft Graph er is (Fase 7). Tot die
      // tijd wordt een wachtwoordherstel niet stilzwijgend "gelukt" gemeld.
      sendResetPassword: async () => {
        throw new Error(
          'Wachtwoordherstel per e-mail werkt pas als de Microsoft 365-koppeling er is (Fase 7). ' +
            'Laat een beheerder het wachtwoord voorlopig handmatig opnieuw instellen.',
        )
      },
    },

    plugins: [twoFactor({ issuer: options.issuer })],
  })
}

export type Auth = ReturnType<typeof createAuth>

/**
 * Alleen voor `better-auth generate`: die CLI leest dit bestand en heeft een
 * instantie nodig. De applicatie zelf bouwt er een via AuthModule, met de
 * verbinding en de secrets uit de configuratie.
 */
export const auth = createAuth(createPrismaClient(process.env.DATABASE_URL, 1), {
  secret: process.env.AUTH_SECRET ?? 'x'.repeat(32),
  baseURL: process.env.API_BASE_URL ?? 'http://localhost:3101',
  issuer: process.env.MFA_ISSUER ?? 'Relatiegeschenken Hub',
})
