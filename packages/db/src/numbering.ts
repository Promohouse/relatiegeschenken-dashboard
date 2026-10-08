import type { Prisma } from '@prisma/client'

/**
 * Uitgifte van unieke nummers. Zie ADR-0005.
 *
 * De reeksrij wordt met SELECT ... FOR UPDATE gelockt, zodat twee
 * gelijktijdige orders nooit hetzelfde nummer krijgen. Formaat en startwaarde
 * zijn instelbaar en mogen later wijzigen; een uitgegeven nummer wordt nooit
 * hergebruikt.
 */

export interface SequenceRow {
  id: string
  format: string
  lastValue: number
}

/**
 * Vult de plaatshouders {year} en {counter:n} in.
 * Voorbeeld: "ORD-{year}-{counter:5}" met jaar 2026 en teller 42
 *            wordt "ORD-2026-00042".
 */
export function renderNumberFormat(format: string, values: { year: number; counter: number }): string {
  return format
    .replace(/\{year\}/g, String(values.year))
    .replace(/\{counter(?::(\d+))?\}/g, (_match, digits) =>
      digits ? String(values.counter).padStart(Number(digits), '0') : String(values.counter),
    )
}

/**
 * Geeft het volgende nummer uit voor een reeks. Moet binnen een transactie
 * aangeroepen worden, anders heeft de rij-lock geen effect.
 */
export async function issueNumber(
  tx: Prisma.TransactionClient,
  key: string,
  year = 0,
): Promise<string> {
  const rows = await tx.$queryRaw<SequenceRow[]>`
    SELECT id, format, "lastValue"
    FROM number_sequences
    WHERE key = ${key} AND year = ${year}
    FOR UPDATE
  `

  if (rows.length === 0) {
    throw new Error(`Nummerreeks "${key}" voor jaar ${year} bestaat niet.`)
  }

  const sequence = rows[0]
  const counter = Number(sequence.lastValue) + 1

  await tx.numberSequence.update({
    where: { id: sequence.id },
    data: { lastValue: counter },
  })

  return renderNumberFormat(sequence.format, { year, counter })
}
