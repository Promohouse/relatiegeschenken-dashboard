import type { Db } from '@rgh/db'

/**
 * Klantisolatie (harde regel 5 uit CLAUDE.md, SECURITY.md paragraaf 3).
 *
 * Een klant mag nooit gegevens van een andere klant zien, ook niet door een
 * id in de URL aan te passen. Dat wordt hier afgedwongen op de laag waar het
 * niet te vergeten is: elke query vanuit een portaalsessie krijgt verplicht
 * een filter op de eigen klant.
 *
 * Modellen die geen klantgebonden gegevens bevatten - producten, leveranciers,
 * bedrukkingstechnieken - staan hier bewust niet in; die zijn voor iedereen
 * gelijk. Een model dat hier ontbreekt terwijl het wel klantgegevens draagt is
 * een lek, dus bij een nieuw model hoort een regel in deze lijst.
 */
const SCOPE_PER_MODEL: Record<string, (customerId: string) => object> = {
  customer: (customerId) => ({ id: customerId }),
  contactPerson: (customerId) => ({ customerId }),
  address: (customerId) => ({ customerId }),
  customerAgreement: (customerId) => ({ customerId }),
  // Een prijsafspraak is klantgebonden: een klant in het portaal mag nooit de
  // afspraken van een andere klant zien, want daaruit volgen onze marges.
  customerPriceAgreement: (customerId) => ({ customerId }),
  quote: (customerId) => ({ customerId }),
  order: (customerId) => ({ customerId }),
  document: (customerId) => ({ customerId }),
  task: (customerId) => ({ customerId }),
  shopChannel: (customerId) => ({ customerId }),
  shipment: (customerId) => ({ order: { customerId } }),
  orderLine: (customerId) => ({ order: { customerId } }),
  orderEvent: (customerId) => ({ order: { customerId } }),
  quoteVersion: (customerId) => ({ quote: { customerId } }),
  quoteItem: (customerId) => ({ quoteVersion: { quote: { customerId } } }),
  quoteApproval: (customerId) => ({ quoteVersion: { quote: { customerId } } }),
  proof: (customerId) => ({ orderLine: { order: { customerId } } }),
  documentVersion: (customerId) => ({ document: { customerId } }),
  user: (customerId) => ({ customerId }),
}

/** Bewerkingen die gegevens teruggeven of raken en dus begrensd moeten worden. */
const BEGRENSDE_BEWERKINGEN = new Set([
  'findFirst', 'findFirstOrThrow', 'findMany', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy', 'updateMany', 'deleteMany', 'update', 'delete',
])

/**
 * Geeft een client terug die alles begrenst op één klant.
 *
 * `findUnique` wordt omgezet naar `findFirst`: anders zou een zoekopdracht op
 * een unieke sleutel het filter omzeilen, want Prisma accepteert daar geen
 * extra voorwaarden. Dat is precies het gat waardoor een aangepaste id in de
 * URL wél gegevens van een andere klant zou opleveren.
 */
export function withCustomerScope(db: Db, customerId: string) {
  return db.$extends({
    name: 'klantscope',
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const scope = SCOPE_PER_MODEL[kleineLetter(model)]
          if (!scope || !BEGRENSDE_BEWERKINGEN.has(operation)) {
            return query(args)
          }

          const filter = scope(customerId)
          const invoer = (args ?? {}) as Record<string, unknown>
          const where = { AND: [invoer.where ?? {}, filter] }

          if (operation === 'findUnique' || operation === 'findUniqueOrThrow') {
            const vervanger = operation === 'findUnique' ? 'findFirst' : 'findFirstOrThrow'
            const client = db as unknown as Record<string, Record<string, (a: unknown) => unknown>>
            return client[kleineLetter(model)][vervanger]({ ...invoer, where })
          }

          return query({ ...invoer, where } as typeof args)
        },
      },
    },
  })
}

const kleineLetter = (model: string) => model.charAt(0).toLowerCase() + model.slice(1)

/** Welke modellen begrensd worden; gebruikt in de tests en in documentatie. */
export const klantgebondenModellen = Object.keys(SCOPE_PER_MODEL)
