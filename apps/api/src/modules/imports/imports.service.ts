import { Injectable, Logger } from '@nestjs/common'
import type { ConnectorCapability, Prisma } from '@rgh/db'
import { computePayloadHash } from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { AppConfig } from '../../core/config/config.service'
import { CredentialsService } from '../../core/connectors/credentials.service'
import { ConnectorRegistry } from '../../core/connectors/connector.registry'
import {
  ConnectorError,
  type CanonicalProduct, type ConnectorContext, type FetchedRecord,
} from '../../core/connectors/connector.types'
import { NotFoundError, PreconditionError } from '../../core/errors/domain-errors'

export interface RunOptions {
  /** Een proefimport berekent de verschillen en schrijft niets. */
  dryRun?: boolean
}

export interface RunResult {
  importRunId: string
  status: 'SUCCESS' | 'PARTIAL' | 'FAILED'
  dryRun: boolean
  itemsSeen: number
  itemsChanged: number
  itemsFailed: number
  /** Nieuw, gewijzigd, ongewijzigd en ontbrekend - de samenvatting voor het scherm. */
  summary: { created: number; updated: number; unchanged: number; missing: number }
}

/** Wat we van onze eigen kant nodig hebben om te vergelijken. */
interface HuidigProduct {
  id: string
  isActive: boolean
  name: string
  description: string | null
  brand: string | null
  material: string | null
  dimensions: string | null
  countryOfOrigin: string | null
  commodityCode: string | null
  printable: boolean | null
  variants: { sku: string }[]
}

/** Velden van het product die uit leveranciersdata komen en dus mogen wijzigen. */
const PRODUCTVELDEN = [
  'name', 'description', 'brand', 'material', 'dimensions', 'countryOfOrigin',
  'commodityCode', 'printable',
] as const

/**
 * De importpijplijn: ophalen, in staging zetten, verschillen bepalen.
 *
 * Drie lagen, zoals ADR-0004 voorschrijft. Externe data landt in
 * `raw_supplier_products`, de verschillen in `staged_changes`, en pas na
 * beoordeling in de catalogus. Deze service doet de eerste twee; toepassen is
 * een aparte handeling.
 *
 * Harde regel 12: een import verwijdert nooit een product. Een artikel dat
 * niet meer in de bron voorkomt levert een voorstel op om het op inactief te
 * zetten, en dat is iets wat een mens goedkeurt.
 */
@Injectable()
export class ImportsService {
  private readonly logger = new Logger(ImportsService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: AppConfig,
    private readonly credentials: CredentialsService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async run(
    connectionKey: string,
    capability: ConnectorCapability,
    options: RunOptions = {},
  ): Promise<RunResult> {
    const dryRun = options.dryRun ?? true
    const verbinding = await this.verbindingVoorImport(connectionKey, capability)
    const connector = this.registry.get(verbinding.connectorKey, capability)

    const run = await this.prisma.db.importRun.create({
      data: {
        connectionId: verbinding.id,
        capability,
        status: 'RUNNING',
        dryRun,
      },
    })

    try {
      const context: ConnectorContext = {
        config: (verbinding.config ?? {}) as Record<string, unknown>,
        credentials: this.credentials.decrypt(verbinding.credentials),
      }

      if (capability !== 'CATALOG') {
        throw new PreconditionError(
          `De capability ${capability} wordt nog niet door de importpijplijn verwerkt. ` +
            'Op dit moment is dat alleen CATALOG.',
        )
      }
      if (!connector.fetchCatalog) {
        throw new PreconditionError(`Connector ${connector.key} kan geen catalogus ophalen.`)
      }

      const records = await connector.fetchCatalog(context)
      const resultaat = await this.verwerkCatalogus(run.id, verbinding, records, dryRun)

      await this.prisma.db.importRun.update({
        where: { id: run.id },
        data: {
          status: resultaat.itemsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
          finishedAt: new Date(),
          itemsSeen: resultaat.itemsSeen,
          itemsChanged: resultaat.itemsChanged,
          itemsFailed: resultaat.itemsFailed,
          log: resultaat.summary as unknown as Prisma.InputJsonValue,
        },
      })

      if (!dryRun) {
        await this.prisma.db.supplierConnection.update({
          where: { id: verbinding.id },
          data: { lastRunAt: new Date() },
        })
      }

      await this.audit.record({
        entity: 'ImportRun',
        entityId: run.id,
        action: dryRun ? 'EXPORT' : 'CREATE',
        diff: {
          samenvatting: { van: null, naar: resultaat.summary },
          proefimport: { van: null, naar: dryRun },
        },
      })

      return {
        importRunId: run.id,
        status: resultaat.itemsFailed > 0 ? 'PARTIAL' : 'SUCCESS',
        dryRun,
        ...resultaat,
      }
    } catch (fout) {
      const melding = fout instanceof Error ? fout.message : String(fout)
      await this.prisma.db.importRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', finishedAt: new Date(), errorSummary: melding },
      })
      this.logger.error(`Import ${run.id} (${connectionKey}/${capability}) mislukt: ${melding}`)
      throw fout
    }
  }

  /**
   * De verbinding ophalen en controleren of hij gebruikt mag worden.
   *
   * De laatste controle is de belangrijkste: een productiesleutel hoort niet
   * op een ontwikkelmachine. Zonder deze regel haalt iemand per ongeluk de
   * echte catalogus op met de echte sleutel vanaf zijn laptop.
   */
  private async verbindingVoorImport(key: string, capability: ConnectorCapability) {
    const verbinding = await this.prisma.db.supplierConnection.findUnique({
      where: { key },
      include: { capabilities: true, supplier: { select: { name: true } } },
    })
    if (!verbinding) throw new NotFoundError(`Er is geen koppeling met de sleutel ${key}.`)

    if (!verbinding.isActive) {
      throw new PreconditionError(
        `De koppeling ${key} staat uit. Zet hem aan zodra de credentials ingevoerd zijn.`,
      )
    }

    const cap = verbinding.capabilities.find((c) => c.capability === capability)
    if (!cap) {
      throw new PreconditionError(
        `De koppeling ${key} heeft geen ${capability}. Zie de leveranciersdocumentatie voor wat ` +
          'deze leverancier aanbiedt.',
      )
    }
    if (!cap.isEnabled) {
      throw new PreconditionError(
        `${capability} staat uit bij koppeling ${key}. Dat is een bewuste keuze; zie de notitie ` +
          'bij de koppeling.',
      )
    }

    const omgeving = String((verbinding.config as Record<string, unknown>)?.environment ?? 'test')
    if (omgeving === 'production' && !this.config.isProduction) {
      throw new PreconditionError(
        `De koppeling ${key} wijst naar de productieomgeving van de leverancier, en dit is geen ` +
          'productieomgeving. Gebruik de testomgeving van de leverancier.',
      )
    }

    return verbinding
  }

  /**
   * Per artikel: is het veranderd sinds de vorige keer, en zo ja, wat?
   *
   * De hashvergelijking scheelt het meeste werk - bij een dagelijkse volledige
   * catalogus wijzigt er normaal een handvol artikelen. Een gelijke hash
   * betekent overslaan, zonder de catalogus te raadplegen.
   */
  private async verwerkCatalogus(
    importRunId: string,
    verbinding: { id: string; supplierId: string },
    records: FetchedRecord<CanonicalProduct>[],
    dryRun: boolean,
  ) {
    const samenvatting = { created: 0, updated: 0, unchanged: 0, missing: 0 }
    let itemsFailed = 0

    const bekend = await this.prisma.db.rawSupplierProduct.findMany({
      where: { connectionId: verbinding.id },
      select: { externalId: true, hash: true },
    })
    const hashPerArtikel = new Map(bekend.map((r) => [r.externalId, r.hash]))

    // Onze eigen kant, in één query. Twee redenen: een query per artikel is
    // bij een volledige catalogus niet te doen, en we hebben deze lijst toch
    // nodig om te zien wat er uit de bron verdwenen is.
    //
    // Dit laadt de producten van deze leverancier in het geheugen. Bij
    // midocean gaat dat om duizenden artikelen en is dat prima; wordt een
    // catalogus veel groter, dan moet dit in blokken.
    const koppelingen = await this.prisma.db.productSupplier.findMany({
      where: { supplierId: verbinding.supplierId, isActive: true },
      select: {
        supplierArticleNumber: true,
        productId: true,
        product: {
          select: {
            id: true, isActive: true, name: true, description: true, brand: true,
            material: true, dimensions: true, countryOfOrigin: true, commodityCode: true,
            printable: true,
            variants: { select: { sku: true } },
          },
        },
      },
    })
    const productPerArtikel = new Map(koppelingen.map((k) => [k.supplierArticleNumber, k.product]))
    const gezien = new Set<string>()

    for (const record of records) {
      gezien.add(record.externalId)
      try {
        const hash = computePayloadHash(record.payload)

        // De hash bepaalt of we de ruwe data opnieuw vastleggen, niet of we
        // vergelijken. Dat onderscheid is wezenlijk: een gelijke hash zegt
        // alleen dat de *leverancier* niets wijzigde. Of onze catalogus
        // afwijkt - omdat iemand hem aanpaste, of omdat het artikel pas later
        // gekoppeld werd - weet je daar niet mee. Vergelijken doen we dus
        // altijd; het is een lezing uit het geheugen, geen query.
        const bronOngewijzigd = hashPerArtikel.get(record.externalId) === hash

        // Een proefimport schrijft geen ruwe rij weg. Zou hij dat wel doen,
        // dan toont een tweede proefimport geen wijzigingen meer, want de
        // hash komt dan al overeen.
        if (!dryRun && !bronOngewijzigd) {
          await this.prisma.db.rawSupplierProduct.upsert({
            where: {
              connectionId_externalId: { connectionId: verbinding.id, externalId: record.externalId },
            },
            update: { payload: record.payload as Prisma.InputJsonValue, hash, importRunId, fetchedAt: new Date() },
            create: {
              connectionId: verbinding.id,
              externalId: record.externalId,
              payload: record.payload as Prisma.InputJsonValue,
              hash,
              importRunId,
            },
          })
        }

        const verschil = this.bepaalVerschil(
          productPerArtikel.get(record.externalId) ?? null,
          record.value,
        )
        if (!verschil) {
          samenvatting.unchanged++
          await this.noteerItem(importRunId, record.externalId, 'SKIPPED', 'Geen verschil met de catalogus.')
          continue
        }

        await this.prisma.db.stagedChange.create({
          data: {
            importRunId,
            entityType: 'Product',
            entityId: verschil.productId,
            externalId: record.externalId,
            changeType: verschil.changeType,
            diff: verschil.diff as Prisma.InputJsonValue,
          },
        })

        if (verschil.changeType === 'CREATE') samenvatting.created++
        else samenvatting.updated++
        await this.noteerItem(importRunId, record.externalId, 'OK')
      } catch (fout) {
        itemsFailed++
        await this.noteerItem(
          importRunId, record.externalId, 'FAILED',
          fout instanceof Error ? fout.message : String(fout),
        )
      }
    }

    samenvatting.missing = await this.markeerOntbrekend(importRunId, koppelingen, gezien)

    return {
      itemsSeen: records.length,
      itemsChanged: samenvatting.created + samenvatting.updated + samenvatting.missing,
      itemsFailed,
      summary: samenvatting,
    }
  }

  /**
   * Wat er aan dit artikel verandert ten opzichte van onze catalogus.
   *
   * Null betekent: niets. De koppeling loopt over `product_suppliers`, want
   * daar staat het artikelnummer van de leverancier, en dat is de enige
   * stabiele sleutel die we met hen delen.
   */
  private bepaalVerschil(huidig: HuidigProduct | null, product: CanonicalProduct) {
    const nieuweWaarden = {
      name: product.name,
      description: product.longDescription ?? product.shortDescription,
      brand: product.brand,
      material: product.material,
      dimensions: product.dimensions,
      countryOfOrigin: product.countryOfOrigin,
      commodityCode: product.commodityCode,
      printable: product.printable,
    }

    if (!huidig) {
      return {
        productId: null,
        changeType: 'CREATE' as const,
        diff: {
          ...Object.fromEntries(
            Object.entries(nieuweWaarden).map(([veld, naar]) => [veld, { van: null, naar }]),
          ),
          articleNumber: { van: null, naar: product.articleNumber },
          varianten: { van: null, naar: product.variants.map((v) => v.sku) },
        },
      }
    }

    const diff: Record<string, { van: unknown; naar: unknown }> = {}
    for (const veld of PRODUCTVELDEN) {
      const van = (huidig as unknown as Record<string, unknown>)[veld] ?? null
      const naar = nieuweWaarden[veld] ?? null
      if (van !== naar) diff[veld] = { van, naar }
    }

    // Varianten: alleen welke erbij komen en welke verdwijnen. Verdwijnen is
    // een voorstel, geen verwijdering; dat beslist een mens bij het toepassen.
    const huidigeSkus = new Set(huidig.variants.map((v) => v.sku))
    const nieuweSkus = new Set(product.variants.map((v) => v.sku))
    const erbij = [...nieuweSkus].filter((s) => !huidigeSkus.has(s))
    const eraf = [...huidigeSkus].filter((s) => !nieuweSkus.has(s))
    if (erbij.length > 0 || eraf.length > 0) {
      diff.varianten = { van: eraf, naar: erbij }
    }

    if (Object.keys(diff).length === 0) return null
    return { productId: huidig.id, changeType: 'UPDATE' as const, diff }
  }

  /**
   * Artikelen die wij van deze leverancier kennen maar die niet meer in de
   * bron staan.
   *
   * Harde regel 12: niet verwijderen. Er komt een voorstel om het artikel op
   * inactief te zetten, met de reden erbij, en dat moet iemand goedkeuren.
   */
  private async markeerOntbrekend(
    importRunId: string,
    koppelingen: { supplierArticleNumber: string; productId: string; product: { isActive: boolean } }[],
    gezien: Set<string>,
  ): Promise<number> {
    const ontbrekend = koppelingen.filter(
      (p) => !gezien.has(p.supplierArticleNumber) && p.product.isActive,
    )

    for (const p of ontbrekend) {
      await this.prisma.db.stagedChange.create({
        data: {
          importRunId,
          entityType: 'Product',
          entityId: p.productId,
          externalId: p.supplierArticleNumber,
          changeType: 'UPDATE',
          diff: {
            isActive: { van: true, naar: false },
            reden: {
              van: null,
              naar: 'Komt niet meer voor in de leveranciersdata. Een import verwijdert nooit een ' +
                'product; dit is een voorstel om het op inactief te zetten.',
            },
          },
        },
      })
    }

    return ontbrekend.length
  }

  // --- Opvragen ------------------------------------------------------------

  async listRuns(limit = 25) {
    const runs = await this.prisma.db.importRun.findMany({
      orderBy: { startedAt: 'desc' },
      take: Math.min(limit, 100),
      include: { connection: { select: { key: true, supplier: { select: { name: true } } } } },
    })
    return runs.map((r) => this.naarRunWeergave(r))
  }

  async runById(id: string) {
    const run = await this.prisma.db.importRun.findUnique({
      where: { id },
      include: { connection: { select: { key: true, supplier: { select: { name: true } } } } },
    })
    if (!run) throw new NotFoundError('Deze import bestaat niet.')
    return this.naarRunWeergave(run)
  }

  async changesFor(importRunId: string) {
    await this.runById(importRunId)
    const wijzigingen = await this.prisma.db.stagedChange.findMany({
      where: { importRunId },
      orderBy: [{ changeType: 'asc' }, { externalId: 'asc' }],
    })
    return wijzigingen.map((w) => ({
      id: w.id,
      entityType: w.entityType,
      entityId: w.entityId,
      externalId: w.externalId,
      changeType: w.changeType,
      status: w.status,
      diff: (w.diff ?? {}) as Record<string, unknown>,
      createdAt: w.createdAt.toISOString(),
    }))
  }

  /** Welke koppelingen er zijn, en of er code bestaat die ze kan uitvoeren. */
  async listConnections() {
    const verbindingen = await this.prisma.db.supplierConnection.findMany({
      orderBy: [{ supplier: { name: 'asc' } }, { key: 'asc' }],
      include: { capabilities: true, supplier: { select: { name: true } } },
    })

    return verbindingen.map((v) => {
      let beschikbaar: string[] = []
      try {
        beschikbaar =
          this.registry.list().find((c) => c.key === v.connectorKey)?.capabilities ?? []
      } catch {
        beschikbaar = []
      }

      return {
        key: v.key,
        supplierName: v.supplier.name,
        connectorKey: v.connectorKey,
        transport: v.transport,
        isActive: v.isActive,
        hasCredentials: !!v.credentials && v.credentials.length > 0,
        notes: v.notes,
        lastRunAt: v.lastRunAt?.toISOString() ?? null,
        environment: String((v.config as Record<string, unknown>)?.environment ?? 'test'),
        capabilities: v.capabilities
          .sort((a, b) => a.capability.localeCompare(b.capability))
          .map((c) => ({
            capability: c.capability,
            isEnabled: c.isEnabled,
            schedule: c.schedule,
            hasConnector: beschikbaar.includes(c.capability),
          })),
      }
    })
  }

  private naarRunWeergave(run: {
    id: string
    capability: ConnectorCapability
    status: string
    dryRun: boolean
    startedAt: Date
    finishedAt: Date | null
    itemsSeen: number
    itemsChanged: number
    itemsFailed: number
    errorSummary: string | null
    log: unknown
    connection: { key: string; supplier: { name: string } }
  }) {
    return {
      id: run.id,
      connectionKey: run.connection.key,
      supplierName: run.connection.supplier.name,
      capability: run.capability,
      status: run.status as 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'CANCELLED',
      dryRun: run.dryRun,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
      itemsSeen: run.itemsSeen,
      itemsChanged: run.itemsChanged,
      itemsFailed: run.itemsFailed,
      errorSummary: run.errorSummary,
      summary: (run.log ?? null) as
        | { created: number; updated: number; unchanged: number; missing: number }
        | null,
    }
  }

  private async noteerItem(
    importRunId: string,
    externalId: string,
    status: 'OK' | 'SKIPPED' | 'FAILED',
    message?: string,
  ) {
    await this.prisma.db.importItem.create({
      data: { importRunId, externalId, status, message: message ?? null },
    })
  }
}
