import { defineConfig } from 'vitest/config'
import swc from 'unplugin-swc'

/**
 * NestJS leunt op decorator-metadata voor dependency injection. Vitest
 * transpileert met esbuild, dat die metadata niet uitstoot, dus gebruiken we
 * SWC met legacy decorators. Zonder dit faalt elke injectie met een
 * onbegrijpelijke foutmelding over een niet-oplosbare afhankelijkheid.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
  plugins: [
    swc.vite({
      module: { type: 'es6' },
      jsc: {
        target: 'es2022',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
    }),
  ],
})
