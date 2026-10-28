import { config as loadEnv } from 'dotenv'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
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
