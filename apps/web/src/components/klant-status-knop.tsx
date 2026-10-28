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

  async function schakel() {
    if (isActief && !confirm('Deze klant op inactief zetten? De gegevens en historie blijven bewaard.')) {
      return
    }
    setBezig(true)
    await fetch(`/api/customers/${klantId}/${isActief ? 'deactivate' : 'activate'}`, { method: 'POST' })
    setBezig(false)
    router.refresh()
  }

  return (
    <Button variant={isActief ? 'danger' : 'secondary'} size="sm" disabled={bezig} onClick={schakel}>
      {bezig ? 'Bezig…' : isActief ? 'Op inactief zetten' : 'Weer activeren'}
    </Button>
  )
}
