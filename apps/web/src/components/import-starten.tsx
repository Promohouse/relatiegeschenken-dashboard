'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { ConnectionSummary } from '@rgh/contracts'
import { Button } from '@/components/ui/button'
import { Aanvinkveld } from './deelformulier'

/**
 * Een import starten. Standaard een proefimport: wie de catalogus wil raken
 * moet dat aanvinken, en ziet daarbij staan wat het verschil is.
 */
export function ImportStarten({ koppelingen }: { koppelingen: ConnectionSummary[] }) {
  const router = useRouter()
  const bruikbaar = koppelingen.filter(
    (k) => k.isActive && k.hasCredentials && k.capabilities.some((c) => c.isEnabled && c.hasConnector),
  )

  const [koppeling, setKoppeling] = useState(bruikbaar[0]?.key ?? '')
  const [capability, setCapability] = useState('CATALOG')
  const [proef, setProef] = useState(true)
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  const gekozen = bruikbaar.find((k) => k.key === koppeling)
  const mogelijk = gekozen?.capabilities.filter((c) => c.isEnabled && c.hasConnector) ?? []

  if (bruikbaar.length === 0) {
    return (
      <p className="rounded border border-rule bg-surface p-4 text-sm text-ink-soft">
        Er is nog geen koppeling die gedraaid kan worden. Een koppeling heeft drie dingen nodig:
        hij moet aanstaan, er moeten credentials zijn opgeslagen, en er moet code zijn die hem kan
        uitvoeren.
      </p>
    )
  }

  async function start() {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch('/api/imports/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionKey: koppeling, capability, dryRun: proef }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(body?.error?.message ?? 'De import kon niet gestart worden.')
        return
      }
      const uitslag = (await res.json()) as { importRunId: string }
      router.push(`/imports/${uitslag.importRunId}`)
      router.refresh()
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <div className="rounded border border-rule bg-surface p-5">
      <h2 className="text-sm font-semibold">Import starten</h2>

      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="koppeling" className="text-sm font-medium text-ink-soft">
            Koppeling
          </label>
          <select
            id="koppeling"
            value={koppeling}
            onChange={(e) => setKoppeling(e.target.value)}
            className="h-9 rounded border border-rule bg-surface px-2 text-sm focus:border-accent focus:outline-none"
          >
            {bruikbaar.map((k) => (
              <option key={k.key} value={k.key}>
                {k.supplierName} — {k.key} ({k.environment})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="capability" className="text-sm font-medium text-ink-soft">
            Wat ophalen
          </label>
          <select
            id="capability"
            value={capability}
            onChange={(e) => setCapability(e.target.value)}
            className="h-9 rounded border border-rule bg-surface px-2 text-sm focus:border-accent focus:outline-none"
          >
            {mogelijk.map((c) => (
              <option key={c.capability} value={c.capability}>
                {c.capability}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <Aanvinkveld
          naam="proef"
          label="Proefimport"
          hint={
            proef
              ? 'Haalt op en vergelijkt, maar legt niets vast. Veilig om zo vaak te draaien als je wilt.'
              : 'Legt de leveranciersdata vast. De catalogus wijzigt pas als je de voorstellen toepast.'
          }
          aangevinkt={proef}
          onChange={setProef}
        />
      </div>

      {fout && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {fout}
        </p>
      )}

      <div className="mt-4">
        <Button type="button" disabled={bezig} onClick={() => void start()}>
          {bezig ? 'Bezig met ophalen…' : proef ? 'Proefimport draaien' : 'Import draaien'}
        </Button>
      </div>
    </div>
  )
}
