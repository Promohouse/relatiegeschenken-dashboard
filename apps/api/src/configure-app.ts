import type { INestApplication } from '@nestjs/common'
import { AppConfig } from './core/config/config.service'
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter'
import { setupOpenApi } from './openapi'

/**
 * Wordt door main.ts én door de tests gebruikt. Zonder deze gedeelde functie
 * lopen testopzet en productieopzet uit elkaar, en test je iets anders dan je
 * uitrolt.
 */
export function configureApp(app: INestApplication, options: { openApi?: boolean } = {}) {
  const config = app.get(AppConfig)

  app.setGlobalPrefix('api')
  app.useGlobalFilters(new AllExceptionsFilter())
  app.enableShutdownHooks()

  if (options.openApi !== false) {
    setupOpenApi(app, config.env.API_BASE_URL)
  }
  return config
}
