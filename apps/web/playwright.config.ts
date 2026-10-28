import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'

// De .env staat in de repository-root. Het testproces heeft hem nodig om na
// afloop zijn eigen gegevens op te ruimen.
for (const regel of readFileSync(resolve(__dirname, '../../.env'), 'utf8').split('\n')) {
  const m = regel.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
  if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
}

/**
 * End-to-end tests draaien tegen de echte applicatie: een echte browser, de
 * echte api, de echte database. Dat is het punt - de unittests dekken de
 * onderdelen, dit dekt of ze samen werken.
 *
 * Playwright start api en dashboard zelf als ze nog niet draaien. Draaien ze
 * al, dan gebruikt hij die.
 *
 * Let op: dit draait tegen de ontwikkeldatabase en heeft de demogegevens en
 * demo-accounts nodig. Draai eerst `npm run db:seed`.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  timeout: 30_000,

  use: {
    baseURL: 'http://localhost:3100',
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  webServer: [
    {
      command: 'npm run start -w @rgh/api',
      cwd: '../..',
      url: 'http://localhost:3101/api/health',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev -w @rgh/web',
      cwd: '../..',
      url: 'http://localhost:3100/login',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
