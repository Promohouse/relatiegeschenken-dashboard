import { connectionSummarySchema, importRunSummarySchema, stagedChangeSchema } from '@rgh/contracts'
import { registerSchema } from '../../core/openapi/schema-registry'

export const ImportRun = registerSchema('ImportRun', importRunSummarySchema)
export const StagedChange = registerSchema('StagedChange', stagedChangeSchema)
export const SupplierConnectionView = registerSchema('SupplierConnection', connectionSummarySchema)
