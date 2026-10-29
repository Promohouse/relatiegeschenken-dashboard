'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Calculator as CalculatorIcon, X } from 'lucide-react'
import type { ShippingMethod } from '@rgh/contracts'
import { Calculator } from './calculator'
import { Button } from '@/components/ui/button'

/**
 * De calculator als venster op de offerte.
 *
 * Dezelfde calculator als op het calculatorscherm, niet een nagebouwde: zo
 * kan er geen verschil ontstaan tussen wat je doorrekent en wat er op de
 * offerte komt. De klant ligt vast op die van de offerte.
 *
 * Een echt `dialog`-element, zodat de browser de toetsenbordval, Escape en
 * de achtergrond zelf regelt. Een eigen gebouwd venster doet dat zelden goed.
 */
export function OfferteregelDialoog({
  quoteId,
  klant,
  staffelaantallen,
  verzendwijzen,
}: {
  quoteId: string
  klant: { id: string; name: string }
  staffelaantallen: number[]
  verzendwijzen: ShippingMethod[]
}) {
  const router = useRouter()
  const venster = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)

  // De calculator wordt pas opgebouwd als het venster opengaat, en weer
  // weggegooid bij sluiten. Zo begint de volgende regel schoon in plaats van
  // de vorige te erven.
  useEffect(() => {
    if (open) venster.current?.showModal()
    else venster.current?.close()
  }, [open])

  async function voegToe(invoer: Record<string, unknown>): Promise<string | null> {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(invoer),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
        return body?.error?.message ?? 'De regel kon niet toegevoegd worden.'
      }
      setOpen(false)
      router.refresh()
      return null
    } catch {
      return 'De server is niet bereikbaar.'
    }
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <CalculatorIcon size={15} aria-hidden className="mr-2" />
        Regel berekenen
      </Button>

      <dialog
        ref={venster}
        aria-label="Regel berekenen en toevoegen"
        onClose={() => setOpen(false)}
        className="w-[min(72rem,92vw)] max-w-none rounded border border-rule bg-ground p-0 text-ink backdrop:bg-black/50"
      >
        {open && (
          <div className="max-h-[88vh] overflow-y-auto">
            <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-rule bg-surface px-5 py-3">
              <div>
                <h2 className="text-sm font-semibold">Regel berekenen en toevoegen</h2>
                <p className="text-xs text-ink-faint">
                  Dezelfde berekening als op het calculatorscherm. Pas als je op toevoegen klikt
                  staat hij op de offerte.
                </p>
              </div>
              <button
                type="button"
                aria-label="Sluiten"
                onClick={() => setOpen(false)}
                className="rounded p-1 text-ink-faint transition-colors hover:bg-sunk hover:text-ink"
              >
                <X size={18} aria-hidden />
              </button>
            </div>

            <div className="p-5">
              <Calculator
                beginProduct={null}
                klanten={[]}
                staffelaantallen={staffelaantallen}
                verzendwijzen={verzendwijzen}
                vasteKlant={klant}
                onToevoegen={voegToe}
                toevoegLabel="Toevoegen aan offerte"
              />
            </div>
          </div>
        )}
      </dialog>
    </>
  )
}
