import { describe, expect, it } from 'vitest'
import { AndaConnector, type Ophaler } from '../src/core/connectors/anda/anda.connector'
import { ConnectorError, type ConnectorContext } from '../src/core/connectors/connector.types'
import { INVENTORY_XML, LABELING_XML, PRICE_XML, PRODUCT_XML } from './fixtures/anda'

/**
 * De ANDA-connector tegen hun voorbeeld-XML uit handleiding v3.2. Geen
 * netwerk: de ophaalfunctie is vervangen.
 *
 * Deze tests bewijzen dat wij de gedocumenteerde vorm goed lezen, niet dat de
 * echte bestanden er zo uitzien - de feeds zijn nog niet geactiveerd.
 */

const context: ConnectorContext = {
  config: { language: 'nl' },
  credentials: { uniqueId: 'GEHEIM-ID' },
}

function stub(xml: string, status = 200) {
  const urls: string[] = []
  const ophaler: Ophaler = async (url) => {
    urls.push(url)
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'stub',
      text: async () => xml,
    } as Response
  }
  return { ophaler, urls }
}

describe('ANDA: toegang', () => {
  it('zet de geheime id in de URL, met taal waar die hoort', async () => {
    const product = stub(PRODUCT_XML)
    await new AndaConnector(product.ophaler).fetchCatalog(context)
    expect(product.urls[0]).toBe('https://xml.andapresent.com/export/products/nl/GEHEIM-ID')

    // De prijsfeed kent geen taal; die staat niet in het pad.
    const prijs = stub(PRICE_XML)
    await new AndaConnector(prijs.ophaler).fetchPrices(context)
    expect(prijs.urls[0]).toBe('https://xml.andapresent.com/export/prices/GEHEIM-ID')
  })

  it('gebruikt een id per feed als die er is', async () => {
    const { ophaler, urls } = stub(PRICE_XML)
    await new AndaConnector(ophaler).fetchPrices({
      ...context, credentials: { uniqueId: 'ALGEMEEN', priceId: 'EIGEN-PRIJS-ID' },
    })
    expect(urls[0]).toContain('/prices/EIGEN-PRIJS-ID')
  })

  it('zegt het als er geen id is opgeslagen', async () => {
    const { ophaler } = stub(PRODUCT_XML)
    await expect(
      new AndaConnector(ophaler).fetchCatalog({ ...context, credentials: {} }),
    ).rejects.toThrow(/geen unieke id/)
  })

  it('wijst bij een weigering naar het IP-adres en niet naar de sleutel', async () => {
    // Bij ANDA is "access denied" bijna altijd het IP-adres. Wie dat voor een
    // verkeerde sleutel aanziet zoekt uren in de verkeerde hoek.
    const { ophaler } = stub('', 403)
    const fout = await new AndaConnector(ophaler).fetchCatalog(context).catch((e) => e)

    expect(fout).toBeInstanceOf(ConnectorError)
    expect(fout.message).toContain('IP-adres')
  })

  it('legt uit dat een bestand na activering nog gemaakt moet worden', async () => {
    const { ophaler } = stub('', 404)
    const fout = await new AndaConnector(ophaler).fetchCatalog(context).catch((e) => e)
    expect(fout.message).toContain('24 uur')
  })
})

describe('ANDA: catalogus', () => {
  it('groepeert artikelnummers op rootItemNumber tot één product', async () => {
    // Dit is het grote verschil met PF Concept: ANDA kent geen variantenblok,
    // elke kleur is een eigen artikelnummer. Zonder deze groepering zou elke
    // kleur een eigen product worden en klopt geen enkele inkoopstaffel meer.
    const { ophaler } = stub(PRODUCT_XML)
    const records = await new AndaConnector(ophaler).fetchCatalog(context)

    const beker = records.find((r) => r.externalId === 'AP741951')
    expect(beker).toBeDefined()
    expect(beker!.value.variants.map((v) => v.sku)).toEqual(['AP741951-02', 'AP741951-10'])
  })

  it('laat onderdelen van een samengesteld artikel buiten de catalogus', async () => {
    // assemblyProduct = 1 is een onderdeel, niet iets wat los verkocht wordt.
    const { ophaler } = stub(PRODUCT_XML)
    const records = await new AndaConnector(ophaler).fetchCatalog(context)

    expect(records.map((r) => r.externalId)).not.toContain('AP892006')
    expect(records).toHaveLength(1)
  })

  it('haalt materiaal en afmeting uit de specificatie-eigenschappen', async () => {
    const { ophaler } = stub(PRODUCT_XML)
    const product = (await new AndaConnector(ophaler).fetchCatalog(context))[0].value

    expect(product.name).toBe('customisable thermo mug')
    expect(product.brand).toBe('ANDA')
    expect(product.material).toBe('Plastic')
    expect(product.dimensions).toBe('ø85×155 mm')
    expect(product.commodityCode).toBe('3924100090')
  })

  it('zet de categorieën van grof naar fijn', async () => {
    const { ophaler } = stub(PRODUCT_XML)
    const product = (await new AndaConnector(ophaler).fetchCatalog(context))[0].value

    expect(product.categoryPath).toEqual([
      'Food and Drinkware',
      'Flasks and thermo mugs',
      'Travel and Thermo mugs',
    ])
  })

  it('markeert een tijdelijk niet leverbaar artikel', async () => {
    const { ophaler } = stub(PRODUCT_XML)
    const [geel, zwart] = (await new AndaConnector(ophaler).fetchCatalog(context))[0].value.variants

    expect(geel.colorName).toBe('yellow')
    expect(geel.colorCode).toBe('02')
    expect(geel.lifecycleStatus).toBeNull()
    expect(zwart.lifecycleStatus).toBe('TEMPORARILY_UNAVAILABLE')
  })

  it('houdt de kleurcode als tekst, zodat 02 geen 2 wordt', async () => {
    // XML kent geen typen. Zou de parser dit als getal lezen, dan verdwijnt
    // de voorloopnul en klopt de kleurcode niet meer.
    const { ophaler } = stub(PRODUCT_XML)
    const geel = (await new AndaConnector(ophaler).fetchCatalog(context))[0].value.variants[0]

    expect(geel.colorCode).toBe('02')
    expect(typeof geel.colorCode).toBe('string')
  })

  it('neemt certificaten en testrapporten mee als document', async () => {
    const { ophaler } = stub(PRODUCT_XML)
    const product = (await new AndaConnector(ophaler).fetchCatalog(context))[0].value

    expect(product.documents.map((d) => d.subtype)).toEqual([
      'declaration_of_conformity',
      'test_report',
    ])
  })

  it('vertaalt een opgeslagen payload tot hetzelfde product', async () => {
    const { ophaler } = stub(PRODUCT_XML)
    const connector = new AndaConnector(ophaler)
    const record = (await connector.fetchCatalog(context))[0]

    expect(connector.parseProduct(record.payload)).toEqual(record.value)
  })
})

describe('ANDA: prijzen', () => {
  it('neemt de distributeursprijs en niet de catalogusprijs', async () => {
    const { ophaler } = stub(PRICE_XML)
    const records = await new AndaConnector(ophaler).fetchPrices(context)

    const prijs = records.find((r) => r.externalId === 'AP810803-10_XS')
    expect(prijs!.value.unitPrice).toBe('2.5')
    expect(prijs!.value.currency).toBe('EUR')
  })

  it('slaat een artikel zonder inkoopprijs over', async () => {
    // Alleen een catalogusprijs. Die overnemen zou betekenen dat we onszelf
    // onze verkoopprijs als inkoop aanrekenen, en dan is elke marge nul.
    const { ophaler } = stub(PRICE_XML)
    const records = await new AndaConnector(ophaler).fetchPrices(context)

    expect(records.map((r) => r.externalId)).not.toContain('AP741951-02')
    expect(records).toHaveLength(1)
  })

  it('geeft een lege staffel, want die zit niet in deze feed', async () => {
    // Vastgelegd omdat het een echt verschil is met midocean en PF Concept:
    // ANDA levert één prijs per artikel, geen reeks vanaf-aantallen.
    const { ophaler } = stub(PRICE_XML)
    const prijs = (await new AndaConnector(ophaler).fetchPrices(context))[0].value

    expect(prijs.tiers).toEqual([])
  })
})

describe('ANDA: voorraad', () => {
  it('telt alleen de direct leverbare voorraad als voorraad', async () => {
    // De vier soorten hebben elk een eigen levertijd. Optellen zou een
    // levertijd beloven die niet klopt: "direct" is iets anders dan "over
    // acht dagen".
    const { ophaler } = stub(INVENTORY_XML)
    const records = await new AndaConnector(ophaler).fetchStock(context)

    const artikel = records.find((r) => r.externalId === 'AP741878')!.value
    expect(artikel.quantity).toBe(12149)
  })

  it('zet de binnenkomende leveringen op datum, de eerste vooraan', async () => {
    const { ophaler } = stub(INVENTORY_XML)
    const artikel = (await new AndaConnector(ophaler).fetchStock(context))
      .find((r) => r.externalId === 'AP741878')!.value

    expect(artikel.firstArrivalDate?.toISOString().slice(0, 10)).toBe('2026-12-21')
    expect(artikel.firstArrivalQuantity).toBe(10000)
    expect(artikel.nextArrivalDate?.toISOString().slice(0, 10)).toBe('2027-01-10')
    expect(artikel.nextArrivalQuantity).toBe(20000)
  })

  it('laat externe voorraad niet verdwijnen als er geen leveringen zijn', async () => {
    // external_stock heeft geen datum en past daarmee niet in ons model, dat
    // met aankomstdatums werkt. Het komt mee als aantal zonder datum, zodat
    // het zichtbaar blijft.
    const { ophaler } = stub(INVENTORY_XML)
    const artikel = (await new AndaConnector(ophaler).fetchStock(context))
      .find((r) => r.externalId === 'AP892006')!.value

    expect(artikel.quantity).toBe(0)
    expect(artikel.nextArrivalQuantity).toBe(4500)
    expect(artikel.nextArrivalDate).toBeNull()
  })
})

describe('ANDA: drukgegevens', () => {
  it('leest posities met hun technieken', async () => {
    const { ophaler } = stub(LABELING_XML)
    const records = await new AndaConnector(ophaler).fetchPrintData(context)

    expect(records).toHaveLength(1)
    const druk = records[0].value
    // Per artikelnummer, dus per variant - niet per product. De koppeling
    // naar het product maakt de importstap.
    expect(druk.externalId).toBe('AP6155-06')
    expect(druk.positions.map((p) => p.positionCode)).toEqual(['I', 'II'])
    expect(druk.positions[0].techniques.map((t) => t.code)).toEqual(['P0', 'UVA'])
  })

  it('houdt de ruimste drukmaat van de positie aan', async () => {
    // ANDA zet de maximale maat per techniek. De positie biedt fysiek de
    // ruimste daarvan, en die maat bepaalt voortaan de drukprijs bij
    // technieken die per oppervlak rekenen.
    const { ophaler } = stub(LABELING_XML)
    const positie = (await new AndaConnector(ophaler).fetchPrintData(context))[0].value.positions[0]

    expect(positie.maxWidthMm).toBe(60)
    expect(positie.maxHeightMm).toBe(7)
  })

  it('leest "Full Color" als geen kleurbegrenzing', async () => {
    const { ophaler } = stub(LABELING_XML)
    const technieken = (await new AndaConnector(ophaler).fetchPrintData(context))[0].value
      .positions[0].techniques

    expect(technieken.find((t) => t.code === 'P0')?.maxColors).toBe(4)
    expect(technieken.find((t) => t.code === 'UVA')?.maxColors).toBe(0)
  })

  it('neemt de drukproefsjabloon over', async () => {
    const { ophaler } = stub(LABELING_XML)
    const druk = (await new AndaConnector(ophaler).fetchPrintData(context))[0].value

    expect(druk.templateUrl).toContain('printTemplate')
  })
})
