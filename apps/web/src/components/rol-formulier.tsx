'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { PermissionGroup, RoleDetail } from '@rgh/contracts'
import { FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { Button } from '@/components/ui/button'

/** Namen die een mens herkent; de sleutels blijven Engels. */
const MODULE_NAMEN: Record<string, string> = {
  dashboard: 'Dashboard',
  customers: 'Klanten',
  quotes: 'Offertes',
  orders: 'Orders',
  proofs: 'Drukproeven',
  products: 'Producten',
  suppliers: 'Leveranciers',
  purchasing: 'Inkoop',
  documents: 'Documenten',
  tasks: 'Taken',
  imports: 'Imports',
  channels: 'Kanalen',
  users: 'Gebruikers',
  settings: 'Instellingen',
}

const ACTIE_NAMEN: Record<string, string> = {
  view: 'bekijken',
  create: 'aanmaken',
  update: 'wijzigen',
  delete: 'verwijderen',
  approve: 'goedkeuren',
  export: 'exporteren',
}

export function RolFormulier({
  groepen,
  rol,
}: {
  groepen: PermissionGroup[]
  rol?: RoleDetail
}) {
  const router = useRouter()
  const terug = '/beheer/rollen'
  const { fouten, algemeen, setAlgemeen, bezig, opslaan } = useOpslaan(terug)
  const nieuw = !rol

  const [key, setKey] = useState(rol?.key ?? '')
  const [name, setName] = useState(rol?.name ?? '')
  const [description, setDescription] = useState(rol?.description ?? '')
  const [rechten, setRechten] = useState<Set<string>>(new Set(rol?.permissions ?? []))
  const [verwijderen, setVerwijderen] = useState(false)

  const zet = (sleutel: string, aan: boolean) =>
    setRechten((huidig) => {
      const nieuweSet = new Set(huidig)
      if (aan) nieuweSet.add(sleutel)
      else nieuweSet.delete(sleutel)
      return nieuweSet
    })

  const zetModule = (groep: PermissionGroup, aan: boolean) =>
    setRechten((huidig) => {
      const nieuweSet = new Set(huidig)
      for (const p of groep.permissions) {
        if (aan) nieuweSet.add(p.key)
        else nieuweSet.delete(p.key)
      }
      return nieuweSet
    })

  async function verwijder() {
    if (!confirm(`De rol "${rol?.name}" verwijderen?`)) return
    setVerwijderen(true)
    const res = await fetch(`/api/roles/${rol?.id}`, { method: 'DELETE' })
    setVerwijderen(false)
    if (res.ok) {
      router.push(terug)
      router.refresh()
      return
    }
    const fout = (await res.json().catch(() => null)) as { error?: { message?: string } } | null
    setAlgemeen(fout?.error?.message ?? 'Verwijderen lukte niet.')
  }

  return (
    <form
      className="max-w-4xl"
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan(
          nieuw ? '/api/roles' : `/api/roles/${rol.id}`,
          nieuw ? 'POST' : 'PATCH',
          nieuw
            ? { key, name, description, permissionKeys: [...rechten] }
            : { name, description, permissionKeys: [...rechten] },
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <FormVeld naam="name" label="Naam" waarde={name} fout={fouten.name} onChange={setName} />
        {nieuw ? (
          <FormVeld
            naam="key"
            label="Sleutel"
            waarde={key}
            fout={fouten.key}
            hint="Kleine letters, cijfers en koppeltekens. Staat in de code en wijzigt later niet."
            onChange={setKey}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">Sleutel</span>
            <p className="flex h-9 items-center font-[family-name:var(--font-mono)] text-sm text-ink-faint">
              {rol.key}
            </p>
          </div>
        )}
        <div className="sm:col-span-2">
          <FormVeld
            naam="description"
            label="Omschrijving"
            waarde={description}
            fout={fouten.description}
            hint="Waar is deze rol voor bedoeld?"
            onChange={setDescription}
          />
        </div>
      </div>

      <fieldset className="mt-4 rounded border border-rule bg-surface">
        <legend className="ml-5 px-1 text-sm font-semibold">Rechten</legend>
        <p className="px-5 pb-3 text-xs text-ink-faint">
          {rechten.size} van {groepen.reduce((n, g) => n + g.permissions.length, 0)} rechten
          aangevinkt. Een recht heet <span className="font-[family-name:var(--font-mono)]">module:actie</span>.
        </p>

        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full text-sm">
            <tbody>
              {groepen.map((groep) => {
                const alles = groep.permissions.every((p) => rechten.has(p.key))
                return (
                  <tr key={groep.module} className="border-b border-rule last:border-0">
                    <th scope="row" className="w-44 px-5 py-2.5 text-left align-top">
                      <span className="font-medium">{MODULE_NAMEN[groep.module] ?? groep.module}</span>
                      <button
                        type="button"
                        onClick={() => zetModule(groep, !alles)}
                        className="block text-xs font-normal text-accent hover:underline"
                      >
                        {alles ? 'alles uit' : 'alles aan'}
                      </button>
                    </th>
                    <td className="px-5 py-2.5">
                      <div className="flex flex-wrap gap-x-5 gap-y-1.5">
                        {groep.permissions.map((p) => (
                          <label key={p.key} htmlFor={p.key} className="flex items-center gap-1.5 text-sm">
                            <input
                              id={p.key}
                              type="checkbox"
                              checked={rechten.has(p.key)}
                              onChange={(e) => zet(p.key, e.target.checked)}
                              className="size-4 accent-[var(--color-accent)]"
                            />
                            {ACTIE_NAMEN[p.action] ?? p.action}
                          </label>
                        ))}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </fieldset>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <FormVoet
        terug={terug}
        bezig={bezig}
        opslaanLabel={nieuw ? 'Rol aanmaken' : 'Wijzigingen opslaan'}
        extra={
          rol && !rol.isSystem ? (
            <Button type="button" variant="danger" size="sm" disabled={verwijderen} onClick={verwijder}>
              {verwijderen ? 'Bezig…' : 'Verwijderen'}
            </Button>
          ) : rol ? (
            <span className="text-xs text-ink-faint">
              Systeemrol: wel aan te passen, niet te verwijderen.
            </span>
          ) : undefined
        }
      />
    </form>
  )
}
