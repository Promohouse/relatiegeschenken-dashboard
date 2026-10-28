/**
 * Geeft de demomedewerkers een wachtwoord, zodat er op DEV ingelogd kan worden.
 *
 * Staat hier en niet in de database-seed, omdat alleen de api better-auth
 * kent. De database-seed maakt de gebruikers; dit script maakt hun
 * inloggegevens. Beide zijn idempotent en de volgorde maakt niet uit.
 *
 * Draai dit NOOIT tegen productie: het zet bekende wachtwoorden.
 */
import { createPrismaClient } from '@rgh/db'
import { createAuth } from '../src/core/auth/auth.config'

const DEMO_WACHTWOORD = 'demo-wachtwoord-2026'

async function main() {
  const url = process.env.DATABASE_URL
  const prefix = process.env.DB_NAME_PREFIX
  const naam = url ? new URL(url).pathname.replace(/^\//, '') : ''
  if (!prefix || !naam.startsWith(prefix)) {
    throw new Error(`Geweigerd: database "${naam}" valt buiten DB_NAME_PREFIX "${prefix}".`)
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Geweigerd: dit script zet bekende wachtwoorden en hoort niet in productie.')
  }

  const db = createPrismaClient(url, 2)
  const auth = createAuth(db, {
    secret: process.env.AUTH_SECRET!,
    baseURL: process.env.API_BASE_URL ?? 'http://localhost:3101',
    issuer: process.env.MFA_ISSUER ?? 'Relatiegeschenken Hub',
  })

  // De wachtwoordhash komt uit better-auth zelf, zodat hij exact overeenkomt
  // met wat de inlogroute verwacht.
  const context = await auth.$context
  const hash = await context.password.hash(DEMO_WACHTWOORD)

  const gebruikers = await db.user.findMany({
    where: { isDemo: true, email: { endsWith: '@demo.local' } },
    select: { id: true, email: true },
    orderBy: { email: 'asc' },
  })

  let nieuw = 0
  for (const gebruiker of gebruikers) {
    const bestaand = await db.account.findFirst({
      where: { userId: gebruiker.id, providerId: 'credential' },
    })
    if (bestaand) {
      await db.account.update({ where: { id: bestaand.id }, data: { password: hash } })
      continue
    }
    await db.account.create({
      data: {
        id: crypto.randomUUID(),
        accountId: gebruiker.id,
        providerId: 'credential',
        userId: gebruiker.id,
        password: hash,
      },
    })
    nieuw++
  }

  console.log(`  ${gebruikers.length} demo-accounts klaar (${nieuw} nieuw), wachtwoord: ${DEMO_WACHTWOORD}`)
  for (const g of gebruikers) console.log(`    ${g.email}`)
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
