/**
 * Voorbeeldantwoorden van midocean, overgenomen uit hun handleiding v1.12.2.
 *
 * Dit zijn hun eigen voorbeelden (product AR1804, prijs AR1249-16, voorraad
 * KC2364-37), niet door mij verzonnen testdata. Zodra er een testsleutel is,
 * horen deze vervangen te worden door een echt antwoord - dan pas weten we
 * zeker dat de vorm klopt.
 */

export const PRODUCT_ANTWOORD = [
  {
    master_code: 'AR1804',
    master_id: '40000190',
    type_of_products: 'stock',
    commodity_code: '4820 1030',
    number_of_print_positions: '5',
    country_of_origin: 'CN',
    brand: 'midocean',
    product_name: 'ARCONOT',
    category_code: 'MOBOFF_NOTOTH',
    product_class: 'Notebooks & notepads',
    dimensions: '21X14X1,6 CM',
    short_description: 'A5 notebook 96 plain sheets',
    long_description:
      'A5 notebook with hard PU cover. Casebound. 192 plain pages (96 sheets). ' +
      'Matching elastic closure strap and ribbon page-marker.',
    material: 'PU',
    green: 'yes',
    printable: 'yes',
    polybag: 'no',
    digital_assets: [
      {
        url: 'https://cdn1.midocean.com/document/declaration-of-sustainability/ar1804-green.pdf',
        type: 'document',
        subtype: 'declaration_of_sustainability',
      },
      {
        url: 'https://cdn1.midocean.com/document/declaration-of-conformity/ar1804-doc.pdf',
        type: 'document',
        subtype: 'declaration_of_conformity',
      },
    ],
    variants: [
      {
        variant_id: '10168709',
        sku: 'AR1804-03',
        release_date: '2015-01-01',
        product_proposition_category: '295',
        category_level1: 'Office & Writing',
        category_level2: 'Notebooks',
        category_level3: 'Hard cover',
        color_description: 'black',
        color_group: 'black',
        plc_status: '16',
        plc_status_description: 'COLLECTION',
        gtin: '8719941012868',
        color_code: '03',
        pms_color: 'BLACK',
        digital_assets: [
          {
            url: 'https://cdn1.midocean.com/image/700X700/ar1804-03.jpg',
            url_highress: 'https://cdn1.midocean.com/image/original/ar1804-03.jpg',
            type: 'image',
            subtype: 'item_picture_front',
          },
          {
            url: 'https://cdn1.midocean.com/image/700X700/ar1804-03-back.jpg',
            url_highress: 'https://cdn1.midocean.com/image/original/ar1804-03-back.jpg',
            type: 'image',
            subtype: 'item_picture_back',
          },
        ],
      },
      {
        variant_id: '10168710',
        sku: 'AR1804-06',
        color_description: 'blue',
        color_group: 'blue',
        plc_status_description: 'COLLECTION',
        gtin: '8719941012875',
        color_code: '06',
        pms_color: 'BLUE',
        digital_assets: [],
      },
    ],
  },
]

export const PRIJS_ANTWOORD = {
  currency: 'EUR',
  date: '2023-10-31',
  price: [
    {
      sku: 'AR1249-16',
      variant_id: '10134325',
      price: '4,22',
      valid_until: '2024-01-31',
      scale: [
        { minimum_quantity: '1000', price: '3,77' },
        { minimum_quantity: '500', price: '3,92' },
        { minimum_quantity: '250', price: '4,07' },
        { minimum_quantity: '1', price: '4,22' },
      ],
    },
  ],
}

export const VOORRAAD_ANTWOORD = {
  modified_at: '2023-08-11T23:45:09+02:00',
  stock: [
    {
      sku: 'KC2364-37',
      qty: 811,
      first_arrival_date: '2023-08-25',
      first_arrival_qty: 3000,
      next_arrival_date: '2023-09-22',
      next_arrival_qty: 5000,
    },
  ],
}
