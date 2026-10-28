import { ZodError } from 'zod'
import { DomainError } from './domain-errors'

export interface MappedError {
  status: number
  code: string
  message: string
  details?: unknown
  /** Interne oorzaak; wordt gelogd maar nooit teruggegeven. */
  internal?: string
}

/** Meldingen uit onze databasetriggers dragen het ADR-nummer. */
const TRIGGER_MARKER = 'ADR-0007'

interface PrismaLikeError {
  code?: string
  message?: string
  meta?: { target?: unknown; modelName?: unknown; field_name?: unknown }
}

const isPrismaLike = (e: unknown): e is PrismaLikeError =>
  typeof e === 'object' && e !== null && 'code' in e && typeof (e as { code: unknown }).code === 'string'

const targetVelden = (meta: PrismaLikeError['meta']): string[] => {
  const t = meta?.target
  if (Array.isArray(t)) return t.map(String)
  if (typeof t === 'string') return [t]
  return []
}

/**
 * Vertaalt alles wat uit de lagen eronder komt naar één vorm.
 *
 * Twee regels: een interne oorzaak lekt nooit naar de client, en een
 * databasemelding die wij zelf hebben geschreven (een trigger) komt wél door,
 * want die legt uit waarom iets geweigerd is.
 */
export function mapError(error: unknown): MappedError {
  if (error instanceof DomainError) {
    return { status: error.status, code: error.code, message: error.message, details: error.details }
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      code: 'ONGELDIGE_INVOER',
      message: 'De invoer is niet geldig.',
      details: error.issues.map((i) => ({ veld: i.path.join('.') || null, melding: i.message })),
    }
  }

  const melding = error instanceof Error ? error.message : String(error)

  // Onze eigen triggers: onveranderlijke offerteversies en append-only
  // beslissingen. Die melding is voor de gebruiker bedoeld.
  if (melding.includes(TRIGGER_MARKER)) {
    const schoon = melding.split('\n').map((l) => l.trim()).find((l) => l.includes(TRIGGER_MARKER)) ?? melding
    return { status: 409, code: 'ONVERANDERLIJK', message: schoon }
  }

  if (isPrismaLike(error)) {
    switch (error.code) {
      case 'P2002': {
        const velden = targetVelden(error.meta)
        return {
          status: 409,
          code: 'AL_IN_GEBRUIK',
          message: velden.length
            ? `Deze waarde bestaat al voor ${velden.join(', ')}.`
            : 'Deze waarde bestaat al.',
          details: velden.length ? { velden } : undefined,
        }
      }
      case 'P2025':
        return { status: 404, code: 'NIET_GEVONDEN', message: 'Het gevraagde record bestaat niet.' }
      case 'P2003':
        return {
          status: 409,
          code: 'NOG_IN_GEBRUIK',
          message: 'Dit record is nog aan andere gegevens gekoppeld en kan niet gewijzigd of verwijderd worden.',
        }
      case 'P2000':
        return { status: 400, code: 'ONGELDIGE_INVOER', message: 'Een waarde is te lang voor het veld.' }
      case 'P2014':
        return {
          status: 409,
          code: 'RELATIE_GESCHONDEN',
          message: 'Deze wijziging zou een bestaande koppeling verbreken.',
        }
    }
  }

  return {
    status: 500,
    code: 'INTERNE_FOUT',
    message: 'Er is een onverwachte fout opgetreden.',
    internal: melding,
  }
}
