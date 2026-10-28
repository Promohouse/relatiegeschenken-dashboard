/**
 * Credentials van een leverancierskoppeling opslaan, versleuteld.
 *
 * Gebruik:
 *   MIDOCEAN_API_KEY=... npm run connection:credentials -w @rgh/api -- midocean-api apiKey=MIDOCEAN_API_KEY
 *
 * De waarde komt uit een omgevingsvariabele, niet uit een argument: een
 * argument belandt in de shell-geschiedenis en in de procestabel. Op het
 * scherm en in de logregels verschijnt de sleutel nooit.
 *
 * Opslag gebeurt met CredentialsService, dus met AES-256-GCM en een eigen
 * salt per rij. Zie ADR-0013.
 */
import { createPrismaClient } from '@rgh/db'
import { AppConfig } from '../src/core/config/config.service'
import { CredentialsService } from '../src/core/connectors/credentials.service'

function toon(waarde: string): string {
  if (waarde.length <= 8) return '••••'
  return `${waarde.slice(0, 4)}…${waarde.slice(-4)} (${waarde.length} tekens)`
}

async function main() {
  const [connectionKey, ...paren] = process.argv.slice(2)
  if (!connectionKey || paren.length === 0) {
    throw new Error(
      'Gebruik: set-connection-credentials <koppelsleutel> <veld>=<NAAM_VAN_OMGEVINGSVARIABELE> ...\n' +
        'Bijvoorbeeld: midocean-api apiKey=MIDOCEAN_API_KEY',
    )
  }

  const url = process.env.DATABASE_URL
  const prefix = process.env.DB_NAME_PREFIX
  const naam = url ? new URL(url).pathname.replace(/^\//, '') : ''
  if (!prefix || !naam.startsWith(prefix)) {
    throw new Error(`Geweigerd: database "${naam}" valt buiten DB_NAME_PREFIX "${prefix}".`)
  }

  const waarden: Record<string, string> = {}
  for (const paar of paren) {
    const [veld, envNaam] = paar.split('=')
    if (!veld || !envNaam) throw new Error(`"${paar}" moet eruitzien als veld=OMGEVINGSVARIABELE.`)
    const waarde = process.env[envNaam]
    if (!waarde) {
      throw new Error(
        `De omgevingsvariabele ${envNaam} is leeg. Zet hem voor dit commando, bijvoorbeeld:\n` +
          `  ${envNaam}='...' npm run connection:credentials -w @rgh/api -- ${connectionKey} ${paar}`,
      )
    }
    waarden[veld] = waarde
  }

  const db = createPrismaClient(url, 2)
  const verbinding = await db.supplierConnection.findUnique({ where: { key: connectionKey } })
  if (!verbinding) throw new Error(`Er is geen koppeling met de sleutel "${connectionKey}".`)

  const credentials = new CredentialsService(new AppConfig())
  const bytes = credentials.encrypt(waarden)

  await db.supplierConnection.update({
    where: { key: connectionKey },
    data: { credentials: new Uint8Array(bytes) },
  })

  // Terugleesproef: zo weet je zeker dat CONNECTOR_SECRET_KEY klopt en de rij
  // bruikbaar is, zonder de waarde te tonen.
  const terug = credentials.decrypt(
    (await db.supplierConnection.findUniqueOrThrow({ where: { key: connectionKey } })).credentials,
  )

  console.log(`  credentials opgeslagen voor "${connectionKey}" (${verbinding.transport})`)
  for (const [veld, waarde] of Object.entries(terug)) {
    console.log(`    ${veld}: ${toon(waarde)}`)
  }
  console.log('  teruglezen gelukt; de sleutel staat versleuteld in de database.')

  await db.$disconnect()
}

main().catch((fout) => {
  console.error(fout instanceof Error ? fout.message : fout)
  process.exit(1)
})
