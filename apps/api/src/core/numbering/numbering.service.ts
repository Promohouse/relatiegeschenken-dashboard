import { Injectable } from '@nestjs/common'
import { issueNumber, renderNumberFormat, type Prisma } from '@rgh/db'
import { PrismaService } from '../prisma/prisma.service'
import { NotFoundError, ValidationFailedError } from '../errors/domain-errors'

/**
 * Uitgifte van klant-, offerte-, order-, inkooporder- en zendingnummers.
 *
 * Formaat en startwaarde zijn instelbaar, ook nadat er al nummers zijn
 * uitgegeven, zodat reeksen uit Teamleader voortgezet kunnen worden
 * (ADR-0005). Uitgifte gebeurt onder een rij-lock; een uitgegeven nummer
 * wordt nooit hergebruikt.
 */
@Injectable()
export class NumberingService {
  constructor(private readonly prisma: PrismaService) {}

  /** Geeft het volgende nummer uit in een eigen transactie. */
  async issue(key: string, year = new Date().getFullYear()): Promise<string> {
    try {
      return await this.prisma.db.$transaction((tx) => issueNumber(tx, key, year))
    } catch (error) {
      throw this.vertaal(error, key, year)
    }
  }

  /**
   * Geeft een nummer uit binnen een bestaande transactie. Gebruik dit wanneer
   * het nummer en het record dat het draagt samen moeten slagen of falen.
   */
  async issueIn(tx: Prisma.TransactionClient, key: string, year = new Date().getFullYear()) {
    try {
      return await issueNumber(tx, key, year)
    } catch (error) {
      throw this.vertaal(error, key, year)
    }
  }

  /** Toont hoe het volgende nummer eruit zou zien, zonder het uit te geven. */
  async preview(key: string, year = new Date().getFullYear()): Promise<string> {
    const reeks = await this.prisma.db.numberSequence.findUnique({
      where: { key_year: { key, year } },
    })
    if (!reeks) throw this.ontbreekt(key, year)
    return renderNumberFormat(reeks.format, { year, counter: reeks.lastValue + 1 })
  }

  /**
   * Wijzigt formaat of teller. Verlagen van de teller wordt geweigerd: dan
   * zou een al uitgegeven nummer opnieuw uitgedeeld kunnen worden.
   */
  async configure(
    key: string,
    year: number,
    wijziging: { format?: string; lastValue?: number },
  ) {
    const reeks = await this.prisma.db.numberSequence.findUnique({
      where: { key_year: { key, year } },
    })
    if (!reeks) throw this.ontbreekt(key, year)

    if (wijziging.lastValue != null && wijziging.lastValue < reeks.lastValue) {
      throw new ValidationFailedError(
        `De teller van reeks "${key}" staat op ${reeks.lastValue} en kan niet omlaag naar ` +
          `${wijziging.lastValue}: dan zou een al uitgegeven nummer opnieuw uitgedeeld worden.`,
      )
    }

    return this.prisma.db.numberSequence.update({
      where: { key_year: { key, year } },
      data: wijziging,
    })
  }

  private ontbreekt(key: string, year: number) {
    return new NotFoundError(
      `Nummerreeks "${key}" voor jaar ${year} bestaat niet. ` +
        'Maak hem aan bij Instellingen voordat er nummers uitgegeven worden.',
    )
  }

  private vertaal(error: unknown, key: string, year: number): unknown {
    const melding = error instanceof Error ? error.message : String(error)
    return /bestaat niet/i.test(melding) ? this.ontbreekt(key, year) : error
  }
}
