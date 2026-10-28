import { Injectable } from '@nestjs/common'
import Decimal from 'decimal.js'
import type { Prisma } from '@rgh/db'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'
import { RequestContext } from '../../core/context/request-context'
import { ConnectorRegistry } from '../../core/connectors/connector.registry'
import type { CanonicalProduct } from '../../core/connectors/connector.types'
import { ConflictError, NotFoundError, PreconditionError } from '../../core/errors/domain-errors'

export interface ApplyResult {
  applied: number
  rejected: number
  /** Wijzigingen die niet toegepast konden worden, met de reden. */
  skipped: { id: string; externalId: string | null; reason: string }[]
}

/** Velden die een import mag zetten. Alles daarbuiten is van ons. */
const TOEGESTANE_VELDEN = new Set([
  'name', 'description', 'brand', 'material', 'dimensions', 'countryOfOrigin',
  'commodityCode', 'printable', 'isActive',
])

/**
 * Voorgestelde wijzigingen beoordelen en toepassen.
 *
 * Dit is het moment waarop externe data daadwerkelijk de catalogus raakt, en
 * daarom het punt met de meeste waarborgen:
 *
 * - alleen een echte import kan toegepast worden, geen proefimport: wat
 *   toegepast wordt moet terug te voeren zijn op vastgelegde brondata;
 * - de huidige waarde moet nog overeenkomen met wat bij het importeren gezien
 *   is, anders is er sindsdien iets veranderd en wordt er geweigerd;
 * - een variant die verdwijnt gaat op inactief, nooit weg (harde regel 12);
 * - elke toepassing komt in het auditlog, met wie en wanneer.
 */
@Injectable()
export class StagedChangesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly registry: ConnectorRegistry,
  ) {}

  async apply(changeId: string): Promise<ApplyResult> {
    const wijziging = await this.haalOp(changeId)
    const resultaat: ApplyResult = { applied: 0, rejected: 0, skipped: [] }
    await this.pasToe(wijziging, resultaat)
    return resultaat
  }

  async reject(changeId: string): Promise<void> {
    const wijziging = await this.haalOp(changeId)
    this.moetOpenStaan(wijziging)

    await this.prisma.db.stagedChange.update({
      where: { id: changeId },
      data: {
        status: 'REJECTED',
        reviewedById: RequestContext.get()?.userId ?? null,
        reviewedAt: new Date(),
      },
    })

    await this.audit.record({
      entity: 'StagedChange',
      entityId: changeId,
      action: 'UPDATE',
      diff: { status: { van: 'PENDING', naar: 'REJECTED' } },
    })
  }

  /**
   * Alles van één import in één keer.
   *
   * Niet in één transactie: een wijziging die niet meer klopt mag de rest niet
   * tegenhouden. Wat niet lukt komt met reden terug, zodat het scherm kan
   * tonen wat er is blijven liggen.
   */
  async applyRun(importRunId: string): Promise<ApplyResult> {
    const run = await this.prisma.db.importRun.findUnique({ where: { id: importRunId } })
    if (!run) throw new NotFoundError('Deze import bestaat niet.')

    const open = await this.prisma.db.stagedChange.findMany({
      where: { importRunId, status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    })

    const resultaat: ApplyResult = { applied: 0, rejected: 0, skipped: [] }
    for (const wijziging of open) {
      const volledig = await this.haalOp(wijziging.id)
      try {
        await this.pasToe(volledig, resultaat)
      } catch (fout) {
        resultaat.skipped.push({
          id: wijziging.id,
          externalId: wijziging.externalId,
          reason: fout instanceof Error ? fout.message : String(fout),
        })
      }
    }
    return resultaat
  }

  // --- Toepassen -----------------------------------------------------------

  private async pasToe(wijziging: VolledigeWijziging, resultaat: ApplyResult) {
    this.moetOpenStaan(wijziging)

    if (wijziging.importRun.dryRun) {
      throw new PreconditionError(
        'Dit komt uit een proefimport. Die legt de brongegevens niet vast, dus er valt niets toe ' +
          'te passen. Draai eerst een echte import.',
      )
    }
    if (wijziging.entityType === 'ProductSupplier') {
      const koppelingId = await this.wijzigInkoopprijs(wijziging)
      await this.rondAf(wijziging, koppelingId, 'ProductSupplier')
      resultaat.applied++
      return
    }

    if (wijziging.entityType !== 'Product') {
      throw new PreconditionError(
        `Wijzigingen op ${wijziging.entityType} kunnen nog niet toegepast worden.`,
      )
    }

    const productId =
      wijziging.changeType === 'CREATE'
        ? await this.maakProduct(wijziging)
        : await this.wijzigProduct(wijziging)

    await this.prisma.db.stagedChange.update({
      where: { id: wijziging.id },
      data: {
        status: 'APPLIED',
        entityId: productId,
        reviewedById: RequestContext.get()?.userId ?? null,
        reviewedAt: new Date(),
        appliedAt: new Date(),
      },
    })

    await this.audit.record({
      entity: 'Product',
      entityId: productId,
      action: wijziging.changeType === 'CREATE' ? 'CREATE' : 'UPDATE',
      diff: {
        ...this.auditDiff(wijziging.diff),
        bron: {
          van: null,
          naar: `Import ${wijziging.importRun.id} van ${wijziging.importRun.connection.key}`,
        },
      },
    })

    resultaat.applied++
  }

  /**
   * Inkoopprijs en staffels van een leveranciersartikel bijwerken.
   *
   * De staffels worden vervangen, niet samengevoegd: een staffel die de
   * leverancier niet meer levert hoort te verdwijnen, anders blijft een oude
   * drempel meerekenen. Dat mag hier, anders dan bij producten, omdat een
   * order zijn prijzen bij aanmaak kopieert (harde regel 3) en dus niet van
   * deze rijen afhangt.
   */
  private async wijzigInkoopprijs(wijziging: VolledigeWijziging): Promise<string> {
    if (!wijziging.entityId) {
      throw new PreconditionError('Deze wijziging verwijst niet naar een leverancierskoppeling.')
    }

    const koppeling = await this.prisma.db.productSupplier.findUnique({
      where: { id: wijziging.entityId },
      include: { purchaseTiers: { orderBy: { minQuantity: 'asc' } } },
    })
    if (!koppeling) {
      throw new NotFoundError('De leverancierskoppeling van deze wijziging bestaat niet meer.')
    }

    const prijs = wijziging.diff.purchasePrice as { van: string; naar: string } | undefined
    if (prijs) {
      const nu = koppeling.purchasePrice.toString()
      // Op vier decimalen vergelijken: de database geeft "4.22" terug waar de
      // import "4.2200" zag, en dat is hetzelfde bedrag.
      if (new Decimal(nu).toFixed(4) !== new Decimal(prijs.van).toFixed(4)) {
        throw new ConflictError(
          `De inkoopprijs is sinds de import gewijzigd (nu ${nu}, bij de import ${prijs.van}). ` +
            'Draai de import opnieuw zodat het voorstel klopt.',
        )
      }
    }

    const staffels = wijziging.diff.staffels as
      | { van: unknown; naar: { minimumQuantity: number; unitPrice: string }[] }
      | undefined
    const valuta = wijziging.diff.currency as { van: string; naar: string } | undefined

    await this.prisma.unscoped.$transaction(async (tx) => {
      if (prijs || valuta) {
        await tx.productSupplier.update({
          where: { id: koppeling.id },
          data: {
            ...(prijs ? { purchasePrice: prijs.naar } : {}),
            ...(valuta ? { currency: valuta.naar } : {}),
          },
        })
      }

      if (staffels) {
        await tx.purchasePriceTier.deleteMany({ where: { productSupplierId: koppeling.id } })
        if (staffels.naar.length > 0) {
          await tx.purchasePriceTier.createMany({
            data: staffels.naar.map((t) => ({
              productSupplierId: koppeling.id,
              minQuantity: t.minimumQuantity,
              unitPrice: t.unitPrice,
            })),
          })
        }
      }
    })

    return koppeling.id
  }

  /** De administratie na een geslaagde toepassing. */
  private async rondAf(wijziging: VolledigeWijziging, entityId: string, entity: string) {
    await this.prisma.db.stagedChange.update({
      where: { id: wijziging.id },
      data: {
        status: 'APPLIED',
        entityId,
        reviewedById: RequestContext.get()?.userId ?? null,
        reviewedAt: new Date(),
        appliedAt: new Date(),
      },
    })

    await this.audit.record({
      entity,
      entityId,
      action: 'UPDATE',
      diff: {
        ...this.auditDiff(wijziging.diff),
        bron: {
          van: null,
          naar: `Import ${wijziging.importRun.id} van ${wijziging.importRun.connection.key}`,
        },
      },
    })
  }

  /**
   * Een nieuw product uit de vastgelegde brondata.
   *
   * De diff is niet genoeg om een product mee te maken: die bevat alleen de
   * gewijzigde velden en een lijst variantnummers. De volledige gegevens komen
   * uit `raw_supplier_products`, via dezelfde connector die ze ophaalde. Zo is
   * wat er in de catalogus komt altijd terug te voeren op wat de leverancier
   * werkelijk stuurde.
   */
  private async maakProduct(wijziging: VolledigeWijziging): Promise<string> {
    const bron = await this.bronProduct(wijziging)
    const verbinding = wijziging.importRun.connection

    const articleNumber = await this.vrijArtikelnummer(bron.articleNumber, verbinding.supplier.code)

    const product = await this.prisma.unscoped.$transaction(async (tx) => {
      const nieuw = await tx.product.create({
        data: {
          articleNumber,
          name: bron.name,
          description: bron.longDescription ?? bron.shortDescription,
          brand: bron.brand,
          material: bron.material,
          dimensions: bron.dimensions,
          countryOfOrigin: bron.countryOfOrigin,
          commodityCode: bron.commodityCode,
          printable: bron.printable,
          variants: {
            create: bron.variants.map((v) => ({
              sku: v.sku,
              colorName: v.colorName,
              colorCode: v.colorCode,
              colorGroup: v.colorGroup,
              pmsColor: v.pmsColor,
              size: v.sizeCode,
              eanCode: v.gtin,
            })),
          },
        },
      })

      // De koppeling met de leverancier. De inkoopprijs komt uit de
      // prijslijst, niet uit de catalogus; tot die import bestaat staat hij op
      // nul en is het product nog niet verkoopbaar.
      await tx.productSupplier.create({
        data: {
          productId: nieuw.id,
          supplierId: verbinding.supplierId,
          supplierArticleNumber: bron.externalId,
          purchasePrice: '0.0000',
          isPreferred: true,
        },
      })

      return nieuw
    })

    return product.id
  }

  private async wijzigProduct(wijziging: VolledigeWijziging): Promise<string> {
    if (!wijziging.entityId) {
      throw new PreconditionError('Deze wijziging verwijst niet naar een bestaand product.')
    }

    const huidig = await this.prisma.db.product.findUnique({
      where: { id: wijziging.entityId },
      include: { variants: { select: { id: true, sku: true, isActive: true } } },
    })
    if (!huidig) throw new NotFoundError('Het product van deze wijziging bestaat niet meer.')

    const velden: Record<string, unknown> = {}
    for (const [veld, waarde] of Object.entries(wijziging.diff)) {
      if (veld === 'varianten' || veld === 'reden' || veld === 'articleNumber') continue
      if (!TOEGESTANE_VELDEN.has(veld)) continue

      const { van, naar } = waarde as { van: unknown; naar: unknown }
      const nu = (huidig as unknown as Record<string, unknown>)[veld] ?? null
      // Sinds het importeren veranderd: dan is dit voorstel achterhaald en
      // zou toepassen iemands werk overschrijven.
      if ((nu ?? null) !== (van ?? null)) {
        throw new ConflictError(
          `Het veld "${veld}" is sinds de import gewijzigd (nu "${nu}", bij de import "${van}"). ` +
            'Draai de import opnieuw zodat het voorstel klopt.',
        )
      }
      velden[veld] = naar
    }

    await this.prisma.unscoped.$transaction(async (tx) => {
      if (Object.keys(velden).length > 0) {
        await tx.product.update({ where: { id: huidig.id }, data: velden })
      }

      const varianten = wijziging.diff.varianten as
        | { van: string[] | null; naar: string[] | null }
        | undefined
      if (varianten) {
        await this.werkVariantenBij(tx, wijziging, huidig, varianten)
      }
    })

    return huidig.id
  }

  /**
   * Nieuwe varianten erbij, verdwenen varianten op inactief.
   *
   * Verwijderen gebeurt niet: aan een variant kunnen orderregels hangen, en
   * een kleur die uit de collectie gaat blijft in de orderhistorie bestaan.
   */
  private async werkVariantenBij(
    tx: Prisma.TransactionClient,
    wijziging: VolledigeWijziging,
    huidig: { id: string; variants: { id: string; sku: string; isActive: boolean }[] },
    varianten: { van: string[] | null; naar: string[] | null },
  ) {
    const erbij = varianten.naar ?? []
    const eraf = varianten.van ?? []

    if (erbij.length > 0) {
      const bron = await this.bronProduct(wijziging)
      const perSku = new Map(bron.variants.map((v) => [v.sku, v]))

      for (const sku of erbij) {
        const nieuw = perSku.get(sku)
        if (!nieuw) continue
        // Een sku is uniek over de hele catalogus; bestaat hij al bij een
        // ander product, dan is dat een botsing die een mens moet bekijken.
        const bestaat = await tx.productVariant.findUnique({ where: { sku }, select: { id: true } })
        if (bestaat) continue

        await tx.productVariant.create({
          data: {
            productId: huidig.id,
            sku: nieuw.sku,
            colorName: nieuw.colorName,
            colorCode: nieuw.colorCode,
            colorGroup: nieuw.colorGroup,
            pmsColor: nieuw.pmsColor,
            size: nieuw.sizeCode,
            eanCode: nieuw.gtin,
          },
        })
      }
    }

    for (const sku of eraf) {
      const bestaand = huidig.variants.find((v) => v.sku === sku)
      if (bestaand?.isActive) {
        await tx.productVariant.update({ where: { id: bestaand.id }, data: { isActive: false } })
      }
    }
  }

  /**
   * De volledige brongegevens achter deze wijziging, opnieuw vertaald door de
   * connector die ze ophaalde.
   */
  private async bronProduct(wijziging: VolledigeWijziging): Promise<CanonicalProduct> {
    if (!wijziging.externalId) {
      throw new PreconditionError('Deze wijziging heeft geen leveranciersartikelnummer.')
    }

    const rauw = await this.prisma.db.rawSupplierProduct.findUnique({
      where: {
        connectionId_externalId: {
          connectionId: wijziging.importRun.connectionId,
          externalId: wijziging.externalId,
        },
      },
    })
    if (!rauw) {
      throw new PreconditionError(
        `De brongegevens van ${wijziging.externalId} zijn niet vastgelegd. Draai een echte import ` +
          'voordat je deze wijziging toepast.',
      )
    }

    const connector = this.registry.get(wijziging.importRun.connection.connectorKey, 'CATALOG')
    if (!connector.parseProduct) {
      throw new PreconditionError(
        `Connector ${connector.key} kan opgeslagen brondata niet opnieuw vertalen.`,
      )
    }
    return connector.parseProduct(rauw.payload)
  }

  /**
   * Het artikelnummer van de leverancier als eigen nummer, tenzij het al
   * bezet is. Dan met de leverancierscode ervoor, zodat twee leveranciers met
   * dezelfde code elkaar niet in de weg zitten.
   */
  private async vrijArtikelnummer(voorkeur: string, leverancierscode: string): Promise<string> {
    const bestaat = async (nummer: string) =>
      !!(await this.prisma.db.product.findUnique({ where: { articleNumber: nummer }, select: { id: true } }))

    if (!(await bestaat(voorkeur))) return voorkeur

    const metPrefix = `${leverancierscode}-${voorkeur}`
    if (!(await bestaat(metPrefix))) return metPrefix

    throw new ConflictError(
      `Er bestaat al een product met artikelnummer ${voorkeur} en met ${metPrefix}. Geef het ` +
        'bestaande product de juiste leverancierskoppeling, of kies handmatig een nummer.',
    )
  }

  // --- Hulpjes -------------------------------------------------------------

  private async haalOp(id: string): Promise<VolledigeWijziging> {
    const wijziging = await this.prisma.db.stagedChange.findUnique({
      where: { id },
      include: {
        importRun: {
          select: {
            id: true,
            dryRun: true,
            connectionId: true,
            connection: {
              select: {
                key: true,
                connectorKey: true,
                supplierId: true,
                supplier: { select: { code: true } },
              },
            },
          },
        },
      },
    })
    if (!wijziging) throw new NotFoundError('Deze voorgestelde wijziging bestaat niet.')
    return { ...wijziging, diff: (wijziging.diff ?? {}) as Record<string, unknown> }
  }

  private moetOpenStaan(wijziging: { status: string }) {
    if (wijziging.status !== 'PENDING') {
      throw new ConflictError(
        wijziging.status === 'APPLIED'
          ? 'Deze wijziging is al toegepast.'
          : 'Deze wijziging is al afgewezen.',
      )
    }
  }

  private auditDiff(diff: Record<string, unknown>) {
    const schoon: Record<string, { van: unknown; naar: unknown }> = {}
    for (const [veld, waarde] of Object.entries(diff)) {
      if (waarde && typeof waarde === 'object' && 'van' in waarde && 'naar' in waarde) {
        schoon[veld] = waarde as { van: unknown; naar: unknown }
      }
    }
    return schoon
  }
}

/** Een voorgestelde wijziging met de import en de koppeling erbij. */
interface VolledigeWijziging {
  id: string
  entityType: string
  entityId: string | null
  externalId: string | null
  changeType: 'CREATE' | 'UPDATE' | 'DELETE'
  status: string
  diff: Record<string, unknown>
  importRun: {
    id: string
    dryRun: boolean
    connectionId: string
    connection: {
      key: string
      connectorKey: string
      supplierId: string
      supplier: { code: string }
    }
  }
}
