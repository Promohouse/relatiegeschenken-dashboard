import { defineConfig, env } from 'prisma/config'

/**
 * Prisma 7 verwacht connectie-URL's hier in plaats van in het schema.
 * De .env staat in de repository-root; de npm-scripts laden die met
 * dotenv-cli (`dotenv -e ../../.env --`), zodat er geen tweede .env nodig is.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
    shadowDatabaseUrl: env('SHADOW_DATABASE_URL'),
  },
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
})
