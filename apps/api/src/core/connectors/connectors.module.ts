import { Global, Module } from '@nestjs/common'
import { ConnectorRegistry } from './connector.registry'
import { CredentialsService } from './credentials.service'
import { MidoceanConnector } from './midocean/midocean.connector'
import { PfConceptConnector } from './pfconcept/pfconcept.connector'

/**
 * De connectorlaag. Global, want zowel de importmodule als straks de
 * achtergrondtaken hebben hem nodig, en het is infrastructuur.
 */
@Global()
@Module({
  providers: [
    CredentialsService,
    ConnectorRegistry,
    // Zonder expliciete fabriek zou Nest de constructorparameter (de
    // ophaalfunctie) proberen te injecteren. In productie is dat gewoon fetch.
    { provide: MidoceanConnector, useFactory: () => new MidoceanConnector() },
    { provide: PfConceptConnector, useFactory: () => new PfConceptConnector() },
  ],
  exports: [CredentialsService, ConnectorRegistry],
})
export class ConnectorsModule {}
