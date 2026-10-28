import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createPrismaClient, type Db } from '@rgh/db'
import { AppConfig } from '../config/config.service'

/**
 * Databaseverbinding. De pool blijft klein: op de ontwikkelmachine wordt
 * PostgreSQL gedeeld met andere projecten (max_connections = 100), en in
 * productie draaien er naast de api ook workers. Zie ADR-0002.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)
  readonly db: Db

  constructor(private readonly config: AppConfig) {
    const url = this.config.isTest
      ? (this.config.env.TEST_DATABASE_URL ?? this.config.env.DATABASE_URL)
      : this.config.env.DATABASE_URL
    this.db = createPrismaClient(url, 10)
  }

  async onModuleInit() {
    await this.db.$queryRaw`SELECT 1`
    this.logger.log('Databaseverbinding in orde')
  }

  async onModuleDestroy() {
    await this.db.$disconnect()
  }
}
