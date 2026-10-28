'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export type Fouten = Record<string, string>

export function FormVeld({
  naam, label, waarde, fout, hint, type = 'text', onChange,
}: {
  naam: string
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
        <p id={`${naam}-fout`} className="text-xs text-alarm">{fout}</p>
      ) : hint ? (
        <p id={`${naam}-hint`} className="text-xs text-ink-faint">{hint}</p>
      ) : null}
    </div>
  )
}

export function Aanvinkveld({
  naam, label, hint, aangevinkt, onChange,
}: {
  naam: string
  label: string
  hint?: string
  aangevinkt: boolean
  onChange: (aan: boolean) => void
}) {
  return (
    <label htmlFor={naam} className="flex items-start gap-2.5 text-sm">
      <input
        id={naam}
        name={naam}
        type="checkbox"
        checked={aangevinkt}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 size-4 accent-[var(--color-accent)]"
      />
      <span>
        {label}
        {hint && <span className="block text-xs text-ink-faint">{hint}</span>}
      </span>
    </label>
  )
}

/**
 * Gedeelde verzendlogica voor de kleine formulieren onder een klant.
 * Foutmeldingen van de api komen per veld terug en worden daar getoond.
 */
export function useOpslaan(terug: string) {
  const router = useRouter()
  const [fouten, setFouten] = useState<Fouten>({})
  const [algemeen, setAlgemeen] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function opslaan(url: string, methode: 'POST' | 'PATCH', body: unknown) {
    setFouten({})
    setAlgemeen(null)
    setBezig(true)
    try {
      const res = await fetch(url, {
        method: methode,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const fout = (await res.json().catch(() => null)) as {
          error?: { message?: string; details?: { veld?: string | null; melding?: string }[] }
        } | null
        const perVeld: Fouten = {}
        for (const d of fout?.error?.details ?? []) {
          if (d.veld && d.melding) perVeld[d.veld] = d.melding
        }
        setFouten(perVeld)
        if (Object.keys(perVeld).length === 0) {
          setAlgemeen(fout?.error?.message ?? 'Opslaan lukte niet.')
        }
        return false
      }
      router.push(terug)
      router.refresh()
      return true
    } catch {
      setAlgemeen('De server is niet bereikbaar.')
      return false
    } finally {
      setBezig(false)
    }
  }

  return { fouten, algemeen, setAlgemeen, bezig, opslaan }
}

export function FormVoet({
  terug, bezig, opslaanLabel, extra,
}: {
  terug: string
  bezig: boolean
  opslaanLabel: string
  extra?: ReactNode
}) {
  return (
    <div className="mt-4 flex flex-wrap items-center gap-3">
      <Button type="submit" disabled={bezig}>
        {bezig ? 'Bezig met opslaan…' : opslaanLabel}
      </Button>
      <Link href={terug} className="text-sm text-ink-soft hover:text-ink">
        Annuleren
      </Link>
      {extra}
    </div>
  )
}
