'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export interface KlantWaarden {
  name: string
  vatNumber: string
  email: string
  phone: string
  website: string
  notes: string
}

const LEEG: KlantWaarden = { name: '', vatNumber: '', email: '', phone: '', website: '', notes: '' }

function Veld({
  naam, label, waarde, fout, hint, type = 'text', onChange,
}: {
  naam: keyof KlantWaarden
  label: string
  waarde: string
  fout?: string
  hint?: string
  type?: string
  onChange: (waarde: string) => void
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={naam} className="text-sm font-medium text-ink-soft">
        {label}
      </label>
      <Input
        id={naam}
        name={naam}
        type={type}
        value={waarde}
        aria-invalid={fout ? true : undefined}
        aria-describedby={fout ? `${naam}-fout` : hint ? `${naam}-hint` : undefined}
        className={fout ? 'border-alarm' : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {fout ? (
        <p id={`${naam}-fout`} className="text-xs text-alarm">
          {fout}
        </p>
      ) : hint ? (
        <p id={`${naam}-hint`} className="text-xs text-ink-faint">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

export function KlantFormulier({
  klantId,
  begin = LEEG,
}: {
  klantId?: string
  begin?: KlantWaarden
}) {
  const router = useRouter()
  const [waarden, setWaarden] = useState<KlantWaarden>(begin)
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [algemeen, setAlgemeen] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  const nieuw = !klantId
  const zet = (veld: keyof KlantWaarden) => (waarde: string) =>
    setWaarden((v) => ({ ...v, [veld]: waarde }))

  async function verstuur(event: React.FormEvent) {
    event.preventDefault()
    setFouten({})
    setAlgemeen(null)
    setBezig(true)

    try {
      const res = await fetch(nieuw ? '/api/customers' : `/api/customers/${klantId}`, {
        method: nieuw ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(waarden),
      })

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string; details?: { veld?: string | null; melding?: string }[] }
        } | null

        const perVeld: Record<string, string> = {}
        for (const d of body?.error?.details ?? []) {
          if (d.veld && d.melding) perVeld[d.veld] = d.melding
        }
        setFouten(perVeld)
        // Alleen een algemene melding tonen als die niet al bij een veld staat.
        if (Object.keys(perVeld).length === 0) {
          setAlgemeen(body?.error?.message ?? 'Opslaan lukte niet.')
        }
        return
      }

      const klant = (await res.json()) as { id: string }
      router.push(`/klanten/${klant.id}`)
      router.refresh()
    } catch {
      setAlgemeen('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <form onSubmit={verstuur} className="max-w-xl">
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Veld naam="name" label="Bedrijfsnaam" waarde={waarden.name} fout={fouten.name} onChange={zet('name')} />
        </div>
        <Veld
          naam="vatNumber"
          label="Btw-nummer"
          waarde={waarden.vatNumber}
          fout={fouten.vatNumber}
          hint="Bijvoorbeeld NL123456789B01"
          onChange={zet('vatNumber')}
        />
        <Veld naam="phone" label="Telefoon" waarde={waarden.phone} fout={fouten.phone} onChange={zet('phone')} />
        <Veld naam="email" label="E-mailadres" type="email" waarde={waarden.email} fout={fouten.email} onChange={zet('email')} />
        <Veld naam="website" label="Website" waarde={waarden.website} fout={fouten.website} onChange={zet('website')} />

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="notes" className="text-sm font-medium text-ink-soft">
            Interne opmerkingen
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            value={waarden.notes}
            onChange={(e) => zet('notes')(e.target.value)}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-ink-faint">Nooit zichtbaar in het klantportaal.</p>
        </div>
      </div>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <div className="mt-4 flex items-center gap-3">
        <Button type="submit" disabled={bezig}>
          {bezig ? 'Bezig met opslaan…' : nieuw ? 'Klant aanmaken' : 'Wijzigingen opslaan'}
        </Button>
        <Link
          href={klantId ? `/klanten/${klantId}` : '/klanten'}
          className="text-sm text-ink-soft hover:text-ink"
        >
          Annuleren
        </Link>
        {nieuw && (
          <span className="text-xs text-ink-faint">Het klantnummer wordt automatisch toegekend.</span>
        )}
      </div>
    </form>
  )
}
