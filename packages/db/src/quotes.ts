import type { Prisma } from '@prisma/client'

/**
 * Offertes: versienummering, vastzetten en het ontsnappingsluik.
 *
 * Een offerteversie is na vastzetten onveranderlijk. Dat wordt door
 * databasetriggers afgedwongen (ADR-0007), niet door deze code - deze
 * functies zijn het gemak, niet de garantie.
 */

/** Het volgende versienummer binnen een offerte. */
export async function nextQuoteVersionNumber(
  tx: Prisma.TransactionClient,
  quoteId: string,
): Promise<number> {
  const last = await tx.quoteVersion.findFirst({
    where: { quoteId },
    orderBy: { versionNumber: 'desc' },
    select: { versionNumber: true },
  })
  return (last?.versionNumber ?? 0) + 1
}

/**
 * Zet een offerteversie vast. Vanaf dit moment weigeren de triggers elke
 * wijziging aan de versie, zijn regels en zijn bedrukkingen.
 *
 * `documentChecksum` is de controlewaarde van de PDF en hoort bij het bewijs
 * dat later aan een klantakkoord hangt.
 */
export async function lockQuoteVersion(
  tx: Prisma.TransactionClient,
  quoteVersionId: string,
  options: { documentChecksum?: string; sentAt?: Date } = {},
) {
  const version = await tx.quoteVersion.findUniqueOrThrow({
    where: { id: quoteVersionId },
    select: { lockedAt: true },
  })
  if (version.lockedAt) {
    throw new Error(`Offerteversie ${quoteVersionId} is al vastgezet op ${version.lockedAt.toISOString()}.`)
  }

  const now = new Date()
  return tx.quoteVersion.update({
    where: { id: quoteVersionId },
    data: {
      lockedAt: now,
      sentAt: options.sentAt ?? now,
      documentChecksum: options.documentChecksum ?? null,
    },
  })
}

/**
 * Sleutel die voorkomt dat tweemaal klikken op akkoord twee orders oplevert.
 * Eén beslissing per offerteversie per soort beslissing.
 */
export function approvalIdempotencyKey(quoteVersionId: string, decision: string): string {
  return `${quoteVersionId}:${decision}`
}

/**
 * Heft de onveranderlijkheid op binnen de huidige transactie. Uitsluitend voor
 * beheerhandelingen: demodata opruimen, testopruiming, een gecontroleerde
 * correctie. Moet binnen een transactie aangeroepen worden, want SET LOCAL
 * geldt alleen daar.
 *
 * Bewust omslachtig: dit kan niet per ongeluk gebeuren.
 */
export async function allowLockedQuoteChanges(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRawUnsafe(`SET LOCAL rgh.unlock_quotes = 'on'`)
}
