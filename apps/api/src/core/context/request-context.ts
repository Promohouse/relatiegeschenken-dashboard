import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Wie doet wat, vanaf waar. Beschikbaar in elke laag zonder het door elke
 * functiehandtekening te slepen - nodig voor het auditlog, dat op iedere
 * betekenisvolle handeling moet vastleggen wie hem deed.
 */
export interface RequestContextData {
  requestId: string
  /** Leeg bij een achtergrondtaak of een nog niet ingelogde aanroep. */
  userId?: string | null
  /** Gevuld bij een portaalsessie; begrenst wat de gebruiker mag zien. */
  customerId?: string | null
  ipAddress?: string | null
  userAgent?: string | null
}

const storage = new AsyncLocalStorage<RequestContextData>()

export const RequestContext = {
  run<T>(data: RequestContextData, fn: () => T): T {
    return storage.run(data, fn)
  },

  get(): RequestContextData | undefined {
    return storage.getStore()
  },

  requestId(): string | undefined {
    return storage.getStore()?.requestId
  },

  userId(): string | null {
    return storage.getStore()?.userId ?? null
  },

  customerId(): string | null {
    return storage.getStore()?.customerId ?? null
  },

  /**
   * Vult de context in voor werk buiten een verzoek om, zoals een worker.
   * Maakt in het auditlog zichtbaar dat de handeling van het systeem kwam.
   */
  runAsSystem<T>(requestId: string, fn: () => T): T {
    return storage.run({ requestId, userId: null }, fn)
  },
}
