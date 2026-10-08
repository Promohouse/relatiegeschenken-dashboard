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
import { createPrismaClient, issueNumber } from '../src/index'
import { calculateOrderLine, sumOrderTotals } from '@rgh/contracts'

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

  const settings = [
    { key: 'vat.rounding', value: 'PER_LINE_2_DECIMALS', description: 'Btw per orderregel afronden op twee decimalen (ADR-0005).' },
    { key: 'vat.defaultCode', value: 'NL21', description: 'Standaard btw-tarief voor nieuwe orderregels.' },
    { key: 'company.name', value: 'Relatiegeschenken Hub', description: 'Naam zoals op documenten.' },
    { key: 'demo.enabled', value: true, description: 'Toont de demodata-waarschuwing in de interface.' },
  ]
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: { value: s.value as never, description: s.description },
      create: { key: s.key, value: s.value as never, description: s.description },
    })
  }

  // Nummerreeksen. Formaat en startwaarde zijn later te wijzigen via
  // Instellingen, ook als er al nummers zijn uitgegeven.
  const sequences = [
    { key: 'QUOTE', year: YEAR, format: 'OFF-{year}-{counter:5}' },
    { key: 'ORDER', year: YEAR, format: 'ORD-{year}-{counter:5}' },
    { key: 'PURCHASE_ORDER', year: YEAR, format: 'INK-{year}-{counter:5}' },
    { key: 'CUSTOMER', year: 0, format: '{counter:5}', start: 10000 },
  ]
  for (const s of sequences) {
    await prisma.numberSequence.upsert({
      where: { key_year: { key: s.key, year: s.year } },
      update: { format: s.format },
      create: { key: s.key, year: s.year, format: s.format, lastValue: s.start ?? 0 },
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

  console.log(`  basisgegevens: ${vatRates.length} btw-tarieven, ${settings.length} instellingen, ${sequences.length} nummerreeksen, ${printMethods.length} bedrukkingstechnieken`)
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
      where: { productId_printMethodId_position: { productId: product.id, printMethodId: def.method, position: 'voorzijde' } },
      update: { setupCost: def.setup },
      create: { productId: product.id, printMethodId: def.method, position: 'voorzijde', maxColors: 4, setupCost: def.setup, ...demo },
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

// --- Demo-klanten en -orders ----------------------------------------------

async function seedDemoOrders(users: { id: string; email: string }[]) {
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
    const customer = await prisma.customer.create({
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
            { firstName: 'Demo', lastName: 'Inkoper', email: `inkoop@demo.local`, isPrimary: true, ...demo },
            { firstName: 'Demo', lastName: 'Marketing', email: `marketing@demo.local`, ...demo },
          ],
        },
        addresses: {
          create: [
            { type: 'INVOICE', label: 'Factuuradres', street: 'Voorbeeldstraat', houseNumber: '1', postalCode: '8000 AA', city: def.city, isDefault: true, ...demo },
            { type: 'DELIVERY', label: 'Hoofdvestiging', street: 'Voorbeeldweg', houseNumber: '25', postalCode: '8000 BB', city: def.city, isDefault: true, ...demo },
          ],
        },
      },
    })
    customers.push(customer)
  }

  // Eén offerte en twee orders, met regels, tijdlijn, document en taak.
  const products = await prisma.product.findMany({
    where: { isDemo: true },
    include: { suppliers: { include: { supplier: true } }, printOptions: { include: { printMethod: true } } },
  })

  const orderPlans = [
    { kind: 'QUOTE' as const, status: 'QUOTE_SENT' as const, customer: 0, owner: sales.id, lines: [0, 1] },
    { kind: 'ORDER' as const, status: 'ACTIVE' as const, customer: 1, owner: orderDesk.id, lines: [2] },
    { kind: 'ORDER' as const, status: 'ACTIVE' as const, customer: 2, owner: orderDesk.id, lines: [0, 3] },
  ]

  let created = 0
  for (const plan of orderPlans) {
    const customer = customers[plan.customer]
    const existing = await prisma.order.findFirst({ where: { customerId: customer.id, kind: plan.kind, isDemo: true } })
    if (existing) continue

    const contact = await prisma.contactPerson.findFirstOrThrow({ where: { customerId: customer.id, isPrimary: true } })
    const invoiceAddress = await prisma.address.findFirstOrThrow({ where: { customerId: customer.id, type: 'INVOICE' } })
    const deliveryAddress = await prisma.address.findFirstOrThrow({ where: { customerId: customer.id, type: 'DELIVERY' } })

    const number = await prisma.$transaction((tx) =>
      issueNumber(tx, plan.kind === 'QUOTE' ? 'QUOTE' : 'ORDER', YEAR),
    )

    const lineInputs = plan.lines.map((idx, i) => {
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
      return { product, ps, option, quantity, unitSalePrice, printJobs, totals }
    })

    const orderTotals = sumOrderTotals(lineInputs.map((l) => l.totals))

    const order = await prisma.order.create({
      data: {
        number,
        kind: plan.kind,
        status: plan.status,
        customerId: customer.id,
        contactPersonId: contact.id,
        ownerId: plan.owner,
        invoiceAddressId: invoiceAddress.id,
        deliveryAddressId: deliveryAddress.id,
        requestedDeliveryDate: new Date(Date.now() + 21 * 86400000),
        reference: 'Demo-referentie',
        notes: 'Demodata voor ontwikkeling.',
        subtotalExclVat: orderTotals.subtotalExclVat.toFixed(2),
        vatAmount: orderTotals.vatAmount.toFixed(2),
        totalInclVat: orderTotals.totalInclVat.toFixed(2),
        purchaseTotal: orderTotals.purchaseTotal.toFixed(2),
        marginAmount: orderTotals.marginAmount.toFixed(2),
        ...demo,
        lines: {
          create: lineInputs.map((l, i) => ({
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
            setupCost: '0',
            vatRate: '21',
            lineSubtotalExclVat: l.totals.subtotalExclVat.toFixed(2),
            lineVatAmount: l.totals.vatAmount.toFixed(2),
            lineTotalInclVat: l.totals.totalInclVat.toFixed(2),
            linePurchaseTotal: l.totals.purchaseTotal.toFixed(2),
            lineMarginAmount: l.totals.marginAmount.toFixed(2),
            proofStatus: plan.kind === 'ORDER' ? 'REQUESTED' : 'NOT_REQUIRED',
            purchaseStatus: 'NOT_ORDERED',
            logisticsStatus: 'NONE',
            ...demo,
            printJobs: l.option
              ? {
                  create: [{
                    printMethodId: l.option.printMethodId,
                    printMethodName: l.option.printMethod.name,
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
        events: {
          create: [
            { type: 'REQUEST_RECEIVED', userId: plan.owner, note: 'Aanvraag per e-mail ontvangen.' },
            { type: 'QUOTE_CREATED', userId: plan.owner, statusDimension: 'MAIN', toValue: 'QUOTE_SENT' },
            ...(plan.kind === 'ORDER'
              ? [
                  { type: 'QUOTE_ACCEPTED' as const, userId: plan.owner },
                  { type: 'ORDER_CREATED' as const, userId: plan.owner, statusDimension: 'MAIN' as const, toValue: 'ACTIVE' },
                  { type: 'PROOF_REQUESTED' as const, userId: plan.owner, statusDimension: 'PROOF' as const, toValue: 'REQUESTED' },
                ]
              : []),
          ],
        },
        tasks: {
          create: [{
            title: plan.kind === 'QUOTE' ? 'Offerte nabellen' : 'Drukproef bij leverancier opvragen',
            assigneeId: plan.owner,
            createdById: plan.owner,
            dueDate: new Date(Date.now() + 3 * 86400000),
            priority: 'NORMAL',
            ...demo,
          }],
        },
      },
    })

    await prisma.document.create({
      data: {
        category: plan.kind === 'QUOTE' ? 'QUOTE' : 'ORDER_CONFIRMATION',
        title: `${plan.kind === 'QUOTE' ? 'Offerte' : 'Orderbevestiging'} ${number}`,
        visibility: 'CUSTOMER',
        customerId: customer.id,
        orderId: order.id,
        createdById: plan.owner,
        ...demo,
        versions: {
          create: [{
            versionNumber: 1,
            storageKey: `demo/${order.id}/v1.pdf`,
            fileName: `${number}.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 1024,
            checksum: 'demo-checksum',
            uploadedById: plan.owner,
            note: 'Demodocument zonder echt bestand.',
          }],
        },
      },
    })
    created++
  }

  console.log(`  demo: ${customers.length} klanten, ${created} nieuwe orders met regels, tijdlijn, document en taak`)
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
      supplier: 'MIDOCEAN', key: 'midocean-sftp', connectorKey: 'midocean-sftp', transport: 'SFTP',
      notes: 'Productdata via SFTP in XML (Prodinfo). Toegang aanvragen via het portaal.',
      capabilities: [
        { capability: 'CATALOG', priority: 10, schedule: '0 2 * * *' },
        { capability: 'MEDIA', priority: 10, schedule: '30 2 * * *' },
        { capability: 'PRICE_TIERS', priority: 10, schedule: '0 2 * * *' },
      ],
    },
    {
      supplier: 'MIDOCEAN', key: 'midocean-api', connectorKey: 'midocean-api', transport: 'REST',
      notes: 'Customer API voor voorraad, ordermanagement en drukconfiguratie.',
      capabilities: [
        { capability: 'INVENTORY', priority: 10, schedule: '0 * * * *' },
        { capability: 'PLACE_ORDER', priority: 10 },
        { capability: 'ORDER_STATUS', priority: 10, schedule: '0 8,16 * * *' },
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

    for (const cap of def.capabilities) {
      await prisma.supplierConnectionCapability.upsert({
        where: { connectionId_capability: { connectionId: connection.id, capability: cap.capability } },
        update: { priority: cap.priority, schedule: cap.schedule ?? null },
        create: {
          connectionId: connection.id,
          capability: cap.capability,
          priority: cap.priority,
          schedule: cap.schedule ?? null,
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

  const products = await prisma.product.findMany({ where: { isDemo: true }, select: { id: true } })
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

async function main() {
  console.log('seed start')
  await seedPermissions()
  await seedBaseData()
  const { users } = await seedDemo()
  await seedDemoOrders(users)
  await seedConnections()
  await seedChannels()

  const counts = {
    klanten: await prisma.customer.count(),
    orders: await prisma.order.count(),
    orderregels: await prisma.orderLine.count(),
    gebeurtenissen: await prisma.orderEvent.count(),
    producten: await prisma.product.count(),
    verbindingen: await prisma.supplierConnection.count(),
    kanalen: await prisma.shopChannel.count(),
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
