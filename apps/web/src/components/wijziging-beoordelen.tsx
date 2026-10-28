'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { StagedChangeView } from '@rgh/contracts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/** Nederlandse namen voor de velden die uit een import kunnen komen. */
const VELDNAMEN: Record<string, string> = {
  name: 'Naam',
  description: 'Omschrijving',
  brand: 'Merk',
  material: 'Materiaal',
  dimensions: 'Afmetingen',
  countryOfOrigin: 'Land van herkomst',
  commodityCode: 'Goederencode',
  printable: 'Bedrukbaar',
  isActive: 'Actief',
  articleNumber: 'Artikelnummer',
  varianten: 'Varianten',
  reden: 'Reden',
}

const toon = (waarde: unknown): string => {
  if (waarde === null || waarde === undefined || waarde === '') return '—'
  if (typeof waarde === 'boolean') return waarde ? 'ja' : 'nee'
  if (Array.isArray(waarde)) return waarde.length === 0 ? '—' : waarde.join(', ')
  return String(waarde)
}

function Verschil({ veld, waarde }: { veld: string; waarde: unknown }) {
  const paar = waarde as { van?: unknown; naar?: unknown }
  const label = VELDNAMEN[veld] ?? veld

  if (veld === 'reden') {
    return <p className="text-xs text-ink-soft">{toon(paar.naar)}</p>
  }

  if (veld === 'varianten') {
    const erbij = (paar.naar as string[] | null) ?? []
    const eraf = (paar.van as string[] | null) ?? []
    return (
      <div className="text-sm">
        <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
        <div className="mt-0.5 flex flex-wrap gap-x-4">
          {erbij.length > 0 && <span className="text-ok">erbij: {erbij.join(', ')}</span>}
          {eraf.length > 0 && (
            <span className="text-alarm">
              niet meer in de bron: {eraf.join(', ')}
            </span>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="text-sm">
      <span className="text-xs uppercase tracking-wide text-ink-faint">{label}</span>
      <div className="mt-0.5 flex flex-wrap items-center gap-2">
        <span className="text-ink-soft line-through decoration-ink-faint/50">{toon(paar.van)}</span>
        <span className="text-ink-faint" aria-hidden>
          →
        </span>
        <span className="font-medium">{toon(paar.naar)}</span>
      </div>
    </div>
  )
}

export function WijzigingBeoordelen({
  wijzigingen,
  importRunId,
  toepasbaar,
  magBeoordelen,
}: {
  wijzigingen: StagedChangeView[]
  importRunId: string
  /** Een proefimport legt geen brondata vast en is dus niet toe te passen. */
  toepasbaar: boolean
  magBeoordelen: boolean
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState<string | null>(null)
  const [fouten, setFouten] = useState<Record<string, string>>({})
  const [algemeen, setAlgemeen] = useState<string | null>(null)

  const open = wijzigingen.filter((w) => w.status === 'PENDING')

  async function doe(url: string, sleutel: string) {
    setBezig(sleutel)
    setAlgemeen(null)
    setFouten((f) => ({ ...f, [sleutel]: '' }))
    try {
      const res = await fetch(url, { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        const melding = body?.error?.message ?? 'Dit lukte niet.'
        if (sleutel === 'alles') setAlgemeen(melding)
        else setFouten((f) => ({ ...f, [sleutel]: melding }))
        return
      }
      router.refresh()
    } catch {
      setAlgemeen('De server is niet bereikbaar.')
    } finally {
      setBezig(null)
    }
  }

  if (wijzigingen.length === 0) {
    return (
      <p className="rounded border border-rule bg-surface p-4 text-sm text-ink-soft">
        Deze import vond geen verschillen met de catalogus.
      </p>
    )
  }

  return (
    <div>
      {magBeoordelen && toepasbaar && open.length > 1 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={bezig !== null}
            onClick={() => {
              if (confirm(`Alle ${open.length} openstaande voorstellen toepassen?`)) {
                void doe(`/api/imports/runs/${importRunId}/apply`, 'alles')
              }
            }}
          >
            {bezig === 'alles' ? 'Bezig…' : `Alle ${open.length} toepassen`}
          </Button>
          <span className="text-xs text-ink-faint">
            Een voorstel dat niet meer klopt houdt de rest niet tegen; dat blijft staan met de reden.
          </span>
        </div>
      )}

      {!toepasbaar && (
        <p className="mb-4 rounded border border-rule bg-ground px-3 py-2 text-sm text-ink-soft">
          Dit was een proefimport: de brongegevens zijn niet vastgelegd, dus er valt niets toe te
          passen. Draai een echte import om deze voorstellen uit te kunnen voeren.
        </p>
      )}

      {algemeen && (
        <p role="status" className="mb-4 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <ul className="grid gap-3">
        {wijzigingen.map((w) => (
          <li key={w.id} className="rounded border border-rule bg-surface p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-[family-name:var(--font-mono)] text-sm font-medium">
                  {w.externalId ?? w.entityId}
                  <Badge tone={w.changeType === 'CREATE' ? 'ok' : 'wait'} className="ml-2">
                    {w.changeType === 'CREATE' ? 'nieuw' : 'wijziging'}
                  </Badge>
                  {w.status === 'APPLIED' && (
                    <Badge tone="ok" className="ml-2">
                      toegepast
                    </Badge>
                  )}
                  {w.status === 'REJECTED' && (
                    <Badge tone="rest" className="ml-2">
                      afgewezen
                    </Badge>
                  )}
                </p>
              </div>

              {magBeoordelen && w.status === 'PENDING' && (
                <div className="flex gap-2">
                  {toepasbaar && (
                    <Button
                      type="button"
                      size="sm"
                      disabled={bezig !== null}
                      onClick={() => void doe(`/api/imports/changes/${w.id}/apply`, w.id)}
                    >
                      {bezig === w.id ? 'Bezig…' : 'Toepassen'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={bezig !== null}
                    onClick={() => void doe(`/api/imports/changes/${w.id}/reject`, w.id)}
                  >
                    Afwijzen
                  </Button>
                </div>
              )}
            </div>

            <div className="mt-3 grid gap-2">
              {Object.entries(w.diff).map(([veld, waarde]) => (
                <Verschil key={veld} veld={veld} waarde={waarde} />
              ))}
            </div>

            {fouten[w.id] && (
              <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
                {fouten[w.id]}
              </p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
