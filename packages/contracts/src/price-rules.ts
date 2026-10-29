import { z } from 'zod'
import { leegNaarNull, verplichteTekst } from './customers'

/**
 * Schema's voor het beheren van margeregels. Het rekenwerk en de voorrang
 * staan in `pricing.ts`; dit is alleen de invoer en de weergave.
 *
 * Een margeregel zegt wat er op de inkoopprijs komt. Dat is iets anders dan
 * een klantprijsafspraak (`customer-prices.ts`): die zegt wat een stuk kost
 * en gaat overal voor.
 */

export const PRICE_RULE_SCOPES = [
  'GLOBAL', 'SUPPLIER', 'CATEGORY', 'PRODUCT', 'CUSTOMER', 'CHANNEL',
] as const

/** Hoe het bereik in het scherm heet, en wat de gebruiker erbij moet kiezen. */
export const SCOPE_LABELS: Record<(typeof PRICE_RULE_SCOPES)[number], string> = {
  GLOBAL: 'Standaard (alles)',
  SUPPLIER: 'Leverancier',
  CATEGORY: 'Categorie',
  PRODUCT: 'Product',
  CUSTOMER: 'Klant',
  CHANNEL: 'Verkoopkanaal',
}

/**
 * Een percentage als tekst en niet als number (harde regel 2). Of honderd of
 * meer mag, hangt af van de grondslag: een opslag van 110% op de inkoop is
 * doodgewoon, een marge van 110% van de verkoopprijs bestaat niet. Die
 * controle staat daarom op het hele object.
 */
const percentageVeld = () =>
  verplichteTekst('Vul een percentage in', { max: 10 })
    .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Een percentage ziet eruit als 42,50')
    .transform((v) => v.replace(',', '.'))

const optioneelPercentage = () =>
  leegNaarNull(
    verplichteTekst('Vul een percentage in', { max: 10 })
      .regex(/^\d{1,3}([.,]\d{1,2})?$/, 'Een percentage ziet eruit als 42,50')
      .transform((v) => v.replace(',', '.')),
  ).optional()

export const MARGIN_BASES = ['COST', 'SALE'] as const

/** Hoe de grondslag in het scherm heet. Voluit, want de verwarring zit hier. */
export const BASIS_LABELS: Record<(typeof MARGIN_BASES)[number], string> = {
  COST: 'Opslag op de inkoopprijs',
  SALE: 'Marge op de verkoopprijs',
}

/**
 * Een marge van 100% of meer van de verkoopprijs kan niet: de verkoopprijs
 * zou oneindig worden. Als opslag op de inkoop is 110% juist normaal.
 */
const margeBinnenGrondslag = <T extends z.ZodType<{
  marginBasis?: (typeof MARGIN_BASES)[number]
  marginPercent?: string
  printMarginPercent?: string | null
}>>(schema: T) =>
  schema.superRefine((v, ctx) => {
    if (v.marginBasis !== 'SALE') return
    for (const veld of ['marginPercent', 'printMarginPercent'] as const) {
      const waarde = v[veld]
      if (waarde != null && Number(waarde) >= 100) {
        ctx.addIssue({
          code: 'custom',
          message: 'Een marge van 100% of meer van de verkoopprijs kan niet',
          path: [veld],
        })
      }
    }
  })

const geldigVenster = <T extends z.ZodType<{ validFrom?: Date | null; validTo?: Date | null }>>(schema: T) =>
  schema.refine(
    (v) => !v.validFrom || !v.validTo || v.validTo.getTime() >= v.validFrom.getTime(),
    { error: 'De einddatum ligt voor de begindatum', path: ['validTo'] },
  )

/**
 * Het bereik bepaalt welk doel er ingevuld moet zijn. Zonder deze controle
 * kun je een klantregel zonder klant opslaan; die telt dan nergens mee en is
 * in het scherm niet van een werkende regel te onderscheiden.
 */
const doelHoortBijBereik = <T extends z.ZodType<{
  scope: (typeof PRICE_RULE_SCOPES)[number]
  supplierId?: string | null
  categoryId?: string | null
  productId?: string | null
  customerId?: string | null
  channelId?: string | null
}>>(schema: T) =>
  schema.superRefine((v, ctx) => {
    const nodig = {
      SUPPLIER: ['supplierId', 'een leverancier'],
      CATEGORY: ['categoryId', 'een categorie'],
      PRODUCT: ['productId', 'een product'],
      CUSTOMER: ['customerId', 'een klant'],
      CHANNEL: ['channelId', 'een verkoopkanaal'],
    } as const
    const eis = nodig[v.scope as keyof typeof nodig]
    if (!eis) return

    const [veld, omschrijving] = eis
    if (!v[veld as keyof typeof v]) {
      ctx.addIssue({ code: 'custom', message: `Kies ${omschrijving}`, path: [veld] })
    }
  })

const priceRuleVelden = {
  scope: z.enum(PRICE_RULE_SCOPES, { error: 'Kies een bereik' }),
  supplierId: leegNaarNull(z.string().uuid()).optional(),
  categoryId: leegNaarNull(z.string().uuid()).optional(),
  productId: leegNaarNull(z.string().uuid()).optional(),
  customerId: leegNaarNull(z.string().uuid()).optional(),
  channelId: leegNaarNull(z.string().uuid()).optional(),
  minQuantity: z.coerce
    .number({ error: 'Vul een aantal in' })
    .int('Het aantal is een heel getal')
    .min(1, 'Een regel geldt vanaf ten minste 1 stuk')
    .max(1_000_000)
    .default(1),
  marginBasis: z.enum(MARGIN_BASES).default('COST'),
  marginPercent: percentageVeld(),
  printMarginPercent: optioneelPercentage(),
  priority: z.coerce.number().int().min(0).max(100_000).default(100),
  note: leegNaarNull(z.string().trim().max(500)).optional(),
  validFrom: leegNaarNull(z.coerce.date()).optional(),
  validTo: leegNaarNull(z.coerce.date()).optional(),
  isActive: z.coerce.boolean().default(true),
}

export const createPriceRuleSchema = margeBinnenGrondslag(
  doelHoortBijBereik(geldigVenster(z.object(priceRuleVelden))),
)

/**
 * Het bereik en het doel liggen vast na aanmaken: samen zeggen ze voor wie de
 * regel geldt, en dat omzetten maakt er een andere regel van.
 *
 * Met de hand uitgeschreven en niet als `.partial()`: dat laat `.default()`
 * staan, waardoor een wijziging van alleen de marge de regel ook weer op
 * actief en op priority 100 zou zetten.
 */
export const updatePriceRuleSchema = margeBinnenGrondslag(
  geldigVenster(
    z.object({
      minQuantity: z.coerce.number().int().min(1).max(1_000_000).optional(),
      marginBasis: z.enum(MARGIN_BASES).optional(),
      marginPercent: percentageVeld().optional(),
      printMarginPercent: optioneelPercentage(),
      priority: z.coerce.number().int().min(0).max(100_000).optional(),
      note: leegNaarNull(z.string().trim().max(500)).optional(),
      validFrom: leegNaarNull(z.coerce.date()).optional(),
      validTo: leegNaarNull(z.coerce.date()).optional(),
      isActive: z.coerce.boolean().optional(),
    }),
  ),
)

export const priceRuleSchema = z.object({
  id: z.string(),
  scope: z.enum(PRICE_RULE_SCOPES),
  /** Waar de regel over gaat, met naam. Leeg bij de standaardregel. */
  targetId: z.string().nullable(),
  targetName: z.string().nullable(),
  minQuantity: z.number().int(),
  marginBasis: z.enum(MARGIN_BASES),
  marginPercent: z.string().nullable(),
  /**
   * De marge omgerekend naar een deel van de verkoopprijs, ongeacht de
   * grondslag. Zo hoeft geen enkel scherm die omrekening zelf te doen en
   * staan er nooit twee antwoorden op dezelfde vraag.
   */
  saleMarginPercent: z.string().nullable(),
  printSaleMarginPercent: z.string().nullable(),
  markupAmount: z.string().nullable(),
  printMarginPercent: z.string().nullable(),
  priority: z.number().int(),
  note: z.string().nullable(),
  validFrom: z.string().nullable(),
  validTo: z.string().nullable(),
  isActive: z.boolean(),
  /**
   * Of deze regel vandaag meedoet. Een regel kan actief staan en toch buiten
   * zijn geldigheidsvenster vallen; dat verschil moet in het scherm te zien
   * zijn, anders lijkt een regel te werken die dat niet doet.
   */
  appliesToday: z.boolean(),
})

export type CreatePriceRule = z.infer<typeof createPriceRuleSchema>
export type UpdatePriceRule = z.infer<typeof updatePriceRuleSchema>
export type PriceRuleView = z.infer<typeof priceRuleSchema>
