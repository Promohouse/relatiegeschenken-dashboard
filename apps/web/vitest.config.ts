import { defineConfig } from 'vitest/config'

/**
 * Alleen voor tests die geen browser nodig hebben. Wat de gebruiker ziet
 * wordt met Playwright getest; dit is voor regels over de code zelf, zoals de
 * controle dat de twee donkere kleurblokken gelijk blijven.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
})
