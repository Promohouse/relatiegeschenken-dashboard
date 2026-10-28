import { z } from 'zod'
import { registerSchema } from '../../core/openapi/schema-registry'

export const healthSchema = registerSchema(
  'Health',
  z.object({
    status: z.enum(['ok', 'degraded']),
    version: z.string(),
    environment: z.string(),
    uptimeSeconds: z.number(),
    database: z.enum(['ok', 'fout']),
    demoMode: z.boolean(),
    checkedAt: z.string(),
  }),
)

export type Health = z.infer<typeof healthSchema>
