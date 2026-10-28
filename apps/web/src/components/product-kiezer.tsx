'use client'

import { useState } from 'react'
import type { ProductPickerItem } from '@rgh/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Een product kiezen uit de catalogus.
 *
 * Zoeken en niet bladeren: na een leveranciersimport staan er duizenden
 * artikelen in, en dan is een keuzelijst onbruikbaar. Er wordt gezocht op
 * artikelnummer, naam en merk.
 *
 * Levert één treffer precies op wat er getypt is, dan wordt die meteen
 * gekozen. Dat maakt "artikelnummer intypen en verder" een handeling in
 * plaats van drie.
 */
export function ProductKiezer({
  gekozen,
  fout,
  label = 'Product',
  onKies,
}: {
  gekozen: ProductPickerItem | null
  fout?: string
  label?: string
  onKies: (product: ProductPickerItem | null) => void
}) {
  const [term, setTerm] = useState('')
  const [treffers, setTreffers] = useState<ProductPickerItem[]>([])
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState<string | null>(null)

  async function zoek() {
    const zoekterm = term.trim()
    if (zoekterm.length === 0) return

    setBezig(true)
    setMelding(null)
    try {
      const res = await fetch(`/api/products/search?q=${encodeURIComponent(zoekterm)}`)
      if (!res.ok) {
        setMelding('Zoeken lukte niet.')
        return
      }
      const gevonden = (await res.json()) as ProductPickerItem[]

      // Precies dit artikelnummer: dan is er niets te kiezen.
      const exact = gevonden.find(
        (p) => p.articleNumber.toLowerCase() === zoekterm.toLowerCase(),
      )
      if (exact) {
        setTreffers([])
        setTerm('')
        onKies(exact)
        return
      }

      setTreffers(gevonden)
      if (gevonden.length === 0) setMelding(`Geen product gevonden voor "${zoekterm}".`)
    } catch {
      setMelding('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  if (gekozen) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-ink-soft">{label}</span>
        <div className="flex items-center gap-3">
          <p className="text-sm">
            {gekozen.name}
            <span className="block font-[family-name:var(--font-mono)] text-xs text-ink-faint">
              {gekozen.articleNumber}
              {!gekozen.isActive && <span className="text-alarm"> · inactief</span>}
            </span>
          </p>
          <button
            type="button"
            onClick={() => onKies(null)}
            className="text-xs font-medium text-accent hover:underline"
          >
            anders kiezen
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="productzoeken" className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      <div className="flex gap-2">
        <Input
          id="productzoeken"
          value={term}
          placeholder="Artikelnummer of naam"
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              // Anders verstuurt Enter het omliggende formulier.
              e.preventDefault()
              void zoek()
            }
          }}
        />
        <Button type="button" variant="secondary" size="sm" disabled={bezig} onClick={() => void zoek()}>
          {bezig ? 'Zoeken…' : 'Zoeken'}
        </Button>
      </div>
      {fout && <p className="text-xs text-alarm">{fout}</p>}
      {melding && <p className="text-xs text-ink-faint">{melding}</p>}
      {treffers.length > 0 && (
        <ul className="max-h-64 divide-y divide-rule overflow-y-auto rounded border border-rule">
          {treffers.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => {
                  setTreffers([])
                  setTerm('')
                  onKies(p)
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-sunk"
              >
                <span>
                  {p.name}
                  {!p.isActive && <span className="text-ink-faint"> (inactief)</span>}
                </span>
                <span className="font-[family-name:var(--font-mono)] text-xs text-ink-faint">
                  {p.articleNumber}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
