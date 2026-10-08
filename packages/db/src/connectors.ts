import type { Db } from './client'
import type { ConnectorCapability } from '@prisma/client'

/**
 * Capability-routing (ADR-0004).
 *
 * Per leverancier en capability kan meer dan één bron bestaan: een catalogus
 * uit een nachtelijke feed, voorraad uit een directe API. De laagste priority
 * onder de actieve rijen wint; de rest is terugvaloptie.
 */

export async function listCapabilitySources(
  db: Db,
  supplierId: string,
  capability: ConnectorCapability,
) {
  return db.supplierConnectionCapability.findMany({
    where: {
      capability,
      isEnabled: true,
      connection: { supplierId, isActive: true },
    },
    include: { connection: true },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  })
}

/** De bron die deze capability nu levert, of null als er geen actieve bron is. */
export async function resolveCapabilitySource(
  db: Db,
  supplierId: string,
  capability: ConnectorCapability,
) {
  const sources = await listCapabilitySources(db, supplierId, capability)
  return sources[0] ?? null
}

/**
 * Of een ruw artikel verwerkt moet worden. Gelijke hash betekent dat de
 * leverancier niets gewijzigd heeft, en dan slaan we het over - bij catalogi
 * van tienduizenden artikelen scheelt dat uren per run.
 */
export async function needsProcessing(
  db: Db,
  connectionId: string,
  externalId: string,
  hash: string,
): Promise<boolean> {
  const existing = await db.rawSupplierProduct.findUnique({
    where: { connectionId_externalId: { connectionId, externalId } },
    select: { hash: true },
  })
  return existing?.hash !== hash
}
