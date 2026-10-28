import { z } from 'zod'

/**
 * Omgevingsvariabelen worden bij het opstarten gevalideerd. Faalt dat, dan
 * start de applicatie niet: een ontbrekende sleutel of een verkeerde
 * databasenaam moet meteen opvallen en niet pas in productie.
 */

/** Leest 'true', '1' en true als waar; alles anders als onwaar. */
const envBoolean = (fallback: boolean) =>
  z.preprocess(
    (v) => (v === undefined || v === '' ? fallback : v === true || v === 'true' || v === '1'),
    z.boolean(),
  )

const httpUrl = (name: string) =>
  z.string().refine((v) => v.startsWith('http://') || v.startsWith('https://'), {
    message: `${name} moet met http:// of https:// beginnen`,
  })

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.string().min(1, 'DATABASE_URL ontbreekt'),
    TEST_DATABASE_URL: z.string().optional(),
    SHADOW_DATABASE_URL: z.string().optional(),
    DB_NAME_PREFIX: z.string().min(1, 'DB_NAME_PREFIX ontbreekt'),

    API_PORT: z.coerce.number().int().positive().default(3101),
    WEB_PORT: z.coerce.number().int().positive().default(3100),
    API_BASE_URL: httpUrl('API_BASE_URL'),
    WEB_BASE_URL: httpUrl('WEB_BASE_URL'),

    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET moet minstens 32 tekens zijn'),
    SESSION_MAX_AGE_DAYS: z.coerce.number().int().positive().default(14),
    MFA_ISSUER: z.string().default('Relatiegeschenken Hub'),

    STORAGE_DRIVER: z.enum(['local', 's3']).default('local'),
    STORAGE_LOCAL_PATH: z.string().default('./storage'),

    VALKEY_URL: z.string().default('redis://localhost:6379'),
    VALKEY_DB: z.coerce.number().int().min(0).default(3),
    VALKEY_TEST_DB: z.coerce.number().int().min(0).default(4),
    QUEUE_PREFIX: z.string().default('rgh'),
    JOBS_ENABLED: envBoolean(true),

    DEMO_MODE: envBoolean(false),
    CONNECTOR_SECRET_KEY: z.string().min(32, 'CONNECTOR_SECRET_KEY moet minstens 32 tekens zijn'),
  })

export type Env = z.infer<typeof envSchema>

export function databaseName(url: string): string | null {
  try {
    return new URL(url).pathname.replace(/^\//, '') || null
  } catch {
    return null
  }
}

function omgevingsFout(regels: string[]): Error {
  return new Error(
    `De omgeving is niet geldig. Controleer .env:\n${regels.join('\n')}\n` +
      'Een voorbeeld staat in .env.example.',
  )
}

/**
 * Valideert en geeft een leesbare, gebundelde foutmelding bij problemen.
 *
 * Het veiligheidsslot op de databasenaam staat hier en niet in het schema:
 * de melding moet de werkelijke naam en het voorvoegsel bevatten, en een
 * schemaregel met een dynamische melding is afhankelijk van de Zod-versie.
 */
export function parseEnv(raw: NodeJS.ProcessEnv): Env {
  const result = envSchema.safeParse(raw)
  if (!result.success) {
    throw omgevingsFout(
      result.error.issues.map((i) => `  - ${i.path.join('.') || '(algemeen)'}: ${i.message}`),
    )
  }

  const env = result.data
  const naam = databaseName(env.DATABASE_URL)
  if (!naam) {
    throw omgevingsFout(['  - DATABASE_URL: geen geldige verbindingsreeks, databasenaam niet te bepalen'])
  }
  if (!naam.startsWith(env.DB_NAME_PREFIX)) {
    throw omgevingsFout([
      `  - DATABASE_URL: wijst naar database "${naam}", die niet met DB_NAME_PREFIX ` +
        `"${env.DB_NAME_PREFIX}" begint.`,
      '    Deze machine deelt PostgreSQL met andere projecten; dit is het veiligheidsslot.',
    ])
  }

  return env
}
