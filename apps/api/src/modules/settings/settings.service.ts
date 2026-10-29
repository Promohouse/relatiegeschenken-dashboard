import { Injectable } from '@nestjs/common'
import type {
  CompanySettings, ShippingMethod, UpdateCompanySettings, UpdateShippingMethods,
} from '@rgh/contracts'
import { PrismaService } from '../../core/prisma/prisma.service'
import { AuditService } from '../../core/audit/audit.service'

/** De sleutel in `settings` per veld van de bedrijfsgegevens. */
const BEDRIJFSVELDEN: Record<keyof CompanySettings, string> = {
  name: 'company.name',
  street: 'company.street',
  postalCode: 'company.postalCode',
  city: 'company.city',
  country: 'company.country',
  phone: 'company.phone',
  email: 'company.email',
  website: 'company.website',
  chamberOfCommerce: 'company.chamberOfCommerce',
  vatNumber: 'company.vatNumber',
  iban: 'company.iban',
  slogan: 'company.slogan',
  logoLight: 'company.logoLight',
  logoDark: 'company.logoDark',
}

/**
 * Instellingen lezen en wijzigen.
 *
 * Bedrijfsgegevens staan in de database en niet in de code: ze komen op
 * offertes, orderbevestigingen en facturen, en een verhuizing of een nieuw
 * rekeningnummer hoort geen nieuwe versie van de software te vragen.
 */
@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Aantallen waarvoor de calculator standaard een staffel toont.
   *
   * Een instelling en geen vaste lijst in de code: welke aantallen zinvol
   * zijn verschilt per handel, en in deze handel per seizoen.
   */
  async tierQuantities(): Promise<number[]> {
    const rij = await this.prisma.db.setting.findUnique({ where: { key: 'quote.tierQuantities' } })
    const waarde = rij?.value
    if (!Array.isArray(waarde)) return [50, 100, 250, 500, 1000]

    const aantallen = waarde
      .map((v) => Number(v))
      .filter((v) => Number.isInteger(v) && v > 0)
      .sort((a, b) => a - b)
    return aantallen.length > 0 ? aantallen : [50, 100, 250, 500, 1000]
  }

  /**
   * Verzendwijzen voor de calculator, met wat ze kosten en wat de klant
   * bijdraagt.
   *
   * Zonder instelling een lege lijst en geen verzonnen bedragen: een
   * standaard van negen euro vijftig die niet klopt is erger dan geen
   * keuzelijst, want hij wordt wel gebruikt.
   */
  async shippingMethods(): Promise<ShippingMethod[]> {
    const rij = await this.prisma.db.setting.findUnique({ where: { key: 'shipping.methods' } })
    if (!Array.isArray(rij?.value)) return []

    return rij.value.flatMap((waarde) => {
      if (typeof waarde !== 'object' || waarde === null) return []
      const w = waarde as Record<string, unknown>
      if (typeof w.name !== 'string' || w.name.trim() === '') return []
      return [{
        name: w.name,
        cost: String(w.cost ?? '0'),
        contribution: String(w.contribution ?? '0'),
      }]
    })
  }

  async updateShippingMethods(input: UpdateShippingMethods): Promise<ShippingMethod[]> {
    const voor = await this.shippingMethods()

    await this.prisma.db.setting.upsert({
      where: { key: 'shipping.methods' },
      update: { value: input },
      create: {
        key: 'shipping.methods',
        value: input,
        description:
          'Verzendwijzen voor de calculator: wat de verzending ons kost en wat de klant eraan ' +
          'bijdraagt.',
      },
    })

    const na = await this.shippingMethods()
    await this.audit.record({
      entity: 'Setting',
      entityId: 'shipping.methods',
      action: 'UPDATE',
      diff: { shippingMethods: { van: voor, naar: na } },
    })
    return na
  }

  /**
   * Hoeveel dagen een offerte geldig is. Een instelling en geen vast getal:
   * dertig dagen is gebruikelijk, maar niet in elke markt.
   */
  async quoteValidityDays(): Promise<number> {
    const rij = await this.prisma.db.setting.findUnique({ where: { key: 'quote.validityDays' } })
    const waarde = Number(rij?.value)
    return Number.isInteger(waarde) && waarde > 0 ? waarde : 30
  }

  async company(): Promise<CompanySettings> {
    const rijen = await this.prisma.db.setting.findMany({
      where: { key: { in: Object.values(BEDRIJFSVELDEN) } },
    })
    const waarden = new Map(rijen.map((r) => [r.key, r.value]))

    const gegevens = {} as CompanySettings
    for (const [veld, sleutel] of Object.entries(BEDRIJFSVELDEN)) {
      const waarde = waarden.get(sleutel)
      gegevens[veld as keyof CompanySettings] = typeof waarde === 'string' ? waarde : ''
    }
    return gegevens
  }

  async updateCompany(input: UpdateCompanySettings): Promise<CompanySettings> {
    const voor = await this.company()

    for (const [veld, sleutel] of Object.entries(BEDRIJFSVELDEN)) {
      const nieuw = input[veld as keyof UpdateCompanySettings]
      if (nieuw === undefined) continue
      await this.prisma.db.setting.upsert({
        where: { key: sleutel },
        update: { value: nieuw },
        create: { key: sleutel, value: nieuw },
      })
    }

    const na = await this.company()
    const diff: Record<string, { van: unknown; naar: unknown }> = {}
    for (const veld of Object.keys(BEDRIJFSVELDEN) as (keyof CompanySettings)[]) {
      if (voor[veld] !== na[veld]) diff[veld] = { van: voor[veld], naar: na[veld] }
    }

    if (Object.keys(diff).length > 0) {
      await this.audit.record({
        entity: 'Setting',
        entityId: 'company',
        action: 'UPDATE',
        diff,
      })
    }
    return na
  }
}
