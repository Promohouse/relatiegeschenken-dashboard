import { z } from 'zod'

/**
 * Schema's voor de importpijplijn: een import starten, de uitslag bekijken en
 * de voorgestelde wijzigingen doornemen.
 */

export const connectorCapabilitySchema = z.enum([
  'CATALOG', 'MEDIA', 'PRICE_TIERS', 'INVENTORY', 'PLACE_ORDER', 'ORDER_STATUS', 'SHIPPING',
])

export const startImportSchema = z.object({
  connectionKey: z.string({ error: 'Kies een koppeling' }).trim().min(1, 'Kies een koppeling'),
  capability: connectorCapabilitySchema,
  /**
   * Standaard een proefimport. Wie echt wil importeren moet dat zeggen; een
   * vergeten vlag hoort niet de catalogus te raken.
   */
  dryRun: z.coerce.boolean().default(true),
})

export const importRunSummarySchema = z.object({
  id: z.string(),
  connectionKey: z.string(),
  supplierName: z.string(),
  capability: connectorCapabilitySchema,
  status: z.enum(['PENDING', 'RUNNING', 'SUCCESS', 'PARTIAL', 'FAILED', 'CANCELLED']),
  dryRun: z.boolean(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  itemsSeen: z.number().int(),
  itemsChanged: z.number().int(),
  itemsFailed: z.number().int(),
  errorSummary: z.string().nullable(),
  /** Nieuw, gewijzigd, ongewijzigd en ontbrekend. */
  summary: z
    .object({
      created: z.number().int(),
      updated: z.number().int(),
      unchanged: z.number().int(),
      missing: z.number().int(),
      /** Alleen bij prijzen: regels die bij geen enkel eigen artikel horen. */
      unmatched: z.number().int().optional(),
    })
    .nullable(),
})

export const stagedChangeSchema = z.object({
  id: z.string(),
  entityType: z.string(),
  entityId: z.string().nullable(),
  externalId: z.string().nullable(),
  changeType: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  status: z.enum(['PENDING', 'APPLIED', 'REJECTED']),
  /** Alleen de gewijzigde velden, als { veld: { van, naar } }. */
  diff: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
})

export const connectionSummarySchema = z.object({
  key: z.string(),
  supplierName: z.string(),
  connectorKey: z.string(),
  transport: z.string(),
  isActive: z.boolean(),
  hasCredentials: z.boolean(),
  notes: z.string().nullable(),
  lastRunAt: z.string().nullable(),
  /** Welke omgeving van de leverancier: test of production. */
  environment: z.string(),
  capabilities: z.array(
    z.object({
      capability: connectorCapabilitySchema,
      isEnabled: z.boolean(),
      schedule: z.string().nullable(),
      /** Of er code bestaat die dit kan uitvoeren. */
      hasConnector: z.boolean(),
    }),
  ),
})

export type StartImport = z.infer<typeof startImportSchema>
export type ImportRunSummary = z.infer<typeof importRunSummarySchema>
export type StagedChangeView = z.infer<typeof stagedChangeSchema>
export type ConnectionSummary = z.infer<typeof connectionSummarySchema>
