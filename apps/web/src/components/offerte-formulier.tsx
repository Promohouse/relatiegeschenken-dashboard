'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

/**
 * Een offerte aanmaken. Alleen de kop: klant, referentie en de teksten die de
 * klant op het document ziet. De regels komen daarna, uit de calculator.
 */
export function OfferteFormulier({
  klanten,
  vasteKlantId,
}: {
  klanten: { id: string; name: string }[]
  /** Komt de gebruiker van een klantpagina, dan ligt de klant al vast. */
  vasteKlantId?: string
}) {
  const router = useRouter()
  const [customerId, setCustomerId] = useState(vasteKlantId ?? '')
  const [reference, setReference] = useState('')
  const [requestedDeliveryDate, setLeverdatum] = useState('')
  const [vatRegime, setRegime] = useState('DOMESTIC')
  const [customerNotes, setKlanttekst] = useState('')
  const [notes, setNotes] = useState('')
  const [fout, setFout] = useState<string | null>(null)
  const [bezig, setBezig] = useState(false)

  async function opslaan() {
    if (!customerId) {
      setFout('Kies eerst een klant.')
      return
    }
    setFout(null)
    setBezig(true)
    try {
      const res = await fetch('/api/quotes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerId, reference, requestedDeliveryDate, vatRegime, customerNotes, notes,
        }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        setFout(body?.error?.message ?? 'De offerte kon niet aangemaakt worden.')
        return
      }
      const offerte = (await res.json()) as { id: string }
      router.push(`/offertes/${offerte.id}`)
      router.refresh()
    } catch {
      setFout('De server is niet bereikbaar.')
    } finally {
      setBezig(false)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan()
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="customerId" className="text-sm font-medium text-ink-soft">
            Klant
          </label>
          <select
            id="customerId"
            value={customerId}
            disabled={!!vasteKlantId}
            onChange={(e) => setCustomerId(e.target.value)}
            className="h-9 rounded border border-rule bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none disabled:text-ink-faint"
          >
            <option value="">Kies een klant</option>
            {klanten.map((k) => (
              <option key={k.id} value={k.id}>{k.name}</option>
            ))}
          </select>
          <p className="text-xs text-ink-faint">
            De klant ligt na aanmaken vast. Zijn prijsafspraken en marge tellen mee bij elke regel.
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="reference" className="text-sm font-medium text-ink-soft">
            Referentie
          </label>
          <Input
            id="reference"
            value={reference}
            placeholder="bv. Kerstpakket 2026"
            onChange={(e) => setReference(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="requestedDeliveryDate" className="text-sm font-medium text-ink-soft">
            Gewenste leverdatum
          </label>
          <Input
            id="requestedDeliveryDate"
            type="date"
            value={requestedDeliveryDate}
            onChange={(e) => setLeverdatum(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="vatRegime" className="text-sm font-medium text-ink-soft">
            Btw
          </label>
          <select
            id="vatRegime"
            value={vatRegime}
            onChange={(e) => setRegime(e.target.value)}
            className="h-9 rounded border border-rule bg-surface px-2.5 text-sm text-ink focus:border-accent focus:outline-none"
          >
            <option value="DOMESTIC">Binnenland</option>
            <option value="EU_REVERSE_CHARGE">Btw verlegd binnen de EU</option>
            <option value="EXPORT">Export buiten de EU</option>
          </select>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="customerNotes" className="text-sm font-medium text-ink-soft">
            Tekst voor de klant
          </label>
          <textarea
            id="customerNotes"
            rows={3}
            value={customerNotes}
            onChange={(e) => setKlanttekst(e.target.value)}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-ink-faint">Komt op de offerte te staan.</p>
        </div>

        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <label htmlFor="notes" className="text-sm font-medium text-ink-soft">
            Interne opmerkingen
          </label>
          <textarea
            id="notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full rounded border border-rule bg-surface px-3 py-2 text-sm text-ink focus:border-accent focus:outline-none"
          />
          <p className="text-xs text-ink-faint">Nooit zichtbaar voor de klant.</p>
        </div>
      </div>

      {fout && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {fout}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={bezig}>
          {bezig ? 'Bezig met aanmaken…' : 'Offerte aanmaken'}
        </Button>
        <Link href="/offertes" className="text-sm text-ink-soft hover:text-ink">
          Annuleren
        </Link>
      </div>
    </form>
  )
}
