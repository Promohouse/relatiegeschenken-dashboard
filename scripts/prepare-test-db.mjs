#!/usr/bin/env node
/**
 * Brengt de testdatabase op schema. Draait prisma migrate deploy met
 * TEST_DATABASE_URL als DATABASE_URL, en weigert als die naam niet met
 * DB_NAME_PREFIX begint.
 */
import { readFileSync, existsSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = { ...process.env }
const file = resolve(root, '.env')

if (existsSync(file)) {
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const url = env.TEST_DATABASE_URL
const prefix = env.DB_NAME_PREFIX
if (!url) { console.error('  GEBLOKKEERD: TEST_DATABASE_URL ontbreekt in .env.'); process.exit(1) }
if (!prefix) { console.error('  GEBLOKKEERD: DB_NAME_PREFIX ontbreekt in .env.'); process.exit(1) }

const name = new URL(url).pathname.replace(/^\//, '')
if (!name.startsWith(prefix)) {
  console.error(`  GEBLOKKEERD: testdatabase "${name}" begint niet met "${prefix}".`)
  process.exit(1)
}

console.log(`  testdatabase: ${name}`)
const result = spawnSync('npx', ['prisma', 'migrate', 'deploy'], {
  cwd: resolve(root, 'packages/db'),
  env: { ...env, DATABASE_URL: url },
  stdio: 'inherit',
})
process.exit(result.status ?? 1)
