import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import type { INestApplication } from '@nestjs/common'
import { applyRegisteredSchemas } from './core/openapi/schema-registry'

export function setupOpenApi(app: INestApplication, apiBaseUrl: string) {
  const config = new DocumentBuilder()
    .setTitle('Relatiegeschenken Hub API')
    .setDescription(
      'Interne API van het platform. De publieke webshop-API komt later als eigen, ' +
        'versiebeheerd oppervlak en krijgt geen rechtstreekse databasetoegang.',
    )
    .setVersion('0.1.0')
    .addServer(apiBaseUrl)
    .addCookieAuth('sessie')
    .build()

  const document = applyRegisteredSchemas(SwaggerModule.createDocument(app, config))
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'docs/openapi.json',
  })
  return document
}
