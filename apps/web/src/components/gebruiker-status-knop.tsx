'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'

export function GebruikerStatusKnop({
  gebruikerId, isActief, isIkzelf,
}: {
  gebruikerId: string
  isActief: boolean
  isIkzelf: boolean
}) {
  const router = useRouter()
  const [bezig, setBezig] = useState(false)
  const [fout, setFout] = useState<string | null>(null)

  if (isIkzelf && isActief) {
    return <p className="text-xs text-ink-faint">Je kunt jezelf niet op inactief zetten.</p>
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant={isActief ? 'danger' : 'secondary'}
        size="sm"
        disabled={bezig}
        onClick={async () => {
          setBezig(true)
          setFout(null)
          const res = await fetch(
            `/api/users/${gebruikerId}/${isActief ? 'deactivate' : 'activate'}`,
            { method: 'POST' },
          )
          setBezig(false)
          if (!res.ok) {
            const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
            setFout(body?.error?.message ?? `Dat lukte niet (${res.status}).`)
            return
          }
          router.refresh()
        }}
      >
        {bezig ? 'Bezig…' : isActief ? 'Op inactief zetten' : 'Weer activeren'}
      </Button>
      {fout && (
        <p role="status" className="max-w-xs text-right text-xs text-alarm">
          {fout}
        </p>
      )}
    </div>
  )
}
