'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Klanten worden niet verwijderd maar op inactief gezet: orderhistorie en
 * facturen moeten bewaard blijven. Dat staat ook in de bevestiging, zodat
 * niemand denkt dat hier iets weggegooid wordt.
 */
export function KlantStatusKnop({ klantId, isActief }: { klantId: string; isActief: boolean }) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function schakel() {
    if (isActief && !confirm('Deze klant op inactief zetten? De gegevens en historie blijven bewaard.')) {
      return
    }
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(`/api/customers/${klantId}/${isActief ? 'deactivate' : 'activate'}`, {
        method: 'POST',
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(body?.error?.message ?? `Dat lukte niet (${res.status}).`)
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
    <div className="flex flex-col items-end gap-1">
      <Button variant={isActief ? 'danger' : 'secondary'} size="sm" disabled={bezig} onClick={schakel}>
        {bezig ? 'Bezig…' : isActief ? 'Op inactief zetten' : 'Weer activeren'}
      </Button>
      {fout && (
        <p role="status" className="text-xs text-alarm">
          {fout}
        </p>
      )}
    </div>
  )
}
