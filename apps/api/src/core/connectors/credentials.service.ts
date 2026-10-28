import { Injectable } from '@nestjs/common'
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'
import { AppConfig } from '../config/config.service'
import { PreconditionError } from '../errors/domain-errors'

/**
 * Credentials van leverancierskoppelingen versleuteld opslaan.
 *
 * Ze staan in `supplier_connections.credentials` als bytes, niet in de code,
 * niet in `.env` per leverancier en niet in een omgevingsvariabele per
 * koppeling. Reden: wie de database leest heeft dan nog geen sleutels, en een
 * koppeling toevoegen vraagt geen herstart.
 *
 * AES-256-GCM, dus de ciphertext draagt zijn eigen echtheidscontrole: een
 * gewijzigde rij in de database ontsleutelt niet, hij faalt.
 *
 * Opbouw van de opgeslagen bytes: [salt 16][iv 12][tag 16][ciphertext].
 */

const SALT_BYTES = 16
const IV_BYTES = 12
const TAG_BYTES = 16

@Injectable()
export class CredentialsService {
  constructor(private readonly config: AppConfig) {}

  /**
   * Afgeleide sleutel per record: het salt staat bij de ciphertext, dus twee
   * koppelingen met dezelfde credentials leveren verschillende bytes op.
   */
  private afgeleideSleutel(salt: Buffer): Buffer {
    return scryptSync(this.config.env.CONNECTOR_SECRET_KEY, salt, 32)
  }

  encrypt(waarden: Record<string, string>): Buffer {
    const salt = randomBytes(SALT_BYTES)
    const iv = randomBytes(IV_BYTES)
    const cipher = createCipheriv('aes-256-gcm', this.afgeleideSleutel(salt), iv)
    const inhoud = Buffer.concat([
      cipher.update(JSON.stringify(waarden), 'utf8'),
      cipher.final(),
    ])
    return Buffer.concat([salt, iv, cipher.getAuthTag(), inhoud])
  }

  decrypt(opgeslagen: Uint8Array | null | undefined): Record<string, string> {
    if (!opgeslagen || opgeslagen.length === 0) {
      throw new PreconditionError(
        'Voor deze koppeling zijn geen credentials opgeslagen. Voer ze eerst in.',
      )
    }

    const buffer = Buffer.from(opgeslagen)
    if (buffer.length <= SALT_BYTES + IV_BYTES + TAG_BYTES) {
      throw new PreconditionError('De opgeslagen credentials zijn onvolledig.')
    }

    const salt = buffer.subarray(0, SALT_BYTES)
    const iv = buffer.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES)
    const tag = buffer.subarray(SALT_BYTES + IV_BYTES, SALT_BYTES + IV_BYTES + TAG_BYTES)
    const inhoud = buffer.subarray(SALT_BYTES + IV_BYTES + TAG_BYTES)

    try {
      const decipher = createDecipheriv('aes-256-gcm', this.afgeleideSleutel(salt), iv)
      decipher.setAuthTag(tag)
      const klaar = Buffer.concat([decipher.update(inhoud), decipher.final()])
      return JSON.parse(klaar.toString('utf8')) as Record<string, string>
    } catch {
      // Geen details naar buiten: of de sleutel is gewijzigd, of de rij is
      // aangepast. Beide zijn hetzelfde probleem voor de gebruiker.
      throw new PreconditionError(
        'De credentials van deze koppeling kunnen niet ontsleuteld worden. Is CONNECTOR_SECRET_KEY ' +
          'gewijzigd? Voer de credentials opnieuw in.',
      )
    }
  }

  /**
   * Eén waarde eruit, met een melding die zegt welke ontbreekt. Zonder dit
   * krijg je `undefined` in een Authorization-header en een onbegrijpelijke
   * 401 van de leverancier.
   */
  require(opgeslagen: Uint8Array | null | undefined, veld: string): string {
    const waarde = this.decrypt(opgeslagen)[veld]
    if (!waarde) {
      throw new PreconditionError(
        `De credentials van deze koppeling bevatten geen "${veld}".`,
      )
    }
    return waarde
  }
}
