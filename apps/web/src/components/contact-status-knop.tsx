'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * Contactpersonen worden niet verwijderd: ze hangen aan orders en aan
 * gegeven goedkeuringen, en die historie blijft staan.
 */
export function ContactStatusKnop({
  klantId, contactId, isActief,
}: {
  klantId: string
  contactId: string
  isActief: boolean
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  async function schakel() {
    setBezig(true)
    setFout(null)
    try {
      const res = await fetch(
        `/api/customers/${klantId}/contacts/${contactId}/${isActief ? 'deactivate' : 'activate'}`,
        { method: 'POST' },
      )
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
      <Button type="button" variant={isActief ? 'danger' : 'secondary'} size="sm" disabled={bezig} onClick={schakel}>
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
