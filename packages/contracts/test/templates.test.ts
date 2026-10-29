import { describe, expect, it } from 'vitest'
import {
  renderTemplate, findPlaceholders, unknownPlaceholders, exampleValues, TEMPLATE_VARIABLES,
} from '../src/templates'

describe('velden in een sjabloon vinden', () => {
  it('vindt ze met en zonder spaties binnen de accolades', () => {
    expect(findPlaceholders('Beste {{contact.naam}}, hier {{ offerte.nummer }}.')).toEqual([
      'contact.naam', 'offerte.nummer',
    ])
  })

  it('negeert wat geen veld is', () => {
    expect(findPlaceholders('100% { geen veld } en {{}} ook niet')).toEqual([])
  })

  it('meldt een veld dat niet bij dit soort sjabloon hoort', () => {
    // Productvelden horen bij een regel, niet bij de inleiding van een offerte.
    expect(unknownPlaceholders('Hallo {{product.naam}}', 'QUOTE_INTRO')).toEqual(['product.naam'])
    expect(unknownPlaceholders('Hallo {{product.naam}}', 'QUOTE_LINE')).toEqual([])
  })

  it('meldt een typefout in een veldnaam', () => {
    // Dit is waarom de controle bij het opslaan hoort: een klant hoort geen
    // offerte te krijgen met {{klnat.naam}} erin.
    expect(unknownPlaceholders('Beste {{klnat.naam}}', 'QUOTE_INTRO')).toEqual(['klnat.naam'])
  })
})

describe('een sjabloon invullen', () => {
  it('vult de waarden in', () => {
    const uit = renderTemplate('Beste {{contact.naam}}, offerte {{offerte.nummer}}.', {
      'contact.naam': 'Erik',
      'offerte.nummer': 'OFF-2026-00042',
    })
    expect(uit).toBe('Beste Erik, offerte OFF-2026-00042.')
  })

  it('maakt een veld zonder waarde leeg in plaats van zichtbaar', () => {
    expect(renderTemplate('Referentie: {{offerte.referentie}}', { 'offerte.referentie': null }))
      .toBe('Referentie:')
  })

  it('laat geen dubbele spaties achter waar een veld leeg bleef', () => {
    const uit = renderTemplate('Beste {{contact.naam}} {{contact.achternaam}}, dank.', {
      'contact.naam': 'Erik',
      'contact.achternaam': '',
    })
    expect(uit).toBe('Beste Erik, dank.')
  })

  it('haalt een regel weg die door een leeg veld helemaal leeg werd', () => {
    const sjabloon = 'Offerte {{offerte.nummer}}\n{{offerte.referentie}}\nMet vriendelijke groet'
    expect(renderTemplate(sjabloon, { 'offerte.nummer': 'OFF-1', 'offerte.referentie': '' }))
      .toBe('Offerte OFF-1\nMet vriendelijke groet')
  })

  it('laat een bewust lege regel tussen alinea\'s staan', () => {
    const sjabloon = 'Eerste alinea.\n\nTweede alinea.'
    expect(renderTemplate(sjabloon, {})).toBe('Eerste alinea.\n\nTweede alinea.')
  })

  it('raakt tekst zonder velden niet aan', () => {
    expect(renderTemplate('Gewone tekst, 100% ongewijzigd.', {})).toBe('Gewone tekst, 100% ongewijzigd.')
  })
})

describe('de lijst met beschikbare velden', () => {
  it('geeft elk soort sjabloon zijn eigen velden', () => {
    const regelvelden = TEMPLATE_VARIABLES.QUOTE_LINE.map((v) => v.naam)
    expect(regelvelden).toContain('product.naam')
    expect(TEMPLATE_VARIABLES.QUOTE_INTRO.map((v) => v.naam)).not.toContain('product.naam')
  })

  it('heeft van elk veld een uitleg en een voorbeeld, voor het beheerscherm', () => {
    for (const velden of Object.values(TEMPLATE_VARIABLES)) {
      for (const veld of velden) {
        expect(veld.uitleg.length, `${veld.naam} mist uitleg`).toBeGreaterThan(3)
        expect(veld.voorbeeld.length, `${veld.naam} mist een voorbeeld`).toBeGreaterThan(0)
      }
    }
  })

  it('kent geen dubbele veldnamen binnen een soort', () => {
    for (const [kind, velden] of Object.entries(TEMPLATE_VARIABLES)) {
      const namen = velden.map((v) => v.naam)
      expect(new Set(namen).size, `${kind} heeft een dubbel veld`).toBe(namen.length)
    }
  })

  it('kan elk sjabloon met voorbeeldwaarden tonen', () => {
    const uit = renderTemplate(
      'Beste {{contact.naam}}, bijgaand offerte {{offerte.nummer}} van {{bedrijf.naam}}.',
      exampleValues('QUOTE_INTRO'),
    )
    expect(uit).not.toContain('{{')
    expect(uit).toContain('Promohouse BV')
  })
})
