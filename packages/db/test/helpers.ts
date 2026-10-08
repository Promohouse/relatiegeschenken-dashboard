import { randomUUID } from 'node:crypto'

/**
 * Gegarandeerd uniek nummer voor testgegevens. Een tijdstempel is niet
 * genoeg: vitest draait testbestanden parallel, en twee suites die in
 * dezelfde milliseconde starten krijgen dan hetzelfde nummer.
 */
export const uniqueNumber = (prefix = 'T') => `${prefix}-${randomUUID()}`
