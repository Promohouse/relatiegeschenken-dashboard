#!/usr/bin/env node
/**
 * Veiligheidsslot voor databasecommando's.
 *
 * Deze machine deelt één PostgreSQL-instantie met andere projecten
 * (promohouse, voetbalticketskopen). Dit script weigert elk commando waarvan
 * de doeldatabase niet met DB_NAME_PREFIX begint, zodat een verkeerd gezette
 * DATABASE_URL nooit een andere database kan raken.
 *
 * Gebruik: node scripts/db-guard.mjs [--destructive]
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destructive = process.argv.includes('--destructive')

function loadEnv() {
  const env = { ...process.env }
  const file = resolve(root, '.env')
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m && env[m[1]] === undefined) {
        env[m[1]] = m[2].replace(/^["']|["']$/g, '')
      }
    }
  }
  return env
}

function databaseName(url) {
  try {
    return new URL(url).pathname.replace(/^\//, '')
  } catch {
    return null
  }
}

const env = loadEnv()
const prefix = env.DB_NAME_PREFIX
const url = env.DATABASE_URL

const fail = (msg) => {
  console.error(`\n  GEBLOKKEERD: ${msg}\n`)
  process.exit(1)
}

if (!prefix) fail('DB_NAME_PREFIX ontbreekt in .env. Zonder voorvoegsel geen controle, dus geen doorgang.')
if (!url) fail('DATABASE_URL ontbreekt in .env.')

const name = databaseName(url)
if (!name) fail(`DATABASE_URL is geen geldige URL, databasenaam niet te bepalen.`)
if (!name.startsWith(prefix)) {
  fail(
    `doeldatabase "${name}" begint niet met "${prefix}".\n` +
    `  Dit project mag uitsluitend databases met dat voorvoegsel aanraken.\n` +
    `  Controleer DATABASE_URL in .env.`
  )
}

console.log(`  db-guard: doeldatabase "${name}" is toegestaan${destructive ? ' (destructief commando)' : ''}.`)
