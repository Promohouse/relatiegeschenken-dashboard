import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import { configureApp } from './configure-app'

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true })
  const config = configureApp(app)

  await app.listen(config.env.API_PORT)

  const logger = new Logger('Start')
  logger.log(`api luistert op ${config.env.API_BASE_URL}`)
  logger.log(`documentatie op ${config.env.API_BASE_URL}/docs`)
  if (config.env.DEMO_MODE) logger.warn('DEMO_MODE staat aan: er staat demodata in de database')
}

bootstrap().catch((error) => {
  // Opstartfouten zijn vaak configuratiefouten; die moeten leesbaar zijn.
  console.error('\nDe api kon niet starten:\n')
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
