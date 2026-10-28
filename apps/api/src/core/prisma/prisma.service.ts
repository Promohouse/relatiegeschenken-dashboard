import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { createPrismaClient, type Db } from '@rgh/db'
import { AppConfig } from '../config/config.service'
import { RequestContext } from '../context/request-context'
import { withCustomerScope } from './customer-scope'

/**
 * Databaseverbinding. De pool blijft klein: op de ontwikkelmachine wordt
 * PostgreSQL gedeeld met andere projecten (max_connections = 100), en in
 * productie draaien er naast de api ook workers. Zie ADR-0002.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  /** De onbegrensde client. Gebruik `db`, niet deze, tenzij je weet waarom. */
  readonly unscoped: Db
  private readonly scoped = new Map<string, Db>()

  constructor(private readonly config: AppConfig) {
    const url = this.config.isTest
      ? (this.config.env.TEST_DATABASE_URL ?? this.config.env.DATABASE_URL)
      : this.config.env.DATABASE_URL
    this.unscoped = createPrismaClient(url, 10)
  }

  /**
   * De client voor het huidige verzoek.
   *
   * Draait er een portaalsessie, dan is dit een client die elke query
   * begrenst op de eigen klant. **Veilig als standaard**: een module die
   * hier niet aan denkt, lekt niet. Werk buiten een verzoek om - workers,
   * imports - heeft geen klant in de context en krijgt de gewone client.
   */
  get db(): Db {
    const customerId = RequestContext.customerId()
    if (!customerId) return this.unscoped

    let client = this.scoped.get(customerId)
    if (!client) {
      client = withCustomerScope(this.unscoped, customerId) as unknown as Db
      this.scoped.set(customerId, client)
    }
    return client
  }

  async onModuleInit() {
    await this.unscoped.$queryRaw`SELECT 1`
    this.logger.log('Databaseverbinding in orde')
  }

  async onModuleDestroy() {
    await this.unscoped.$disconnect()
  }
}
