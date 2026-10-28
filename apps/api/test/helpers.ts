import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { INestApplication } from '@nestjs/common'
import { Test, type TestingModule } from '@nestjs/testing'
import { AppConfigModule } from '../src/core/config/config.module'
import { PrismaModule } from '../src/core/prisma/prisma.module'
import { CoreModule } from '../src/core/core.module'

loadEnv({ path: resolve(__dirname, '../../../.env') })
process.env.NODE_ENV = 'test'

/** Alleen de kernlaag; geen HTTP, dus geen poort en geen controllers. */
export async function createCoreModule(): Promise<TestingModule> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppConfigModule, PrismaModule, CoreModule],
  }).compile()
  await moduleRef.init()
  return moduleRef
}

/** Vitest draait testbestanden parallel; een tijdstempel is niet uniek genoeg. */
export const uniqueNumber = (prefix = 'T') => `${prefix}-${randomUUID()}`

/**
 * Maakt een gebruiker met wachtwoord aan, zoals de beheerder dat doet.
 *
 * Niet via de registratieroute: die staat uit. De wachtwoordhash komt uit
 * better-auth zelf, zodat hij overeenkomt met wat de inlogroute verwacht.
 */
export async function maakGebruikerMetWachtwoord(
  app: INestApplication,
  gegevens: { email: string; name: string; password: string },
) {
  const { AUTH } = await import('../src/core/auth/auth.tokens')
  const { PrismaService } = await import('../src/core/prisma/prisma.service')

  const auth: { $context: Promise<{ password: { hash: (w: string) => Promise<string> } }> } =
    app.get(AUTH)
  const prisma: InstanceType<typeof PrismaService> = app.get(PrismaService)

  const hash = await (await auth.$context).password.hash(gegevens.password)
  const user = await prisma.unscoped.user.create({
    data: { email: gegevens.email, name: gegevens.name },
  })
  await prisma.unscoped.account.create({
    data: {
      id: randomUUID(),
      accountId: user.id,
      providerId: 'credential',
      userId: user.id,
      password: hash,
    },
  })
  return user
}
