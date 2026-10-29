/**
 * Seed voor de ontwikkelomgeving.
 *
 * Twee soorten gegevens:
 * - Basisgegevens die het systeem nodig heeft (rollen, rechten, btw-tarieven,
 *   instellingen, nummerreeksen). Deze zijn NIET gemarkeerd als demo.
 * - Demogegevens (klanten, leveranciers, producten, orders). Deze krijgen
 *   isDemo = true, zodat ze veilig op te ruimen zijn en de UI een
 *   waarschuwingsbalk kan tonen.
 *
 * De seed is idempotent: nogmaals draaien levert hetzelfde resultaat.
 */
import {
  createPrismaClient,
  issueNumber,
  lockQuoteVersion,
  approvalIdempotencyKey,
} from '../src/index'
import {
  calculateOrderLine,
  sumOrderTotals,
  deriveLineLogisticsStatus,
  isOrderFullyDelivered,
} from '@rgh/contracts'

const prisma = createPrismaClient()
const YEAR = new Date().getFullYear()

// --- Rechten ---------------------------------------------------------------

const MODULES = [
  'dashboard', 'customers', 'products', 'suppliers', 'orders', 'quotes',
  'proofs', 'purchasing', 'documents', 'tasks', 'users', 'settings',
  'imports', 'channels',
] as const

const ACTIONS = ['view', 'create', 'update', 'delete', 'approve', 'export'] as const

interface RoleDefinition {
  name: string
  /** Beheerder krijgt alles; bij de rest geldt de modulelijst. */
  all: boolean
  modules: string[]
}

const ROLES: Record<string, RoleDefinition> = {
  admin:            { name: 'Beheerder',       all: true,  modules: [] },
  sales:            { name: 'Verkoop',         all: false, modules: ['dashboard', 'customers', 'products', 'quotes', 'orders', 'documents', 'tasks'] },
  order_management: { name: 'Orderbeheer',     all: false, modules: ['dashboard', 'customers', 'orders', 'proofs', 'documents', 'tasks', 'products'] },
  purchasing:       { name: 'Inkoop',          all: false, modules: ['dashboard', 'suppliers', 'purchasing', 'products', 'imports', 'orders', 'tasks'] },
  administration:   { name: 'Administratie',   all: false, modules: ['dashboard', 'customers', 'orders', 'purchasing', 'documents'] },
  customer_admin:   { name: 'Klantbeheerder',  all: false, modules: ['dashboard', 'customers', 'orders', 'documents', 'channels'] },
  customer_user:    { name: 'Klantgebruiker',  all: false, modules: [] },
}

async function seedPermissions() {
  for (const module of MODULES) {
    for (const action of ACTIONS) {
      const key = `${module}:${action}`
      await prisma.permission.upsert({
        where: { key },
        update: {},
        create: { key, module, action },
      })
    }
  }

  for (const [key, def] of Object.entries(ROLES)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: def.name },
      create: { key, name: def.name, isSystem: true },
    })

    const permissions = await prisma.permission.findMany()
    const granted = permissions.filter((p) => {
      if (def.all) return true
      if (!def.modules.includes(p.module)) return false
      // Verwijderen en goedkeuren zijn voorbehouden aan de beheerder,
      // behalve goedkeuren van drukproeven door orderbeheer.
      if (p.action === 'delete') return false
      if (p.action === 'approve') return key === 'order_management' && p.module === 'proofs'
      return true
    })

    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.rolePermission.createMany({
      data: granted.map((p) => ({ roleId: role.id, permissionId: p.id })),
      skipDuplicates: true,
    })
  }
  console.log(`  rechten: ${MODULES.length * ACTIONS.length} permissies, ${Object.keys(ROLES).length} rollen`)
}

// --- Basisgegevens ---------------------------------------------------------

async function seedBaseData() {
  const vatRates = [
    { code: 'NL21', name: 'Nederland 21%', percentage: 21, isDefault: true },
    { code: 'NL09', name: 'Nederland 9%', percentage: 9, isDefault: false },
    { code: 'NL00', name: 'Nederland 0%', percentage: 0, isDefault: false },
  ]
  for (const r of vatRates) {
    await prisma.vatRate.upsert({ where: { code: r.code }, update: r, create: r })
  }

  // Bedrijfsgegevens staan als instelling en niet in de code: ze komen op
  // offertes, orderbevestigingen en facturen, en een verhuizing of een nieuw
  // rekeningnummer hoort geen nieuwe versie van de software te vragen.
  const settings = [
    { key: 'vat.rounding', value: 'PER_LINE_2_DECIMALS', description: 'Btw per orderregel afronden op twee decimalen (ADR-0005).' },
    { key: 'vat.defaultCode', value: 'NL21', description: 'Standaard btw-tarief voor nieuwe orderregels.' },
    { key: 'demo.enabled', value: true, description: 'Toont de demodata-waarschuwing in de interface.' },

    { key: 'company.name', value: 'Promohouse BV', description: 'Naam zoals op documenten.' },
    { key: 'company.street', value: 'Weegschaalstraat 5', description: 'Straat en huisnummer.' },
    { key: 'company.postalCode', value: '7324 BE', description: 'Postcode.' },
    { key: 'company.city', value: 'Apeldoorn', description: 'Plaats.' },
    { key: 'company.country', value: 'Nederland', description: 'Land.' },
    { key: 'company.phone', value: '055 578 88 05', description: 'Telefoonnummer.' },
    { key: 'company.email', value: 'info@promohouse.nl', description: 'E-mailadres voor klanten.' },
    { key: 'company.website', value: 'www.promohouse.nl', description: 'Website.' },
    { key: 'company.chamberOfCommerce', value: '08079411', description: 'KvK-nummer.' },
    { key: 'company.vatNumber', value: 'NL815249135B01', description: 'Btw-identificatienummer.' },
    { key: 'company.iban', value: 'NL39RABO0172495423', description: 'Rekeningnummer voor facturen.' },
    { key: 'company.slogan', value: 'verrassend anders', description: 'Zin onder het logo op documenten.' },
    { key: 'company.logoLight', value: '/merk/promohouse-donker.png', description: 'Logo voor een lichte ondergrond.' },
    { key: 'company.logoDark', value: '/merk/promohouse-licht.png', description: 'Logo voor een donkere ondergrond.' },
  ]
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as never, description: s.description },
      create: { key: s.key, value: s.value as never, description: s.description },
    })
  }

  // Betalingsvoorwaarden. Precies een standaard; een partiele unieke index in
  // de database laat niet meer dan een toe.
  const paymentTerms = [
    { key: 'net_14', name: '14 dagen netto', days: 14, endOfMonth: false, sort: 10 },
    { key: 'net_30', name: '30 dagen netto', days: 30, endOfMonth: false, sort: 20, isDefault: true },
    { key: 'net_60', name: '60 dagen netto', days: 60, endOfMonth: false, sort: 30 },
    { key: 'eom_30', name: 'Einde maand plus 30 dagen', days: 30, endOfMonth: true, sort: 40 },
    {
      key: 'prepaid_50', name: '50% vooruit, rest 14 dagen', days: 14, endOfMonth: false, sort: 50,
      prepaymentPercent: '50.00',
      invoiceText: '50% vooruitbetaling, het restant binnen 14 dagen na levering.',
    },
    {
      key: 'prepaid_100', name: 'Volledig vooruit', days: 0, endOfMonth: false, sort: 60,
      prepaymentPercent: '100.00',
      invoiceText: 'Levering na ontvangst van de volledige betaling.',
    },
  ]
  for (const t of paymentTerms) {
    const { key, isDefault, ...rest } = t
    await prisma.paymentTerm.upsert({
      where: { key },
      // isDefault staat niet in de update: wie de standaard in het scherm
      // heeft verlegd, wil niet dat een seed dat terugdraait.
      update: rest,
      create: { key, ...rest, isDefault: isDefault ?? false },
    })
  }

  // Tekstsjablonen. De teksten hieronder zijn een beginpunt en bedoeld om
  // aangepast te worden: ze staan in de database en zijn in het beheerscherm
  // te wijzigen. De velden tussen dubbele accolades worden bij het opslaan
  // gecontroleerd, zodat er nooit een onbekend veld bij een klant belandt.
  const templates = [
    {
      key: 'quote.intro',
      kind: 'QUOTE_INTRO' as const,
      name: 'Inleiding op de offerte',
      description: 'De tekst boven de regels van de offerte.',
      body:
        '{{contact.aanhef}},\n\n' +
        'Hartelijk dank voor uw aanvraag. Hierbij ontvangt u onze offerte {{offerte.nummer}}.\n' +
        'Uw referentie: {{offerte.referentie}}\n\n' +
        'Deze offerte is geldig tot {{offerte.geldigTot}}. Heeft u vragen of wilt u iets ' +
        'aangepast zien, belt u gerust even.',
    },
    {
      key: 'quote.terms',
      kind: 'QUOTE_TERMS' as const,
      name: 'Voorwaarden onder de offerte',
      description: 'De tekst onder de regels, met de afspraken die voor deze offerte gelden.',
      body:
        'Genoemde prijzen zijn per stuk en exclusief btw, tenzij anders vermeld.\n' +
        'De prijs geldt voor het genoemde aantal; bij een ander aantal rekenen wij opnieuw.\n' +
        'Instelkosten worden eenmalig per opdracht berekend.\n\n' +
        'Levertijd in overleg, gerekend vanaf goedkeuring van de drukproef.\n' +
        'Betaling: {{offerte.betalingsvoorwaarde}}.\n' +
        'Op al onze leveringen zijn onze algemene voorwaarden van toepassing.\n\n' +
        'Met vriendelijke groet,\n{{gebruiker.naam}}\n{{bedrijf.naam}} · {{bedrijf.telefoon}}',
    },
    {
      key: 'quote.line',
      kind: 'QUOTE_LINE' as const,
      name: 'Omschrijving van een offerteregel',
      description: 'Hoe een regel op de offerte wordt omschreven. Kent de productvelden.',
      body:
        '{{product.naam}} ({{product.artikelnummer}})\n' +
        'Kleur: {{product.kleur}}\n' +
        '{{bedrukking.techniek}} op {{bedrukking.positie}}, {{bedrukking.kleuren}} kleur(en)',
    },
    {
      key: 'quote.email',
      kind: 'QUOTE_EMAIL' as const,
      name: 'E-mail waarmee de offerte verstuurd wordt',
      description: 'Onderwerp en tekst van de begeleidende e-mail.',
      subject: 'Offerte {{offerte.nummer}} van {{bedrijf.naam}}',
      body:
        '{{contact.aanhef}},\n\n' +
        'Bijgaand onze offerte {{offerte.nummer}} voor {{klant.naam}}, met een totaal van ' +
        '{{offerte.totaal}} exclusief btw.\n\n' +
        'De offerte is geldig tot {{offerte.geldigTot}}. Laat u gerust weten als er iets ' +
        'aangepast moet worden.\n\n' +
        'Met vriendelijke groet,\n{{gebruiker.naam}}\n{{bedrijf.naam}}\n' +
        '{{bedrijf.telefoon}} · {{bedrijf.email}}',
    },
  ]
  for (const t of templates) {
    await prisma.documentTemplate.upsert({
      where: { key: t.key },
      // De tekst zelf wordt niet overschreven: wie hem in het scherm heeft
      // aangepast wil niet dat een seedronde dat terugdraait.
      update: { kind: t.kind, description: t.description },
      create: { ...t, isSystem: true },
    })
  }

  // Nummerreeksen. Formaat en startwaarde zijn later te wijzigen via
  // Instellingen, ook als er al nummers zijn uitgegeven.
  const sequences = [
    { key: 'QUOTE', year: YEAR, format: 'OFF-{year}-{counter:5}' },
    { key: 'ORDER', year: YEAR, format: 'ORD-{year}-{counter:5}' },
    { key: 'PURCHASE_ORDER', year: YEAR, format: 'INK-{year}-{counter:5}' },
    { key: 'CUSTOMER', year: 0, format: '{counter:5}', start: 10000 },
    { key: 'SHIPMENT', year: YEAR, format: 'VZ-{year}-{counter:5}' },
  ]
  for (const s of sequences) {
    await prisma.numberSequence.upsert({
      where: { key_year: { key: s.key, year: s.year } },
      update: { format: s.format },
      create: { key: s.key, year: s.year, format: s.format, lastValue: s.start ?? 0 },
    })
  }

  const printPositions = [
    { key: 'front', name: 'Voorzijde', sort: 10 },
    { key: 'back', name: 'Achterzijde', sort: 20 },
    { key: 'side', name: 'Zijkant', sort: 30 },
    { key: 'lid', name: 'Deksel', sort: 40 },
    { key: 'bottom', name: 'Onderzijde', sort: 50 },
    { key: 'sleeve', name: 'Mouw', sort: 60 },
    { key: 'other', name: 'Overig', sort: 99 },
  ]
  for (const pos of printPositions) {
    await prisma.printPosition.upsert({
      where: { key: pos.key },
      update: { name: pos.name, sort: pos.sort },
      create: pos,
    })
  }

  const printMethods = [
    { key: 'screen_print', name: 'Zeefdruk' },
    { key: 'pad_print', name: 'Tampondruk' },
    { key: 'digital_print', name: 'Digitale druk' },
    { key: 'laser_engraving', name: 'Laseren' },
    { key: 'embroidery', name: 'Borduren' },
    { key: 'doming', name: 'Doming' },
  ]
  for (const m of printMethods) {
    await prisma.printMethod.upsert({ where: { key: m.key }, update: { name: m.name }, create: m })
  }

  console.log(`  basisgegevens: ${vatRates.length} btw-tarieven, ${settings.length} instellingen, ${sequences.length} nummerreeksen, ${printMethods.length} bedrukkingstechnieken, ${printPositions.length} bedrukposities, ${paymentTerms.length} betalingsvoorwaarden, ${templates.length} tekstsjablonen`)
}

// --- Demogegevens ----------------------------------------------------------

async function seedDemo() {
  const demo = { isDemo: true }

  // Medewerkers. Auth-gegevens (wachtwoord, MFA) komen in stap 3.
  const users = await Promise.all(
    [
      { email: 'beheerder@demo.local', name: 'Demo Beheerder', role: 'admin' },
      { email: 'verkoop@demo.local', name: 'Demo Verkoop', role: 'sales' },
      { email: 'orderbeheer@demo.local', name: 'Demo Orderbeheer', role: 'order_management' },
      { email: 'inkoop@demo.local', name: 'Demo Inkoop', role: 'purchasing' },
    ].map(async (u) => {
      const user = await prisma.user.upsert({
        where: { email: u.email },
        update: { name: u.name },
        create: { email: u.email, name: u.name, ...demo },
      })
      const role = await prisma.role.findUniqueOrThrow({ where: { key: u.role } })
      await prisma.userRole.upsert({
        where: { userId_roleId: { userId: user.id, roleId: role.id } },
        update: {},
        create: { userId: user.id, roleId: role.id },
      })
      return user
    }),
  )

  const suppliers = await Promise.all(
    [
      { code: 'MIDOCEAN', name: 'midocean', psiNumber: '41545' },
      { code: 'TOPPOINT', name: 'Toppoint', psiNumber: '42935' },
      { code: 'ANDA', name: 'Anda Present', psiNumber: '45753' },
      { code: 'PFCONCEPT', name: 'PF Concept', psiNumber: '41209' },
      { code: 'CLIPPER', name: 'Clipper Interall', psiNumber: '43174' },
    ].map((s) =>
      prisma.supplier.upsert({
        where: { code: s.code },
        update: { name: s.name },
        // PSI-nummers zijn demowaarden en moeten bij de echte koppeling
        // gecontroleerd worden.
        create: { ...s, ...demo },
      }),
    ),
  )

  const categories = await Promise.all(
    [
      { slug: 'drinkware', name: 'Drinkware', path: 'drinkware' },
      { slug: 'schrijfwaren', name: 'Schrijfwaren', path: 'schrijfwaren' },
      { slug: 'tassen', name: 'Tassen', path: 'tassen' },
      { slug: 'technologie', name: 'Technologie', path: 'technologie' },
    ].map((c) =>
      prisma.productCategory.upsert({ where: { slug: c.slug }, update: {}, create: { ...c, ...demo } }),
    ),
  )

  const screenPrint = await prisma.printMethod.findUniqueOrThrow({ where: { key: 'screen_print' } })
  const laser = await prisma.printMethod.findUniqueOrThrow({ where: { key: 'laser_engraving' } })
  const front = await prisma.printPosition.findUniqueOrThrow({ where: { key: 'front' } })

  const productDefs = [
    { articleNumber: 'DEMO-1001', name: 'Thermosbeker Rivo 350 ml', category: 'drinkware', supplier: 'MIDOCEAN', purchase: 4.85, sale: 9.95, colors: ['Zwart', 'Wit', 'Navy'], method: laser.id, setup: 35 },
    { articleNumber: 'DEMO-1002', name: 'Balpen Metal Pure', category: 'schrijfwaren', supplier: 'TOPPOINT', purchase: 0.62, sale: 1.45, colors: ['Zilver', 'Blauw'], method: screenPrint.id, setup: 25 },
    { articleNumber: 'DEMO-1003', name: 'Katoenen shopper 180 g', category: 'tassen', supplier: 'ANDA', purchase: 1.35, sale: 3.25, colors: ['Naturel', 'Zwart'], method: screenPrint.id, setup: 30 },
    { articleNumber: 'DEMO-1004', name: 'Powerbank Slim 5000', category: 'technologie', supplier: 'PFCONCEPT', purchase: 8.40, sale: 17.50, colors: ['Zwart'], method: laser.id, setup: 40 },
  ]

  for (const def of productDefs) {
    const category = categories.find((c) => c.slug === def.category)!
    const supplier = suppliers.find((s) => s.code === def.supplier)!

    const product = await prisma.product.upsert({
      where: { articleNumber: def.articleNumber },
      update: { name: def.name },
      create: {
        articleNumber: def.articleNumber,
        name: def.name,
        description: `Demoartikel voor ontwikkeling. Niet voor klantgebruik.`,
        categoryId: category.id,
        ...demo,
      },
    })

    for (const [i, color] of def.colors.entries()) {
      const sku = `${def.articleNumber}-${String(i + 1).padStart(2, '0')}`
      await prisma.productVariant.upsert({
        where: { sku },
        update: { colorName: color },
        create: { sku, productId: product.id, colorName: color, ...demo },
      })
    }

    const ps = await prisma.productSupplier.upsert({
      where: { supplierId_supplierArticleNumber: { supplierId: supplier.id, supplierArticleNumber: def.articleNumber.replace('DEMO-', 'S') } },
      update: { purchasePrice: def.purchase },
      create: {
        productId: product.id,
        supplierId: supplier.id,
        supplierArticleNumber: def.articleNumber.replace('DEMO-', 'S'),
        purchasePrice: def.purchase,
        minimumOrderQuantity: 25,
        leadTimeDays: 12,
        isPreferred: true,
        ...demo,
      },
    })

    // Inkoopstaffels: hoe meer, hoe goedkoper.
    for (const [minQuantity, factor] of [[1, 1], [100, 0.94], [250, 0.89], [500, 0.84]] as const) {
      await prisma.purchasePriceTier.upsert({
        where: { productSupplierId_minQuantity: { productSupplierId: ps.id, minQuantity } },
        update: { unitPrice: +(def.purchase * factor).toFixed(4) },
        create: { productSupplierId: ps.id, minQuantity, unitPrice: +(def.purchase * factor).toFixed(4), ...demo },
      })
    }

    for (const [minQuantity, factor] of [[1, 1], [100, 0.93], [250, 0.87], [500, 0.82]] as const) {
      const existing = await prisma.salesPriceTier.findFirst({ where: { productId: product.id, minQuantity } })
      if (!existing) {
        await prisma.salesPriceTier.create({
          data: { productId: product.id, minQuantity, unitPrice: +(def.sale * factor).toFixed(4), ...demo },
        })
      }
    }

    const option = await prisma.productPrintOption.upsert({
      where: {
        productId_printMethodId_printPositionId: {
          productId: product.id,
          printMethodId: def.method,
          printPositionId: front.id,
        },
      },
      update: { setupCost: def.setup },
      create: {
        productId: product.id,
        printMethodId: def.method,
        printPositionId: front.id,
        // De tekst zoals een leverancier die zou aanleveren.
        positionLabel: 'voorzijde',
        maxColors: 4,
        setupCost: def.setup,
        ...demo,
      },
    })

    for (const [minQuantity, price] of [[1, 0.45], [250, 0.32], [500, 0.24]] as const) {
      await prisma.printPriceTier.upsert({
        where: { productPrintOptionId_colors_minQuantity: { productPrintOptionId: option.id, colors: 1, minQuantity } },
        update: { unitPrice: price },
        create: { productPrintOptionId: option.id, colors: 1, minQuantity, unitPrice: price, setupCost: def.setup, ...demo },
      })
    }
  }

  console.log(`  demo: ${suppliers.length} leveranciers, ${productDefs.length} producten met varianten en staffels`)
  return { users }
}

// --- Demo-offertes en -orders ---------------------------------------------
// Volgt de echte route uit ADR-0007: offerte -> versie vastzetten ->
// klantakkoord op die exacte versie -> order als kopie van de versie.

async function seedDemoQuotesAndOrders(users: { id: string; email: string }[]) {
  const demo = { isDemo: true }
  const sales = users.find((u) => u.email === 'verkoop@demo.local')!
  const orderDesk = users.find((u) => u.email === 'orderbeheer@demo.local')!

  const customerDefs = [
    { name: 'Demo Bouwgroep Nederland BV', vatNumber: 'NL001234567B01', city: 'Zwolle' },
    { name: 'Demo Zorgcentrum De Linde', vatNumber: 'NL009876543B01', city: 'Apeldoorn' },
    { name: 'Demo Technisch Installatiebedrijf Veld', vatNumber: 'NL005556667B01', city: 'Deventer' },
  ]

  const customers = []
  for (const def of customerDefs) {
    const existing = await prisma.customer.findFirst({ where: { name: def.name } })
    if (existing) {
      customers.push(existing)
      continue
    }
    const number = await prisma.$transaction((tx) => issueNumber(tx, 'CUSTOMER', 0))
    customers.push(
      await prisma.customer.create({
        data: {
          number,
          name: def.name,
          vatNumber: def.vatNumber,
          email: `inkoop@${def.name.toLowerCase().replace(/[^a-z]+/g, '')}.demo`,
          phone: '038 123 4567',
          notes: 'Demoklant. Interne opmerkingen zijn nooit zichtbaar in het klantportaal.',
          ...demo,
          contacts: {
            create: [
              { firstName: 'Demo', lastName: 'Inkoper', email: 'inkoop@demo.local', isPrimary: true, ...demo },
              { firstName: 'Demo', lastName: 'Marketing', email: 'marketing@demo.local', ...demo },
            ],
          },
          addresses: {
            create: [
              { type: 'INVOICE', label: 'Factuuradres', street: 'Voorbeeldstraat', houseNumber: '1', postalCode: '8000 AA', city: def.city, isDefault: true, ...demo },
              { type: 'DELIVERY', label: 'Hoofdvestiging', street: 'Voorbeeldweg', houseNumber: '25', postalCode: '8000 BB', city: def.city, isDefault: true, ...demo },
            ],
          },
        },
      }),
    )
  }

  const products = await prisma.product.findMany({
    where: { isDemo: true },
    // Vaste volgorde: zonder sortering hangt "het eerste demoproduct" af van
    // wat de database toevallig teruggeeft, en dan maakt een tweede seedronde
    // dezelfde demogegevens op een ander product aan.
    orderBy: { articleNumber: 'asc' },
    include: { suppliers: { include: { supplier: true } }, printOptions: { include: { printMethod: true } } },
  })

  // Een jaarafspraak bij de eerste demoklant, met een staffel. Toont in het
  // scherm het verschil tussen een afspraak en een prijsregel: deze bedragen
  // gaan voor, ook als een algemene regel hoger uitkomt.
  const afspraakKlant = customers[0]
  const afspraakProduct = products[0]
  if (afspraakKlant && afspraakProduct) {
    const eomTermijn = await prisma.paymentTerm.findUnique({ where: { key: 'eom_30' } })
    if (eomTermijn && afspraakKlant.paymentTermId === null) {
      await prisma.customer.update({
        where: { id: afspraakKlant.id },
        data: { paymentTermId: eomTermijn.id },
      })
    }

    for (const afspraak of [
      { minQuantity: 100, unitPrice: '7.9500' },
      { minQuantity: 500, unitPrice: '7.2500' },
      { minQuantity: 1000, unitPrice: '6.8000' },
    ]) {
      await prisma.customerPriceAgreement.upsert({
        where: {
          customerId_productId_minQuantity: {
            customerId: afspraakKlant.id,
            productId: afspraakProduct.id,
            minQuantity: afspraak.minQuantity,
          },
        },
        update: {},
        create: {
          customerId: afspraakKlant.id,
          productId: afspraakProduct.id,
          minQuantity: afspraak.minQuantity,
          unitPrice: afspraak.unitPrice,
          note: 'Jaarafspraak 2026, vastgelegd per mail.',
          ...demo,
        },
      })
    }
  }

  // Eén offerte blijft bij de klant liggen, twee worden geaccepteerd.
  const plans = [
    { customer: 0, owner: sales.id, accept: false, lines: [0, 1] },
    { customer: 1, owner: orderDesk.id, accept: true, lines: [2] },
    { customer: 2, owner: orderDesk.id, accept: true, lines: [0, 3] },
  ]

  let quotesCreated = 0
  let ordersCreated = 0

  for (const plan of plans) {
    const customer = customers[plan.customer]
    const existing = await prisma.quote.findFirst({ where: { customerId: customer.id, isDemo: true } })
    if (existing) continue

    const contact = await prisma.contactPerson.findFirstOrThrow({ where: { customerId: customer.id, isPrimary: true } })
    const invoiceAddress = await prisma.address.findFirstOrThrow({ where: { customerId: customer.id, type: 'INVOICE' } })
    const deliveryAddress = await prisma.address.findFirstOrThrow({ where: { customerId: customer.id, type: 'DELIVERY' } })

    const quoteNumber = await prisma.$transaction((tx) => issueNumber(tx, 'QUOTE', YEAR))

    const itemInputs = plan.lines.map((idx, i) => {
      const product = products[idx]
      const ps = product.suppliers[0]
      const option = product.printOptions[0]
      const quantity = [250, 500, 100][i % 3]
      const unitSalePrice = Number(ps.purchasePrice) * 2.1
      const printJobs = option ? [{ unitPrice: 0.32, setupCost: Number(option.setupCost) }] : []
      const totals = calculateOrderLine({
        quantity,
        unitSalePrice,
        unitPurchasePrice: Number(ps.purchasePrice),
        vatRate: 21,
        printJobs,
      })
      return { product, ps, option, quantity, unitSalePrice, totals }
    })

    const quoteTotals = sumOrderTotals(itemInputs.map((l) => l.totals))

    const quote = await prisma.quote.create({
      data: {
        number: quoteNumber,
        customerId: customer.id,
        contactPersonId: contact.id,
        ownerId: plan.owner,
        invoiceAddressId: invoiceAddress.id,
        deliveryAddressId: deliveryAddress.id,
        status: 'DRAFT',
        requestedDeliveryDate: new Date(Date.now() + 21 * 86400000),
        reference: 'Demo-referentie',
        notes: 'Demodata voor ontwikkeling.',
        ...demo,
        versions: {
          create: [{
            versionNumber: 1,
            validUntil: new Date(Date.now() + 30 * 86400000),
            deliveryTerms: 'Levering franco huis bij orders boven 500 euro.',
            customerNotes: 'Prijzen exclusief btw. Levertijd na goedkeuring drukproef.',
            createdById: plan.owner,
            subtotalExclVat: quoteTotals.subtotalExclVat.toFixed(2),
            vatAmount: quoteTotals.vatAmount.toFixed(2),
            totalInclVat: quoteTotals.totalInclVat.toFixed(2),
            purchaseTotal: quoteTotals.purchaseTotal.toFixed(2),
            marginAmount: quoteTotals.marginAmount.toFixed(2),
            ...demo,
            items: {
              create: itemInputs.map((l, i) => ({
                lineNumber: i + 1,
                productId: l.product.id,
                productSupplierId: l.ps.id,
                supplierId: l.ps.supplierId,
                productArticleNumber: l.product.articleNumber,
                productName: l.product.name,
                supplierName: l.ps.supplier.name,
                quantity: l.quantity,
                unitSalePrice: l.unitSalePrice.toFixed(4),
                unitPurchasePrice: Number(l.ps.purchasePrice).toFixed(4),
                vatRate: '21',
                lineSubtotalExclVat: l.totals.subtotalExclVat.toFixed(2),
                lineVatAmount: l.totals.vatAmount.toFixed(2),
                lineTotalInclVat: l.totals.totalInclVat.toFixed(2),
                linePurchaseTotal: l.totals.purchaseTotal.toFixed(2),
                lineMarginAmount: l.totals.marginAmount.toFixed(2),
                ...demo,
                printJobs: l.option
                  ? {
                      create: [{
                        printMethodId: l.option.printMethodId,
                        printMethodName: l.option.printMethod.name,
                        printPositionId: l.option.printPositionId,
                        position: 'voorzijde',
                        colors: 1,
                        unitPrice: '0.3200',
                        setupCost: Number(l.option.setupCost).toFixed(4),
                        ...demo,
                      }],
                    }
                  : undefined,
              })),
            },
          }],
        },
      },
      include: { versions: true },
    })

    const version = quote.versions[0]

    // Versie vastzetten: vanaf nu weigeren de triggers elke wijziging.
    await prisma.$transaction((tx) =>
      lockQuoteVersion(tx, version.id, { documentChecksum: 'demo-checksum-offerte' }),
    )
    await prisma.quote.update({
      where: { id: quote.id },
      data: { currentVersionId: version.id, status: 'AWAITING_CUSTOMER' },
    })
    quotesCreated++

    await prisma.document.create({
      data: {
        category: 'QUOTE',
        title: `Offerte ${quoteNumber}`,
        visibility: 'CUSTOMER',
        customerId: customer.id,
        quoteId: quote.id,
        quoteVersionId: version.id,
        createdById: plan.owner,
        ...demo,
        versions: {
          create: [{
            versionNumber: 1,
            storageKey: `demo/quotes/${version.id}/v1.pdf`,
            fileName: `${quoteNumber}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            checksum: 'demo-checksum-offerte',
            uploadedById: plan.owner,
            note: 'Demodocument zonder echt bestand.',
          }],
        },
      },
    })

    if (!plan.accept) {
      await prisma.task.create({
        data: {
          title: `Offerte ${quoteNumber} nabellen`,
          quoteId: quote.id,
          customerId: customer.id,
          assigneeId: plan.owner,
          createdById: plan.owner,
          dueDate: new Date(Date.now() + 3 * 86400000),
          ...demo,
        },
      })
      continue
    }

    // Klantakkoord op deze exacte versie. De idempotency-sleutel maakt een
    // tweede akkoord op dezelfde versie onmogelijk.
    await prisma.quoteApproval.create({
      data: {
        quoteVersionId: version.id,
        decision: 'ACCEPTED',
        decidedByContactId: contact.id,
        comment: 'Akkoord via het klantportaal.',
        documentChecksum: 'demo-checksum-offerte',
        idempotencyKey: approvalIdempotencyKey(version.id, 'ACCEPTED'),
        ...demo,
      },
    })
    await prisma.quote.update({
      where: { id: quote.id },
      data: { status: 'ACCEPTED', acceptedVersionId: version.id },
    })

    // Order als kopie van de geaccepteerde versie.
    const orderNumber = await prisma.$transaction((tx) => issueNumber(tx, 'ORDER', YEAR))
    const items = await prisma.quoteItem.findMany({
      where: { quoteVersionId: version.id },
      include: { printJobs: true },
      orderBy: { lineNumber: 'asc' },
    })

    const order = await prisma.order.create({
      data: {
        number: orderNumber,
        quoteVersionId: version.id,
        customerId: customer.id,
        contactPersonId: contact.id,
        ownerId: plan.owner,
        invoiceAddressId: invoiceAddress.id,
        deliveryAddressId: deliveryAddress.id,
        status: 'ACTIVE',
        requestedDeliveryDate: quote.requestedDeliveryDate,
        reference: quote.reference,
        notes: `Ontstaan uit geaccepteerde offerte ${quoteNumber}, versie ${version.versionNumber}.`,
        subtotalExclVat: version.subtotalExclVat,
        vatAmount: version.vatAmount,
        totalInclVat: version.totalInclVat,
        purchaseTotal: version.purchaseTotal,
        marginAmount: version.marginAmount,
        ...demo,
        lines: {
          create: items.map((it) => ({
            lineNumber: it.lineNumber,
            quoteItemId: it.id,
            productId: it.productId,
            productVariantId: it.productVariantId,
            productSupplierId: it.productSupplierId,
            supplierId: it.supplierId,
            productArticleNumber: it.productArticleNumber,
            productName: it.productName,
            variantDescription: it.variantDescription,
            supplierName: it.supplierName,
            description: it.description,
            quantity: it.quantity,
            unitSalePrice: it.unitSalePrice,
            unitPurchasePrice: it.unitPurchasePrice,
            discountPercent: it.discountPercent,
            setupCost: it.setupCost,
            vatRate: it.vatRate,
            lineSubtotalExclVat: it.lineSubtotalExclVat,
            lineVatAmount: it.lineVatAmount,
            lineTotalInclVat: it.lineTotalInclVat,
            linePurchaseTotal: it.linePurchaseTotal,
            lineMarginAmount: it.lineMarginAmount,
            proofStatus: 'REQUESTED',
            purchaseStatus: 'NOT_ORDERED',
            logisticsStatus: 'NONE',
            ...demo,
            printJobs: {
              create: it.printJobs.map((pj) => ({
                printMethodId: pj.printMethodId,
                printMethodName: pj.printMethodName,
                printPositionId: pj.printPositionId,
                position: pj.position,
                colors: pj.colors,
                unitPrice: pj.unitPrice,
                setupCost: pj.setupCost,
                ...demo,
              })),
            },
          })),
        },
        events: {
          create: [
            { type: 'REQUEST_RECEIVED', userId: plan.owner, note: 'Aanvraag per e-mail ontvangen.' },
            { type: 'QUOTE_CREATED', userId: plan.owner },
            { type: 'QUOTE_SENT', userId: plan.owner },
            { type: 'QUOTE_ACCEPTED', note: `Akkoord op versie ${version.versionNumber}.` },
            { type: 'ORDER_CREATED', statusDimension: 'MAIN', toValue: 'ACTIVE' },
            { type: 'PROOF_REQUESTED', userId: plan.owner, statusDimension: 'PROOF', toValue: 'REQUESTED' },
          ],
        },
        tasks: {
          create: [{
            title: 'Drukproef bij leverancier opvragen',
            assigneeId: plan.owner,
            createdById: plan.owner,
            dueDate: new Date(Date.now() + 3 * 86400000),
            ...demo,
          }],
        },
      },
    })

    await prisma.document.create({
      data: {
        category: 'ORDER_CONFIRMATION',
        title: `Orderbevestiging ${orderNumber}`,
        visibility: 'CUSTOMER',
        customerId: customer.id,
        orderId: order.id,
        createdById: plan.owner,
        ...demo,
        versions: {
          create: [{
            versionNumber: 1,
            storageKey: `demo/orders/${order.id}/v1.pdf`,
            fileName: `${orderNumber}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            checksum: 'demo-checksum-order',
            uploadedById: plan.owner,
            note: 'Demodocument zonder echt bestand.',
          }],
        },
      },
    })
    ordersCreated++
  }

  console.log(`  demo: ${customers.length} klanten, ${quotesCreated} offertes vastgezet, ${ordersCreated} orders uit geaccepteerde offerteversies`)
}

// --- Demo: koppelconfiguratie en kanalen ----------------------------------

/**
 * Verbindingen per leverancier, opgezet volgens wat deze leveranciers volgens
 * het onderzoek aanbieden (docs/leveranciers/koppelingen.md).
 *
 * Alle verbindingen staan op isActive = false: er zijn nog geen credentials en
 * de specificaties zijn niet geverifieerd. Zo staat de capability-routing wel
 * klaar, maar kan niemand denken dat er al data binnenkomt.
 */
interface CapabilityDefinition {
  capability: 'CATALOG' | 'MEDIA' | 'PRICE_TIERS' | 'INVENTORY' | 'PLACE_ORDER' | 'ORDER_STATUS' | 'SHIPPING'
  priority: number
  /** Cron-uitdrukking; leeg betekent alleen handmatig of op gebeurtenis. */
  schedule?: string
  /**
   * Uit betekent: gedocumenteerd, maar bewust niet in gebruik. Zo blijft
   * zichtbaar wat een leverancier kan, zonder dat de routing hem kiest.
   */
  enabled?: boolean
}

interface ConnectionDefinition {
  supplier: string
  key: string
  connectorKey: string
  transport: 'REST' | 'SOAP' | 'XML_FEED' | 'CSV_FEED' | 'SFTP' | 'FTP' | 'FILE_UPLOAD'
  notes: string
  capabilities: CapabilityDefinition[]
}

async function seedConnections() {
  const demo = { isDemo: true }

  const definitions: ConnectionDefinition[] = [
    {
      supplier: 'PFCONCEPT', key: 'pfconcept-xml', connectorKey: 'pfconcept-xml', transport: 'XML_FEED',
      notes: 'Product-, Price-, Print- en Decoration-XML plus afbeeldingen, dagelijks.',
      capabilities: [
        { capability: 'CATALOG', priority: 10, schedule: '0 3 * * *' },
        { capability: 'PRICE_TIERS', priority: 10, schedule: '0 3 * * *' },
        { capability: 'MEDIA', priority: 10, schedule: '30 3 * * *' },
        { capability: 'INVENTORY', priority: 50, schedule: '0 7,15 * * *' },
      ],
    },
    {
      supplier: 'PFCONCEPT', key: 'pfconcept-gateway', connectorKey: 'pfconcept-gateway', transport: 'REST',
      notes: 'Gateway voor het plaatsen van orders en het ophalen van de status.',
      capabilities: [
        { capability: 'PLACE_ORDER', priority: 10 },
        { capability: 'ORDER_STATUS', priority: 10, schedule: '0 8,16 * * *' },
      ],
    },
    {
      supplier: 'ANDA', key: 'anda-rest', connectorKey: 'anda-rest', transport: 'REST',
      notes: 'REST plus feeds voor product, prijs, voorraad, labeling info en labeling price.',
      capabilities: [
        { capability: 'CATALOG', priority: 10, schedule: '0 3 * * *' },
        { capability: 'PRICE_TIERS', priority: 10, schedule: '0 3 * * *' },
        { capability: 'INVENTORY', priority: 10, schedule: '0 * * * *' },
        { capability: 'PLACE_ORDER', priority: 10 },
      ],
    },
    {
      // Blijft staan als vastlegging dat deze route onderzocht is, maar hij
      // bestaat niet meer: midocean heeft SFTP met versie 1.11 van hun
      // handleiding uitgefaseerd en in 2025 uitgezet. Niet verwijderd, want
      // dan verdwijnt ook waarom we hem niet gebruiken.
      supplier: 'MIDOCEAN', key: 'midocean-sftp', connectorKey: 'midocean-sftp', transport: 'SFTP',
      notes:
        'VERVALLEN. midocean heeft de SFTP-dienst uitgefaseerd (handleiding v1.11) en in 2025 ' +
        'uitgezet. Alles loopt via midocean-api. Zie ADR-0013.',
      capabilities: [],
    },
    {
      supplier: 'MIDOCEAN', key: 'midocean-api', connectorKey: 'midocean-api', transport: 'REST',
      notes:
        'REST-koppeling volgens handleiding v1.12.2. Sleutel in de header x-Gateway-APIKey, ' +
        'test op apitest.midocean.com. Zie docs/leveranciers/midocean.md en ADR-0013.',
      capabilities: [
        { capability: 'CATALOG', priority: 10, schedule: '0 2 * * *' },
        { capability: 'MEDIA', priority: 10, schedule: '30 2 * * *' },
        { capability: 'PRICE_TIERS', priority: 10, schedule: '0 2 * * *' },
        // Twee keer per dag is genoeg; de opdrachtgever hoeft geen
        // voorraadstand per uur. midocean ververst zelf elk uur.
        //
        // Let op: deze tijden zijn bedoeld als Nederlandse tijd. De planner is
        // nog niet gebouwd (ADR-0009); zodra die er is moet hij op
        // Europe/Amsterdam draaien, anders schuift 06:00 in de winter naar
        // 07:00 en in de zomer naar 08:00.
        { capability: 'INVENTORY', priority: 10, schedule: '0 6,18 * * *' },
        // Gedocumenteerd en uit: bestellen gaat buiten het platform om
        // (harde regel 13). Zie ADR-0013 voor wat er nodig is om dit later
        // wel te bouwen.
        { capability: 'PLACE_ORDER', priority: 10, enabled: false },
        { capability: 'ORDER_STATUS', priority: 10, enabled: false },
      ],
    },
    {
      supplier: 'CLIPPER', key: 'clipper-ftp', connectorKey: 'generic-file', transport: 'FTP',
      notes: 'FTP met productdata en fotos. Eigen credentials aanvragen bij de accountmanager.',
      capabilities: [
        { capability: 'CATALOG', priority: 10, schedule: '0 4 * * *' },
        { capability: 'MEDIA', priority: 10 },
      ],
    },
    {
      supplier: 'TOPPOINT', key: 'toppoint-file', connectorKey: 'generic-file', transport: 'FILE_UPLOAD',
      notes: 'Geen koppeling bekend. Voorlopig handmatige bestandsimport van de prijslijst.',
      capabilities: [{ capability: 'CATALOG', priority: 10 }],
    },
  ]

  for (const def of definitions) {
    const supplier = await prisma.supplier.findUniqueOrThrow({ where: { code: def.supplier } })
    const connection = await prisma.supplierConnection.upsert({
      where: { key: def.key },
      update: { notes: def.notes, transport: def.transport },
      create: {
        supplierId: supplier.id,
        key: def.key,
        connectorKey: def.connectorKey,
        transport: def.transport,
        isActive: false,
        notes: def.notes,
        ...demo,
      },
    })

    // Capabilities die uit de definitie verdwenen zijn: uitzetten, niet
    // verwijderen. Rij 9 van CLAUDE.md geldt ook voor configuratie, en een
    // uitgezette rij vertelt nog dat die route ooit bestond.
    await prisma.supplierConnectionCapability.updateMany({
      where: {
        connectionId: connection.id,
        capability: { notIn: def.capabilities.map((c) => c.capability) },
      },
      data: { isEnabled: false },
    })

    for (const cap of def.capabilities) {
      await prisma.supplierConnectionCapability.upsert({
        where: { connectionId_capability: { connectionId: connection.id, capability: cap.capability } },
        update: {
          priority: cap.priority,
          schedule: cap.schedule ?? null,
          isEnabled: cap.enabled ?? true,
        },
        create: {
          connectionId: connection.id,
          capability: cap.capability,
          priority: cap.priority,
          schedule: cap.schedule ?? null,
          isEnabled: cap.enabled ?? true,
          ...demo,
        },
      })
    }
  }

  const capCount = await prisma.supplierConnectionCapability.count()
  console.log(`  demo: ${definitions.length} leveranciersverbindingen met ${capCount} capabilities (alle inactief, geen credentials)`)
}

async function seedChannels() {
  const demo = { isDemo: true }

  const channel = await prisma.shopChannel.upsert({
    where: { key: 'webshop' },
    update: { name: 'Eigen webshop' },
    create: { key: 'webshop', name: 'Eigen webshop', type: 'PUBLIC', ...demo },
  })

  const products = await prisma.product.findMany({
    where: { isDemo: true },
    orderBy: { articleNumber: 'asc' },
    select: { id: true },
  })
  for (const [i, product] of products.entries()) {
    await prisma.channelAssortmentItem.upsert({
      where: { channelId_productId: { channelId: channel.id, productId: product.id } },
      update: {},
      create: { channelId: channel.id, productId: product.id, sort: i, ...demo },
    })
  }

  // Eén vertrekpunt-margeregel. Specifiekere regels per leverancier,
  // categorie of klant krijgen een lagere priority en gaan daarmee voor.
  const existing = await prisma.priceRule.findFirst({ where: { scope: 'GLOBAL', isDemo: true } })
  if (!existing) {
    await prisma.priceRule.create({
      data: { scope: 'GLOBAL', marginPercent: '110.00', priority: 1000, ...demo },
    })
  }

  console.log(`  demo: 1 kanaal met ${products.length} producten in het assortiment, 1 globale margeregel`)
}

// --- Demo: uitgaande zending met deellevering ------------------------------

async function seedDemoShipment() {
  const demo = { isDemo: true }

  const order = await prisma.order.findFirst({
    where: { isDemo: true },
    include: { lines: { orderBy: { lineNumber: 'asc' } }, customer: true },
    orderBy: { number: 'asc' },
  })
  if (!order || order.lines.length === 0) {
    console.log('  demo: geen order gevonden, zending overgeslagen')
    return
  }
  if (await prisma.shipment.findFirst({ where: { orderId: order.id } })) {
    console.log('  demo: 0 nieuwe zendingen')
    return
  }

  const line = order.lines[0]
  const deelAantal = Math.max(1, Math.floor(line.quantity / 2))
  const number = await prisma.$transaction((tx) => issueNumber(tx, 'SHIPMENT', YEAR))
  const deliveryAddress = await prisma.address.findFirst({
    where: { customerId: order.customerId, type: 'DELIVERY' },
  })

  const shipment = await prisma.shipment.create({
    data: {
      number,
      orderId: order.id,
      deliveryAddressId: deliveryAddress?.id,
      method: 'OWN_SHIPMENT',
      status: 'DELIVERED',
      carrier: 'PostNL',
      trackingCode: '3SDEMO0000001',
      shippedAt: new Date(Date.now() - 2 * 86400000),
      deliveredAt: new Date(Date.now() - 1 * 86400000),
      recipientName: 'Demo Inkoper',
      notes: 'Eerste deellevering. De order blijft daarmee bewust niet volledig geleverd.',
      ...demo,
      items: { create: [{ orderLineId: line.id, quantity: deelAantal, ...demo }] },
    },
  })

  // Statussen afgeleid uit de zending, niet handmatig gezet.
  const geleverd = deelAantal
  const lineStatus = deriveLineLogisticsStatus(
    { quantity: line.quantity, shipped: geleverd, delivered: geleverd },
    line.logisticsStatus as never,
  )
  await prisma.orderLine.update({
    where: { id: line.id },
    data: { logisticsStatus: lineStatus as never },
  })

  await prisma.document.create({
    data: {
      category: 'PACKING_SLIP',
      title: `Pakbon ${number}`,
      visibility: 'CUSTOMER',
      customerId: order.customerId,
      orderId: order.id,
      shipmentId: shipment.id,
      ...demo,
      versions: {
        create: [{
          versionNumber: 1,
          storageKey: `demo/shipments/${shipment.id}/pakbon.pdf`,
          fileName: `${number}.pdf`,
          mimeType: 'application/pdf',
          sizeBytes: 1024,
          checksum: 'demo-checksum-pakbon',
        }],
      },
    },
  })

  const volledig = isOrderFullyDelivered(
    order.lines.map((l) => ({
      quantity: l.quantity,
      shipped: l.id === line.id ? geleverd : 0,
      delivered: l.id === line.id ? geleverd : 0,
    })),
  )
  console.log(`  demo: 1 zending ${number} met ${deelAantal} van ${line.quantity} stuks; order volledig geleverd: ${volledig}`)
}

// --- Demo: herkomst uit Teamleader ----------------------------------------

async function seedDemoExternalReferences() {
  const customers = await prisma.customer.findMany({ where: { isDemo: true }, orderBy: { number: 'asc' } })
  for (const customer of customers) {
    await prisma.externalReference.upsert({
      where: {
        system_entityType_entityId: {
          system: 'TEAMLEADER',
          entityType: 'Customer',
          entityId: customer.id,
        },
      },
      update: { externalNumber: customer.number },
      create: {
        system: 'TEAMLEADER',
        entityType: 'Customer',
        entityId: customer.id,
        externalId: `TL-DEMO-${customer.number}`,
        externalNumber: customer.number,
        isDemo: true,
      },
    })
  }
  console.log(`  demo: ${customers.length} externe verwijzingen naar Teamleader`)
}

async function main() {
  console.log('seed start')
  await seedPermissions()
  await seedBaseData()
  const { users } = await seedDemo()
  await seedDemoQuotesAndOrders(users)
  await seedConnections()
  await seedChannels()
  await seedDemoShipment()
  await seedDemoExternalReferences()

  const counts = {
    klanten: await prisma.customer.count(),
    offertes: await prisma.quote.count(),
    offerteversies: await prisma.quoteVersion.count(),
    orders: await prisma.order.count(),
    orderregels: await prisma.orderLine.count(),
    gebeurtenissen: await prisma.orderEvent.count(),
    producten: await prisma.product.count(),
    verbindingen: await prisma.supplierConnection.count(),
    kanalen: await prisma.shopChannel.count(),
    zendingen: await prisma.shipment.count(),
    externeVerwijzingen: await prisma.externalReference.count(),
    demorijen: await prisma.customer.count({ where: { isDemo: true } }),
  }
  console.log('seed klaar:', counts)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
