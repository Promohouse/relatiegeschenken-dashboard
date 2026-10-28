import type { INestApplication } from '@nestjs/common'
import express from 'express'
import { toNodeHandler } from 'better-auth/node'
import { AppConfig } from './core/config/config.service'
import { AllExceptionsFilter } from './core/errors/all-exceptions.filter'
import { AUTH } from './core/auth/auth.tokens'
import type { Auth } from './core/auth/auth.config'
import { setupOpenApi } from './openapi'

/**
 * Wordt door main.ts én door de tests gebruikt. Zonder deze gedeelde functie
 * lopen testopzet en productieopzet uit elkaar, en test je iets anders dan je
 * uitrolt.
 *
 * De applicatie wordt aangemaakt met `bodyParser: false`: better-auth leest
 * de ruwe body zelf en moet dus vóór de body parser staan.
 */
export function configureApp(app: INestApplication, options: { openApi?: boolean } = {}) {
  const config = app.get(AppConfig)
  const auth = app.get<Auth>(AUTH)

  const expressApp = app.getHttpAdapter().getInstance() as express.Express
  expressApp.all('/api/auth/*splat', toNodeHandler(auth))

  // Pas hierna body parsing, voor onze eigen routes.
  app.use(express.json({ limit: '1mb' }))
  app.use(express.urlencoded({ extended: true, limit: '1mb' }))

  app.setGlobalPrefix('api')
  app.useGlobalFilters(new AllExceptionsFilter())
  app.enableShutdownHooks()

  if (options.openApi !== false) {
    setupOpenApi(app, config.env.API_BASE_URL)
  }
  return config
}
