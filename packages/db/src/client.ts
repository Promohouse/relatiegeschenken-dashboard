import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

/**
 * Prisma 7 verbindt via een driver-adapter in plaats van via een url in het
 * schema. De pool blijft klein: deze PostgreSQL-instantie wordt op de
 * ontwikkelmachine gedeeld met andere projecten (max_connections = 100).
 */
export function createPrismaClient(connectionString = process.env.DATABASE_URL, max = 10) {
  if (!connectionString) {
    throw new Error('DATABASE_URL ontbreekt. Kopieer .env.example naar .env.')
  }
  const adapter = new PrismaPg({ connectionString, max })
  return new PrismaClient({ adapter })
}

export type Db = ReturnType<typeof createPrismaClient>
