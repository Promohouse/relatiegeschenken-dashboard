import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Hashing voor de importpijplijn en voor API-sleutels.
 *
 * Importhash: ongewijzigde leveranciersdata mag niet opnieuw verwerkt worden
 * (ADR-0004). Daarvoor moet dezelfde inhoud altijd dezelfde hash geven, ook
 * als de leverancier de velden in een andere volgorde aanlevert. Vandaar een
 * gecanoniseerde JSON-weergave met gesorteerde sleutels.
 */

/** JSON met gesorteerde objectsleutels, zodat de weergave stabiel is. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

/** Hash van een ruwe leverancierspayload, voor de hash-vergelijking. */
export function computePayloadHash(payload: unknown): string {
  return sha256Hex(canonicalJson(payload))
}

/** Of een artikel verwerkt moet worden. Gelijke hash betekent overslaan. */
export function hasChanged(previousHash: string | null | undefined, nextHash: string): boolean {
  return previousHash !== nextHash
}

/**
 * API-sleutels voor partnerkanalen.
 *
 * Een sleutel is 32 bytes uit een cryptografische bron. Omdat de entropie
 * hoog is, volstaat SHA-256 voor opslag; een langzame wachtwoordhash is hier
 * niet nodig en zou elke request vertragen. Voor wachtwoorden van gebruikers
 * geldt dit niet: die krijgen in stap 3 een echte wachtwoordhash.
 */
export const API_KEY_PREFIX = 'rgh_'

export function generateApiKey(): { key: string; keyHash: string } {
  const key = API_KEY_PREFIX + randomBytes(32).toString('base64url')
  return { key, keyHash: sha256Hex(key) }
}

export function hashApiKey(key: string): string {
  return sha256Hex(key)
}

/** Vergelijking in constante tijd, zodat de hash niet af te tasten is. */
export function apiKeyMatches(key: string, storedHash: string): boolean {
  const a = Buffer.from(hashApiKey(key), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
