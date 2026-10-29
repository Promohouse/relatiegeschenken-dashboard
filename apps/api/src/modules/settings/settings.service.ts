import { Injectable } from '@nestjs/common'
import type { CompanySettings, UpdateCompanySettings } from '@rgh/contracts'
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
