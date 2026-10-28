import { Injectable } from '@nestjs/common'
import type { ConnectorCapability } from '@rgh/db'
import { PreconditionError } from '../errors/domain-errors'
import type { SupplierConnector } from './connector.types'
import { MidoceanConnector } from './midocean/midocean.connector'

/**
 * Welke code hoort bij welke koppeling.
 *
 * `supplier_connections.connectorKey` wijst hierheen. Een koppeling in de
 * database zonder connector hier is geen stille fout maar een melding: zo kan
 * een capability wel gedocumenteerd staan terwijl de code er bewust niet is.
 * Dat is precies hoe bestellen bij midocean nu geregeld is (ADR-0013).
 */
@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<string, SupplierConnector>()

  constructor(midocean: MidoceanConnector) {
    this.registreer(midocean)
  }

  private registreer(connector: SupplierConnector) {
    this.connectors.set(connector.key, connector)
  }

  get(connectorKey: string, capability: ConnectorCapability): SupplierConnector {
    const connector = this.connectors.get(connectorKey)
    if (!connector) {
      throw new PreconditionError(
        `Voor "${connectorKey}" bestaat nog geen connector. De koppeling staat wel in de database, ` +
          'maar er is geen code die hem kan uitvoeren.',
      )
    }
    if (!connector.capabilities.includes(capability)) {
      throw new PreconditionError(
        `Connector "${connectorKey}" kan geen ${capability}. Wat hij wel kan: ` +
          `${connector.capabilities.join(', ')}.`,
      )
    }
    return connector
  }

  /** Voor het beheerscherm: wat er aan code beschikbaar is. */
  list(): { key: string; capabilities: ConnectorCapability[] }[] {
    return [...this.connectors.values()].map((c) => ({ key: c.key, capabilities: c.capabilities }))
  }
}
