import { describe, expect, it } from 'vitest'
import { PfConceptConnector, type Ophaler } from '../src/core/connectors/pfconcept/pfconcept.connector'
import { ConnectorError, type ConnectorContext } from '../src/core/connectors/connector.types'
import {
  PRICE_FEED, PRINT_DATA_FEED, PRINT_PRICE_FEED, PRODUCT_FEED, STOCK_FEED,
} from './fixtures/pfconcept'

/**
 * De PF Concept-connector tegen hun eigen voorbeelden uit de handleiding
 * v3.6.7. Geen netwerk: de ophaalfunctie is vervangen.
 *
 * Deze tests bewijzen dat wij de gedocumenteerde vorm goed lezen. Ze bewijzen
 * niet dat de echte bestanden er zo uitzien - de feeds zijn nog niet
 * geactiveerd. Bij midocean week de werkelijkheid op drie punten af van de
 * handleiding, dus de eerste echte respons blijft de toets.
 */

const context: ConnectorContext = {
  config: { language: 'nl', department: 'cnl1', assortment: 'stock' },
  credentials: { uniqueCode: 'GEHEIM123' },
}

function stub(antwoord: unknown, status = 200) {
  const urls: string[] = []
  const ophaler: Ophaler = async (url) => {
    urls.push(url)
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'stub',
      json: async () => antwoord,
    } as Response
  }
  return { ophaler, urls }
}

describe('PF Concept: welke bestanden worden opgehaald', () => {
  it('bouwt de bestandsnamen zoals de handleiding ze noemt', async () => {
    const product = stub(PRODUCT_FEED)
    await new PfConceptConnector(product.ophaler).fetchCatalog(context)
    expect(product.urls[0]).toBe('https://www.pfconcept.com/portal/datafeed/productfeed_nl_v3.json')

    const printdata = stub(PRINT_DATA_FEED)
    await new PfConceptConnector(printdata.ophaler).fetchPrintData(context)
    expect(printdata.urls[0]).toBe(
      'https://www.pfconcept.com/portal/datafeed/printdata_cnl1_nl_v3.json',
    )
  })

  it('zet de geheime code in de bestandsnaam van de geactiveerde feeds', async () => {
    const prijs = stub(PRICE_FEED)
    await new PfConceptConnector(prijs.ophaler).fetchPrices(context)
    expect(prijs.urls[0]).toBe(
      'https://www.pfconcept.com/portal/datafeed/pricefeed_GEHEIM123_v3.json',
    )

    const druk = stub(PRINT_PRICE_FEED)
    await new PfConceptConnector(druk.ophaler).fetchPrintPriceTiers(context)
    expect(druk.urls[0]).toBe(
      'https://www.pfconcept.com/portal/datafeed/printpricefeed_GEHEIM123_v3.json',
    )
  })

  it('kiest het juiste bestand per assortiment', async () => {
    const label = stub(PRINT_DATA_FEED)
    await new PfConceptConnector(label.ophaler).fetchPrintData({
      ...context, config: { ...context.config, assortment: 'label' },
    })
    expect(label.urls[0]).toContain('printdata_cnl1_nl_label_v3.json')

    const ws = stub(PRINT_DATA_FEED)
    await new PfConceptConnector(ws.ophaler).fetchPrintData({
      ...context, config: { ...context.config, assortment: 'worldsource' },
    })
    expect(ws.urls[0]).toContain('printdataws_cnl1_nl_v3.json')
  })

  it('weigert een assortiment dat PF Concept niet kent', async () => {
    const { ophaler } = stub(PRINT_DATA_FEED)
    await expect(
      new PfConceptConnector(ophaler).fetchPrintData({
        ...context, config: { ...context.config, assortment: 'verzonnen' },
      }),
    ).rejects.toThrow(/stock, label en worldsource/)
  })

  it('zegt het als er geen unieke code is opgeslagen', async () => {
    const { ophaler } = stub(PRICE_FEED)
    await expect(
      new PfConceptConnector(ophaler).fetchPrices({ ...context, credentials: {} }),
    ).rejects.toThrow(/geen unieke code/)
  })

  it('legt uit wat een 404 op een prijsfeed betekent', async () => {
    const { ophaler } = stub(null, 404)
    const fout = await new PfConceptConnector(ophaler).fetchPrices(context).catch((e) => e)

    expect(fout).toBeInstanceOf(ConnectorError)
    // De prijsfeed wordt alleen op zaterdag gegenereerd; vlak na activering is
    // een 404 dus te verwachten en geen verkeerde code.
    expect(fout.message).toContain('zaterdag 14:00')
  })
})

describe('PF Concept: catalogus', () => {
  it('leest model als product en item als variant', async () => {
    const { ophaler } = stub(PRODUCT_FEED)
    const records = await new PfConceptConnector(ophaler).fetchCatalog(context)

    expect(records).toHaveLength(1)
    const product = records[0].value
    expect(product.externalId).toBe('100002')
    expect(product.name).toBe('Oregon 400 ml water bottle with carabiner')
    expect(product.variants.map((v) => v.sku)).toEqual(['10000200', '10000201'])
  })

  it('haalt merk, materiaal en herkomst uit het eerste item dat iets zegt', async () => {
    // PF zet die velden per item, wij houden ze per product aan. Het tweede
    // item in het voorbeeld heeft ze niet; dat mag het product niet leeg maken.
    const { ophaler } = stub(PRODUCT_FEED)
    const product = (await new PfConceptConnector(ophaler).fetchCatalog(context))[0].value

    expect(product.brand).toBe('Bullet')
    expect(product.material).toBe('Aluminium')
    expect(product.countryOfOrigin).toBe('CN')
    expect(product.commodityCode).toBe('7612901000')
    expect(product.categoryPath).toEqual(['Drinkware', 'Bottles'])
  })

  it('neemt de kleur van de variant over, met pantone', async () => {
    const { ophaler } = stub(PRODUCT_FEED)
    const [eerste, tweede] = (
      await new PfConceptConnector(ophaler).fetchCatalog(context)
    )[0].value.variants

    expect(eerste.colorCode).toBe('21')
    expect(eerste.colorName).toBe('Silver')
    expect(eerste.colorGroup).toBe('Grey')
    expect(eerste.pmsColor).toBe('Cool Gray 1 C')
    expect(tweede.colorName).toBe('Solid black')
  })

  it('markeert een uitlopend artikel, ook als het als tekst "true" komt', async () => {
    // Dit is het signaal dat harde regel 12 vraagt: PF zegt dat een artikel
    // uitloopt in plaats van het stilletjes uit de feed te laten verdwijnen.
    const { ophaler } = stub(PRODUCT_FEED)
    const [eerste, tweede] = (
      await new PfConceptConnector(ophaler).fetchCatalog(context)
    )[0].value.variants

    expect(eerste.lifecycleStatus).toBeNull()
    expect(tweede.lifecycleStatus).toBe('DISCONTINUED')
  })

  it('maakt van bestandsnamen volledige afbeeldings-URLs, zonder dubbelen', async () => {
    const { ophaler } = stub(PRODUCT_FEED)
    const variant = (await new PfConceptConnector(ophaler).fetchCatalog(context))[0].value.variants[0]

    expect(variant.images[0].url).toBe(
      'https://images.pfconcept.com/ProductImages_All/JPG/500x500/10000200_main.jpg',
    )
    expect(variant.images[0].highResUrl).toContain('1600x1600')
    expect(variant.images).toHaveLength(3)
  })

  it('vertaalt een opgeslagen payload tot hetzelfde product', async () => {
    const { ophaler } = stub(PRODUCT_FEED)
    const connector = new PfConceptConnector(ophaler)
    const record = (await connector.fetchCatalog(context))[0]

    expect(connector.parseProduct(record.payload)).toEqual(record.value)
  })
})

describe('PF Concept: prijzen', () => {
  it('leest priceBar als beginaantal van de staffel', async () => {
    // Dit is het verschil met ANDA: daar is het een gesloten bereik en kan een
    // gat tussen twee bereiken stil opgevuld worden. Hier is het onze
    // minQuantity.
    const { ophaler } = stub(PRICE_FEED)
    const prijs = (await new PfConceptConnector(ophaler).fetchPrices(context))[0].value

    expect(prijs.sku).toBe('10001000')
    expect(prijs.currency).toBe('EUR')
    expect(prijs.tiers).toEqual([
      { minimumQuantity: 1, unitPrice: '10.49' },
      { minimumQuantity: 25, unitPrice: '10.49' },
      { minimumQuantity: 50, unitPrice: '10.2' },
      { minimumQuantity: 100, unitPrice: '9.95' },
    ])
    expect(prijs.unitPrice).toBe('10.49')
  })

  it('neemt de industrieprijs niet over als inkoopprijs', async () => {
    // industryCol staat in dezelfde schaal en is bijna drie keer zo hoog.
    const { ophaler } = stub(PRICE_FEED)
    const prijs = (await new PfConceptConnector(ophaler).fetchPrices(context))[0].value

    expect(prijs.tiers.map((t) => t.unitPrice)).not.toContain('26.69')
  })

  it('bewaart het minimum bedrukkingsaantal en de drukcodes', async () => {
    // Beide komen uit de prijsfeed en zijn nodig voor de drukprijs: onder
    // minDecoQty rekent PF een toeslag (LTMCharge).
    const { ophaler } = stub(PRICE_FEED)
    const prijs = (await new PfConceptConnector(ophaler).fetchPrices(context))[0].value

    expect(prijs.minDecoQuantity).toBe(10)
    expect(prijs.printCodes).toEqual(['DOM001', 'DST01', 'GPE05', 'PAD05', 'LAS04'])
  })
})

describe('PF Concept: voorraad', () => {
  it('leest de directe voorraad en de eerstvolgende inkooporder', async () => {
    const { ophaler } = stub(STOCK_FEED)
    const records = await new PfConceptConnector(ophaler).fetchStock(context)

    const eerste = records[0].value
    expect(eerste.sku).toBe('10000200')
    expect(eerste.quantity).toBe(1240)
    expect(eerste.firstArrivalQuantity).toBe(5000)
    expect(eerste.firstArrivalDate?.toISOString().slice(0, 10)).toBe('2026-12-15')
  })

  it('laat verdere binnenkomende voorraad zonder datum staan', async () => {
    // StockFuture is alles daarna bij elkaar, exclusief de eerstvolgende
    // inkooporder, en komt zonder datum. Een aantal zonder datum is geen
    // levering, dus verzinnen we er geen.
    const { ophaler } = stub(STOCK_FEED)
    const eerste = (await new PfConceptConnector(ophaler).fetchStock(context))[0].value

    expect(eerste.nextArrivalQuantity).toBe(12000)
    expect(eerste.nextArrivalDate).toBeNull()
  })

  it('laat een lege datum leeg in plaats van ongeldig', async () => {
    const { ophaler } = stub(STOCK_FEED)
    const tweede = (await new PfConceptConnector(ophaler).fetchStock(context))[1].value

    expect(tweede.quantity).toBe(0)
    expect(tweede.firstArrivalDate).toBeNull()
  })
})

describe('PF Concept: drukgegevens', () => {
  it('lost de verwijzingen per artikel op naar de rijen', async () => {
    const { ophaler } = stub(PRINT_DATA_FEED)
    const records = await new PfConceptConnector(ophaler).fetchPrintData(context)

    const druk = records[0].value
    expect(druk.externalId).toBe('100002')
    // Twee verwijzingen op dezelfde positie, dus één positie met twee
    // technieken. Rij 9 hoort bij geen enkel artikel en telt niet mee.
    expect(druk.positions).toHaveLength(1)
    expect(druk.positions[0].positionCode).toBe('wrap (1 color)')
    expect(druk.positions[0].techniques.map((t) => t.code)).toEqual(['GPE02', 'DST01'])
  })

  it('neemt de maximale drukmaat over', async () => {
    const { ophaler } = stub(PRINT_DATA_FEED)
    const positie = (await new PfConceptConnector(ophaler).fetchPrintData(context))[0].value
      .positions[0]

    expect(positie.maxWidthMm).toBe(170)
    expect(positie.maxHeightMm).toBe(90)
  })

  it('leest fullcolour als "geen kleurbegrenzing" en niet als nul kleuren', async () => {
    // maxColours is een getal, behalve bij fullcolour; dan staat er tekst. Nul
    // betekent in onze catalogus "geen begrenzing", en dat klopt hier: bij
    // fullcolour wordt niet per kleur gerekend.
    const { ophaler } = stub(PRINT_DATA_FEED)
    const technieken = (await new PfConceptConnector(ophaler).fetchPrintData(context))[0].value
      .positions[0].techniques

    expect(technieken.find((t) => t.code === 'GPE02')?.maxColors).toBe(1)
    expect(technieken.find((t) => t.code === 'DST01')?.maxColors).toBe(0)
  })

  it('markeert de standaardtechniek', async () => {
    const { ophaler } = stub(PRINT_DATA_FEED)
    const technieken = (await new PfConceptConnector(ophaler).fetchPrintData(context))[0].value
      .positions[0].techniques

    expect(technieken.find((t) => t.code === 'GPE02')?.isDefault).toBe(true)
    expect(technieken.find((t) => t.code === 'DST01')?.isDefault).toBe(false)
  })

  it('weigert een feed zonder printFeedRows in plaats van lege opties te maken', async () => {
    // Zonder die rijen zijn de verwijzingen niet op te lossen en zou elk
    // artikel zonder bedrukopties binnenkomen. Dat lijkt op een geslaagde
    // import en is het niet.
    const zonderRijen = {
      printfeed: [{ models: PRINT_DATA_FEED.printfeed[0].models, printFeedRows: [] }],
    }
    const { ophaler } = stub(zonderRijen)

    await expect(new PfConceptConnector(ophaler).fetchPrintData(context)).rejects.toThrow(
      /geen printFeedRows/,
    )
  })
})

describe('PF Concept: drukprijzen', () => {
  it('slaat de opzoektabel plat tot staffels', async () => {
    const { ophaler } = stub(PRINT_PRICE_FEED)
    const lijst = await new PfConceptConnector(ophaler).fetchPrintPriceTiers(context)

    expect(lijst.currency).toBe('EUR')
    expect(lijst.tiers).toHaveLength(10)
    expect(lijst.tiers[0]).toEqual({
      printCode: 'DEB02',
      logoSizeCm2: 0,
      colors: 1,
      minQuantity: 1,
      unitPrice: '1.71',
      setupCost: '45',
    })
    expect(lijst.tiers.at(-1)).toEqual({
      printCode: 'DEB02',
      logoSizeCm2: 0,
      colors: 1,
      minQuantity: 5000,
      unitPrice: '0.35',
      setupCost: '45',
    })
  })

  it('bewaart de toeslag onder het minimumaantal en waar de prijs van afhangt', async () => {
    const { ophaler } = stub(PRINT_PRICE_FEED)
    const lijst = await new PfConceptConnector(ophaler).fetchPrintPriceTiers(context)

    expect(lijst.methods).toEqual([
      {
        printCode: 'DEB02',
        description: 'Blinddruk',
        ltmCharge: '15',
        // Ruwe tekst: welke waarden PF hier gebruikt is nog niet bevestigd, en
        // een aanname zou hier een verkeerde prijs opleveren.
        priceDependence: 'None',
      },
    ])
  })

  it('zet de staffels op volgorde van aantal', async () => {
    const { ophaler } = stub(PRINT_PRICE_FEED)
    const aantallen = (await new PfConceptConnector(ophaler).fetchPrintPriceTiers(context)).tiers
      .map((t) => t.minQuantity)

    expect(aantallen).toEqual([...aantallen].sort((a, b) => a - b))
  })

  it('weigert een lege drukprijslijst', async () => {
    const { ophaler } = stub({ decoCharges: [{ currency: 'EUR', decoCharge: [] }] })
    await expect(new PfConceptConnector(ophaler).fetchPrintPriceTiers(context)).rejects.toThrow(
      /geen drukcodes/,
    )
  })
})
