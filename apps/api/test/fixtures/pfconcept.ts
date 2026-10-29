/**
 * Voorbeeldbestanden van PF Concept, overgenomen uit hun *Data feeds manual*
 * v3.6.7 (mei 2026), hoofdstuk "Structure samples".
 *
 * Dit zijn hun eigen voorbeelden en geen verzonnen gegevens. Waar het
 * voorbeeld in de handleiding XML is, staat hier de JSON-tegenhanger zoals
 * hun JSON-voorbeelden die opbouwen - wij lezen JSON (ADR-0019).
 *
 * **Niet geverifieerd tegen een echt bestand.** Zodra de feeds geactiveerd
 * zijn horen deze fixtures vervangen te worden door een echt fragment. Bij
 * midocean week de werkelijke respons op drie punten af van hun handleiding.
 */

/** Product feed, blz. 18-23. Eén model met één item. */
export const PRODUCT_FEED = {
  productfeed: [
    {
      creationDateTime: '2022-05-31 03:44:18',
      language: 'NL',
      department: 'CNL1',
      version: 'v3',
      models: [
        {
          model: [
            {
              modelCode: '100002',
              description: 'Oregon 400 ml water bottle with carabiner',
              extDesc:
                'Staying hydrated at all times is possible with this durable yet lightweight ' +
                '400 ml aluminium drinking bottle.',
              keywords: 'metal Bottles, metal Bottle, metal Flask',
              items: [
                {
                  item: [
                    {
                      itemCode: '10000200',
                      size: '',
                      sizeGrid: '',
                      gender: '',
                      measurements: [
                        {
                          weightGr: '70',
                          heightCm: '17,5',
                          diameterCm: '6,5',
                          SizeCombined: '17,5 x Ø 6,5 cm',
                        },
                      ],
                      qtyPerCarton: 60,
                      decorationSettings: [
                        {
                          decoDefault: [
                            {
                              method: 'Screenround',
                              leadTime: '5',
                              impLocationDefault: 'wrap (1 color)',
                              impWidthDefaultMm: 170,
                              impHeightDefaultMm: 90,
                              maxColoursDefault: 1,
                              decorationMandatory: 'NO',
                            },
                          ],
                        },
                      ],
                      countryOfOrigin: 'CN',
                      hsCode: '7612901000',
                      brand: 'Bullet',
                      categoryData: [
                        {
                          groupCode: '04',
                          groupDesc: 'Drinkware',
                          catCode: '0410',
                          catDesc: 'Bottles',
                        },
                      ],
                      colors: [
                        {
                          color: [
                            {
                              colorCode: '21',
                              colorDesc: 'Silver',
                              baseColor: 'Grey',
                              hexColor: '#C7C7C7',
                              pmsColorReference: 'Cool Gray 1 C',
                            },
                          ],
                        },
                      ],
                      material: 'Aluminium',
                      simpleMaterial: 'Metal',
                      eanCode: '5055835400023',
                      launchDate: '2019-01-01',
                      imageData: [
                        {
                          imageMain: '10000200_main.jpg',
                          imageFront: '10000200_front.jpg',
                          imageDetail1: '10000200_detail1.jpg',
                        },
                      ],
                      markSegment: 'STOCK',
                      isDiscontinued: false,
                    },
                    {
                      itemCode: '10000201',
                      measurements: [{ SizeCombined: '17,5 x Ø 6,5 cm' }],
                      colors: [{ color: [{ colorCode: '10', colorDesc: 'Solid black' }] }],
                      eanCode: '5055835400030',
                      imageData: [{ imageMain: '10000201_main.jpg' }],
                      isDiscontinued: 'true',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/** Price feed, blz. 25-28. Vier schalen plus een promotie. */
export const PRICE_FEED = {
  priceInfo: [
    {
      creationDateTime: '2020-04-17T15:35:20.853',
      language: 'NL',
      department: 'CNL1',
      version: 'v3',
      models: [
        {
          model: [
            {
              modelcode: '100010',
              description: 'Blackburn zonnebril',
              items: [
                {
                  numberOfItems: 1,
                  item: [
                    {
                      itemcode: '10001000',
                      currency: 'EUR',
                      clearance: 'C',
                      decoCharge: 'DOM001,DST01,GPE05,PAD05,LAS04',
                      minDecoQty: '10',
                      scales: [
                        {
                          numberOfScales: 4,
                          scale: [
                            { priceBar: 1, nettPrice: 10.49, type: 'G', industryCol: 26.69 },
                            { priceBar: 25, nettPrice: 10.49, type: 'G', industryCol: 25.36 },
                            { priceBar: 50, nettPrice: 10.2, type: 'G', industryCol: 24.6 },
                            { priceBar: 100, nettPrice: 9.95, type: 'G', industryCol: 24.11 },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/** Stock feed, naar de veldbeschrijving op blz. 16. */
export const STOCK_FEED = {
  stockFeed: [
    {
      models: [
        {
          model: [
            {
              modelCode: '100002',
              description: 'Oregon 400 ml water bottle with carabiner',
              items: [
                {
                  item: [
                    {
                      itemCode: '10000200',
                      stockDirect: 1240,
                      stockNextPo: 5000,
                      stockDateNextPo: '2026-12-15',
                      StockFuture: 12000,
                      stockLocation: 'NL',
                    },
                    {
                      itemCode: '10000201',
                      stockDirect: 0,
                      stockNextPo: 0,
                      stockDateNextPo: '',
                      StockFuture: 0,
                      stockLocation: 'NL',
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}

/** Print data feed, blz. 31-32. Verwijzingen per artikel, rijen apart. */
export const PRINT_DATA_FEED = {
  printfeed: [
    {
      creationDateTime: '2020-04-14T13:44:02.036',
      language: 'NL',
      department: 'CNL1',
      version: 'v3',
      models: [
        {
          model: [
            {
              modelCode: '100002',
              description: 'Oregon 400 ml sport bottle with carabiner',
              items: [
                {
                  item: [
                    {
                      itemCode: '10000200',
                      printfeedrefs: [
                        {
                          printfeedref: [
                            {
                              ref: '1',
                              imagePrintLine: '10000200_3_1175_441.jpg',
                              svgFile: '100002/svg/10000200_3_1175_441.svg',
                            },
                            {
                              ref: '2',
                              imagePrintLine: '10000200_6_4799_34.jpg',
                              svgFile: '100002/svg/10000200_6_4799_34.svg',
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
      printFeedRows: [
        {
          printFeedRow: [
            {
              ref: '1',
              impMethodCode: '3',
              impMethod: 'Screenround',
              printCode: 'GPE02',
              impLocationCode: 'wrap (1 color)',
              impLocation: 'wrap (1 color)',
              maxColours: 1,
              impWidthMm: 170,
              impHeightMm: 90,
              impDiameterMm: 0,
              maxAreaCm2: 153,
              maxLogoSizeCm2: 0,
              productionLocation: 'PL',
              default: 'true',
            },
            {
              ref: '2',
              impMethodCode: '6',
              impMethod: 'Digital transfer',
              printCode: 'DST01',
              impLocationCode: 'wrap (1 color)',
              impLocation: 'wrap (1 color)',
              maxColours: 'Full colour',
              impWidthMm: 170,
              impHeightMm: 90,
              maxAreaCm2: 153,
              productionLocation: 'PL',
              default: 'false',
            },
            {
              ref: '9',
              impMethodCode: '9',
              impMethod: 'Laser',
              printCode: 'LAS04',
              impLocationCode: 'front',
              impLocation: 'voorzijde',
              maxColours: 1,
              impWidthMm: 40,
              impHeightMm: 25,
              default: 'false',
            },
          ],
        },
      ],
    },
  ],
}

/** Print price feed, blz. 28-30. Hun eigen voorbeeld, drukcode DEB02. */
export const PRINT_PRICE_FEED = {
  decoCharges: [
    {
      createdDateTime: '22/04/2020 16:11:56,071',
      currency: 'EUR',
      language: 'NL',
      department: 'CNL1',
      version: 'V3',
      decoCharge: [
        {
          printCode: 'DEB02',
          impMethod: 'Blinddruk',
          LTMCharge: 15.0,
          priceDependence: 'None',
          logoSizes: [
            {
              logoSize: [
                {
                  logoSizeCm2: 0,
                  itemCodeId: 'DCDEB021',
                  amountColors: [
                    {
                      amountColor: [
                        {
                          amountColorsId: '1',
                          amountSetupCharges: [
                            {
                              amountSetupCharge: [
                                {
                                  AmountSetupChargeId: '1',
                                  SetupCharge: 45.0,
                                  decoPrices: [
                                    {
                                      decoPrice: [
                                        { decoPriceFromQty: '1', price: 1.71 },
                                        { decoPriceFromQty: '10', price: 1.71 },
                                        { decoPriceFromQty: '25', price: 1.53 },
                                        { decoPriceFromQty: '50', price: 1.05 },
                                        { decoPriceFromQty: '100', price: 0.7 },
                                        { decoPriceFromQty: '250', price: 0.53 },
                                        { decoPriceFromQty: '500', price: 0.41 },
                                        { decoPriceFromQty: '1000', price: 0.41 },
                                        { decoPriceFromQty: '2500', price: 0.35 },
                                        { decoPriceFromQty: '5000', price: 0.35 },
                                      ],
                                    },
                                  ],
                                },
                              ],
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
