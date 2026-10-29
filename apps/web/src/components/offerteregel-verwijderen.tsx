'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Trash2 } from 'lucide-react'

/**
 * Een regel van een conceptofferte halen.
 *
 * Geen bevestiging: zolang de offerte een concept is, is dit omkeerbaar door
 * de regel opnieuw toe te voegen. Zodra een versie vastgezet is weigert de
 * database elke wijziging, en dan verschijnt deze knop niet eens.
 */
export function OfferteregelVerwijderen({
  quoteId,
  lineId,
}: {
  quoteId: string
  lineId: string
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function verwijder() {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(`/api/quotes/${quoteId}/lines/${lineId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(body?.error?.message ?? 'Verwijderen lukte niet.')
        return
      }
      router.refresh()
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label="Regel verwijderen"
        disabled={bezig}
        className="text-ink-faint transition-colors hover:text-alarm disabled:opacity-50"
        onClick={() => void verwijder()}
      >
        <Trash2 size={15} aria-hidden />
      </button>
      {fout && <span className="block text-xs text-alarm">{fout}</span>}
    </>
  )
}
