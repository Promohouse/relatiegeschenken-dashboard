import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * De donkere weergave staat in twee blokken: één voor wie donker koos, één
 * voor wie de keuze aan zijn besturingssysteem laat. Die moeten dezelfde
 * kleuren bevatten, anders ziet de helft van de gebruikers iets anders dan de
 * andere helft - en dat merk je pas als iemand het meldt.
 */
const css = readFileSync(resolve(__dirname, '../src/app/globals.css'), 'utf8')

const blok = (selector: string) => {
  const start = css.indexOf(selector)
  if (start === -1) throw new Error(`Blok "${selector}" niet gevonden in globals.css`)
  const open = css.indexOf('{', start)
  let diepte = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') diepte++
    if (css[i] === '}') {
      diepte--
      if (diepte === 0) return css.slice(open + 1, i)
    }
  }
  throw new Error(`Blok "${selector}" is niet afgesloten`)
}

const kleuren = (inhoud: string) =>
  Object.fromEntries(
    [...inhoud.matchAll(/(--color-[a-z-]+)\s*:\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]),
  )

describe('lichte en donkere weergave', () => {
  const licht = kleuren(blok('@theme'))
  const gekozen = kleuren(blok(":root[data-theme='dark']"))
  const systeem = kleuren(blok(":root:not([data-theme='light'])"))

  it('kent voor elke kleur uit de lichte weergave een donkere', () => {
    for (const naam of Object.keys(licht)) {
      expect(gekozen, `${naam} ontbreekt in de donkere weergave`).toHaveProperty(naam)
    }
  })

  it('geeft dezelfde kleuren of je donker kiest of je systeem donker staat', () => {
    expect(systeem).toEqual(gekozen)
  })

  it('gebruikt in de donkere weergave geen kleur uit de lichte', () => {
    // Een vergeten regel levert meestal een letterlijke kopie op; die valt zo op.
    for (const [naam, waarde] of Object.entries(gekozen)) {
      expect(waarde, `${naam} is in beide weergaven gelijk`).not.toBe(licht[naam])
    }
  })
})
