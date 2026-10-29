'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import type { ShippingMethod } from '@rgh/contracts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/** Bedragen staan met een komma in beeld en gaan met een punt de api in. */
const metKomma = (bedrag: string) => bedrag.replace('.', ',')
const metPunt = (bedrag: string) => bedrag.replace(',', '.')

/**
 * Verzendwijzen beheren: pakket, pallet, of wat er verder nodig is.
 *
 * Twee bedragen per regel, want het zijn twee verschillende dingen. Wat de
 * verzending ons kost drukt op de marge ook als er niets voor gerekend wordt;
 * wat de klant bijdraagt is omzet.
 */
export function VerzendwijzenFormulier({ wijzen }: { wijzen: ShippingMethod[] }) {
  const router = useRouter()
  const [rijen, setRijen] = useState<ShippingMethod[]>(
    wijzen.length > 0
      ? wijzen.map((w) => ({
          ...w,
          cost: metKomma(w.cost),
          contribution: metKomma(w.contribution),
        }))
      : [{ name: '', cost: '', contribution: '0,00' }],
  )
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [algemeen, setAlgemeen] = useState<string | null>(null)
  const [bewaard, setBewaard] = useState(false)
  const [bezig, setBezig] = useState(false)

  function wijzig(index: number, veld: keyof ShippingMethod, waarde: string) {
    setRijen((oud) => oud.map((r, i) => (i === index ? { ...r, [veld]: waarde } : r)))
    setBewaard(false)
  }

  async function opslaan() {
    setFouten({})
    setAlgemeen(null)
    setBezig(true)
    try {
      const res = await fetch('/api/settings/shipping-methods', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          rijen.map((r) => ({
            ...r,
            cost: metPunt(r.cost),
            contribution: metPunt(r.contribution),
          })),
        ),
      })
      if (!res.ok) {
        const fout = (await res.json().catch(() => null)) as {
          error?: { message?: string; details?: { veld?: string | null; melding?: string }[] }
        } | null
        const perVeld: Record<string, string> = {}
        for (const d of fout?.error?.details ?? []) {
          if (d.veld && d.melding) perVeld[d.veld] = d.melding
        }
        setFouten(perVeld)
        if (Object.keys(perVeld).length === 0) {
          setAlgemeen(fout?.error?.message ?? 'Opslaan lukte niet.')
        }
        return
      }
      setBewaard(true)
      router.refresh()
    } catch {
      setAlgemeen('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan()
      }}
    >
      <div className="overflow-hidden rounded border border-rule bg-surface">
        <div className="hidden gap-3 border-b border-rule px-4 py-2 text-xs font-medium uppercase tracking-wide text-ink-faint sm:grid sm:grid-cols-[1fr_8rem_8rem_2.5rem]">
          <span>Verzendwijze</span>
          <span className="text-right">Kost ons</span>
          <span className="text-right">Klant betaalt</span>
          <span />
        </div>

        {rijen.map((rij, i) => (
          <div
            key={i}
            className="grid gap-3 border-b border-rule px-4 py-3 last:border-0 sm:grid-cols-[1fr_8rem_8rem_2.5rem] sm:items-start"
          >
            <div className="flex flex-col gap-1">
              <Input
                aria-label={`Naam verzendwijze ${i + 1}`}
                value={rij.name}
                placeholder="Pakket"
                onChange={(e) => wijzig(i, 'name', e.target.value)}
              />
              {fouten[`${i}.name`] && (
                <p className="text-xs text-alarm">{fouten[`${i}.name`]}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Input
                aria-label={`Kostprijs verzendwijze ${i + 1}`}
                value={rij.cost}
                placeholder="9,50"
                className="text-right tabular"
                onChange={(e) => wijzig(i, 'cost', e.target.value)}
              />
              {fouten[`${i}.cost`] && (
                <p className="text-xs text-alarm">{fouten[`${i}.cost`]}</p>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Input
                aria-label={`Bijdrage verzendwijze ${i + 1}`}
                value={rij.contribution}
                placeholder="0,00"
                className="text-right tabular"
                onChange={(e) => wijzig(i, 'contribution', e.target.value)}
              />
              {fouten[`${i}.contribution`] && (
                <p className="text-xs text-alarm">{fouten[`${i}.contribution`]}</p>
              )}
            </div>
            <button
              type="button"
              aria-label={`Verzendwijze ${i + 1} verwijderen`}
              className="flex h-9 w-9 items-center justify-center rounded text-ink-faint transition-colors hover:bg-sunk hover:text-alarm"
              onClick={() => {
                setRijen((oud) => oud.filter((_, index) => index !== i))
                setBewaard(false)
              }}
            >
              <Trash2 size={15} aria-hidden />
            </button>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={bezig}>
          {bezig ? 'Bezig met opslaan…' : 'Verzendwijzen opslaan'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            setRijen((oud) => [...oud, { name: '', cost: '', contribution: '0,00' }])
            setBewaard(false)
          }}
        >
          Regel toevoegen
        </Button>
        {bewaard && <span className="text-sm text-ok">Opgeslagen.</span>}
      </div>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}
    </form>
  )
}
