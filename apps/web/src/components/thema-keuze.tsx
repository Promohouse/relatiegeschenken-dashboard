'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Monitor, Moon, Sun } from 'lucide-react'
import type { ThemePreference } from '@rgh/contracts'

const KEUZES: { waarde: ThemePreference; label: string; icon: typeof Sun }[] = [
  { waarde: 'LIGHT', label: 'Licht', icon: Sun },
  { waarde: 'DARK', label: 'Donker', icon: Moon },
  { waarde: 'SYSTEM', label: 'Systeem', icon: Monitor },
]

/**
 * Lichte of donkere weergave kiezen.
 *
 * De keuze staat bij de gebruiker en niet in de browser, zodat hij meegaat
 * naar een ander apparaat. Na het opslaan wordt de pagina ververst: de
 * serverkant zet `data-theme` op het html-element, en dat voorkomt dat het
 * scherm bij het laden eerst even in de verkeerde kleur staat.
 */
export function ThemaKeuze({ huidig }: { huidig: ThemePreference }) {
  const router = useRouter()
  const [keuze, setKeuze] = useState<ThemePreference>(huidig)
  const [bezig, setBezig] = useState(false)

  async function kies(waarde: ThemePreference) {
    if (waarde === keuze) return
    const vorige = keuze
    setKeuze(waarde)
    setBezig(true)
    try {
      const res = await fetch('/api/me/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: waarde }),
      })
      if (!res.ok) {
        setKeuze(vorige)
        return
      }
      router.refresh()
    } catch {
      setKeuze(vorige)
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="flex gap-0.5 rounded border border-rule p-0.5" role="group" aria-label="Weergave">
      {KEUZES.map(({ waarde, label, icon: Icon }) => (
        <button
          key={waarde}
          type="button"
          disabled={bezig}
          onClick={() => void kies(waarde)}
          aria-pressed={keuze === waarde}
          title={label}
          className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1 text-xs transition-colors ${
            keuze === waarde
              ? 'bg-accent-soft font-medium text-accent'
              : 'text-ink-faint hover:bg-sunk hover:text-ink'
          }`}
        >
          <Icon size={13} aria-hidden />
          {label}
        </button>
      ))}
    </div>
  )
}
