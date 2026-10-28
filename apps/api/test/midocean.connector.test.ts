import { describe, expect, it } from 'vitest'
import { MidoceanConnector, type Ophaler } from '../src/core/connectors/midocean/midocean.connector'
import { ConnectorError, type ConnectorContext } from '../src/core/connectors/connector.types'
import { PRIJS_ANTWOORD, PRODUCT_ANTWOORD, VOORRAAD_ANTWOORD } from './fixtures/midocean'

/**
 * De midocean-connector tegen hun eigen voorbeeldantwoorden uit de
 * handleiding. Geen netwerk: de ophaalfunctie is vervangen.
 */

const context: ConnectorContext = {
  config: { environment: 'test', language: 'nl' },
  credentials: { apiKey: 'test-sleutel' },
}

/** Een ophaalfunctie die een vast antwoord geeft en de aanroep vastlegt. */
function stub(antwoord: unknown, status = 200) {
  const aanroepen: { url: string; headers: Record<string, string> }[] = []
  const ophaler: Ophaler = async (url, init) => {
    aanroepen.push({ url, headers: init.headers })
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'stub',
      json: async () => antwoord,
    } as Response
  }
  return { ophaler, aanroepen }
}

describe('midocean: ophalen', () => {
  it('stuurt de sleutel in de header die hun handleiding voorschrijft', async () => {
    const { ophaler, aanroepen } = stub(PRODUCT_ANTWOORD)
    await new MidoceanConnector(ophaler).fetchCatalog(context)

    expect(aanroepen[0].headers['x-Gateway-APIKey']).toBe('test-sleutel')
    expect(aanroepen[0].url).toBe('https://apitest.midocean.com/gateway/products/2.0?language=nl')
  })

  it('gebruikt de productie-URL alleen als de koppeling dat zegt', async () => {
    const { ophaler, aanroepen } = stub(PRODUCT_ANTWOORD)
    await new MidoceanConnector(ophaler).fetchCatalog({
      ...context,
      config: { environment: 'production' },
    })
    expect(aanroepen[0].url).toContain('https://api.midocean.com/')
    // Zonder taal in de instellingen: Nederlands.
    expect(aanroepen[0].url).toContain('language=nl')
  })

  it('weigert een onbekende omgeving in plaats van productie te kiezen', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    await expect(
      new MidoceanConnector(ophaler).fetchCatalog({ ...context, config: { environment: 'live' } }),
    ).rejects.toThrow(/Onbekende omgeving/)
  })

  it('weigert zonder sleutel, in plaats van een lege header te sturen', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    await expect(
      new MidoceanConnector(ophaler).fetchCatalog({ ...context, credentials: {} }),
    ).rejects.toThrow(/geen API-sleutel/)
  })
})

describe('midocean: foutmeldingen uit hun Appendix C', () => {
  it('legt bij 401 uit dat het ook een ontbrekend abonnement kan zijn', async () => {
    const { ophaler } = stub(null, 401)
    await expect(new MidoceanConnector(ophaler).fetchCatalog(context))
      .rejects.toThrow(/niet geabonneerd op dit endpoint/)
  })

  it('legt bij 503 uit dat de testomgeving s avonds uit staat', async () => {
    const { ophaler } = stub(null, 503)
    await expect(new MidoceanConnector(ophaler).fetchCatalog(context))
      .rejects.toThrow(/buiten Europese kantooruren/)
  })

  it('draagt de bron en de status mee, zodat een importlog bruikbaar is', async () => {
    const { ophaler } = stub(null, 404)
    try {
      await new MidoceanConnector(ophaler).fetchStock(context)
      throw new Error('had moeten falen')
    } catch (fout) {
      expect(fout).toBeInstanceOf(ConnectorError)
      expect((fout as ConnectorError).bron).toBe('/gateway/stock/2.0')
      expect((fout as ConnectorError).status).toBe(404)
    }
  })
})

describe('midocean: producten vertalen', () => {
  it('maakt van hun AR1804 een product met twee varianten', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    const records = await new MidoceanConnector(ophaler).fetchCatalog(context)

    expect(records).toHaveLength(1)
    const product = records[0].value
    expect(records[0].externalId).toBe('AR1804')
    expect(product.articleNumber).toBe('AR1804')
    expect(product.name).toBe('ARCONOT')
    expect(product.material).toBe('PU')
    expect(product.printable).toBe(true)
    expect(product.dimensions).toBe('21X14X1,6 CM')
    expect(product.variants).toHaveLength(2)
  })

  it('houdt de categorie-indeling van grof naar fijn', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    const [record] = await new MidoceanConnector(ophaler).fetchCatalog(context)
    expect(record.value.categoryPath).toEqual(['Office & Writing', 'Notebooks', 'Hard cover'])
  })

  it('scheidt documenten van het artikel en afbeeldingen van de variant', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    const [record] = await new MidoceanConnector(ophaler).fetchCatalog(context)

    expect(record.value.documents.map((d) => d.subtype)).toEqual([
      'declaration_of_sustainability', 'declaration_of_conformity',
    ])
    const zwart = record.value.variants[0]
    expect(zwart.images).toHaveLength(2)
    expect(zwart.images[0].highResUrl).toContain('/original/')
    expect(record.value.variants[1].images).toHaveLength(0)
  })

  it('neemt kleurcode, gtin en levenscyclus over', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    const [record] = await new MidoceanConnector(ophaler).fetchCatalog(context)

    const zwart = record.value.variants[0]
    expect(zwart.sku).toBe('AR1804-03')
    expect(zwart.externalId).toBe('10168709')
    expect(zwart.colorCode).toBe('03')
    expect(zwart.colorName).toBe('black')
    expect(zwart.gtin).toBe('8719941012868')
    expect(zwart.lifecycleStatus).toBe('COLLECTION')
    expect(zwart.sizeCode).toBeNull()
  })

  it('bewaart de onbewerkte payload, zodat een import navraagbaar blijft', async () => {
    const { ophaler } = stub(PRODUCT_ANTWOORD)
    const [record] = await new MidoceanConnector(ophaler).fetchCatalog(context)
    expect(record.payload).toEqual(PRODUCT_ANTWOORD[0])
  })

  it('slaat een product zonder hoofdartikelnummer over in plaats van te stoppen', async () => {
    const { ophaler } = stub([{ product_name: 'Naamloos' }, PRODUCT_ANTWOORD[0]])
    const records = await new MidoceanConnector(ophaler).fetchCatalog(context)
    expect(records.map((r) => r.externalId)).toEqual(['AR1804'])
  })

  it('weigert een antwoord dat geen lijst is', async () => {
    const { ophaler } = stub({ melding: 'onverwacht' })
    await expect(new MidoceanConnector(ophaler).fetchCatalog(context))
      .rejects.toThrow(/Verwachtte een lijst producten/)
  })
})

describe('midocean: prijzen vertalen', () => {
  it('houdt de bedragen als tekst, met de staffel oplopend', async () => {
    const { ophaler } = stub(PRIJS_ANTWOORD)
    const [record] = await new MidoceanConnector(ophaler).fetchPrices(context)

    expect(record.value.sku).toBe('AR1249-16')
    expect(record.value.currency).toBe('EUR')
    // Als tekst met komma: omzetten gebeurt bewust pas in de domeinlogica.
    expect(record.value.unitPrice).toBe('4,22')
    expect(record.value.tiers.map((t) => t.minimumQuantity)).toEqual([1, 250, 500, 1000])
    expect(record.value.tiers[3].unitPrice).toBe('3,77')
    expect(record.value.validUntil?.toISOString().slice(0, 10)).toBe('2024-01-31')
  })
})

describe('midocean: voorraad vertalen', () => {
  it('leest het aantal en de twee verwachte leveringen', async () => {
    const { ophaler } = stub(VOORRAAD_ANTWOORD)
    const [record] = await new MidoceanConnector(ophaler).fetchStock(context)

    expect(record.value).toMatchObject({
      sku: 'KC2364-37',
      quantity: 811,
      firstArrivalQuantity: 3000,
      nextArrivalQuantity: 5000,
    })
    expect(record.value.firstArrivalDate?.toISOString().slice(0, 10)).toBe('2023-08-25')
  })

  it('maakt van een ontbrekende levering null en niet nul', async () => {
    const { ophaler } = stub({ stock: [{ sku: 'X-1', qty: 0 }] })
    const [record] = await new MidoceanConnector(ophaler).fetchStock(context)
    expect(record.value.quantity).toBe(0)
    expect(record.value.firstArrivalDate).toBeNull()
    expect(record.value.firstArrivalQuantity).toBeNull()
  })
})
