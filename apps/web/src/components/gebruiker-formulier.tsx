'use client'

import { useState } from 'react'
import type { RoleSummary } from '@rgh/contracts'
import { FormVeld, FormVoet, useOpslaan } from './deelformulier'

export interface GebruikerWaarden {
  name: string
  email: string
  password: string
  roleKeys: string[]
}

export function GebruikerFormulier({
  rollen,
  gebruikerId,
  begin,
}: {
  rollen: RoleSummary[]
  gebruikerId?: string
  begin?: Partial<GebruikerWaarden>
}) {
  const terug = '/beheer/gebruikers'
  const { fouten, algemeen, bezig, opslaan } = useOpslaan(terug)
  const nieuw = !gebruikerId
  const [waarden, setWaarden] = useState<GebruikerWaarden>({
    name: begin?.name ?? '',
    email: begin?.email ?? '',
    password: '',
    roleKeys: begin?.roleKeys ?? [],
  })

  const zetRol = (key: string, aan: boolean) =>
    setWaarden((v) => ({
      ...v,
      roleKeys: aan ? [...v.roleKeys, key] : v.roleKeys.filter((k) => k !== key),
    }))

  return (
    <form
      className="max-w-2xl"
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan(
          nieuw ? '/api/users' : `/api/users/${gebruikerId}`,
          nieuw ? 'POST' : 'PATCH',
          nieuw ? waarden : { name: waarden.name, roleKeys: waarden.roleKeys },
        )
      }}
    >
      <div className="grid gap-4 rounded border border-rule bg-surface p-5 sm:grid-cols-2">
        <FormVeld
          naam="name"
          label="Naam"
          waarde={waarden.name}
          fout={fouten.name}
          onChange={(w) => setWaarden((v) => ({ ...v, name: w }))}
        />
        {nieuw ? (
          <FormVeld
            naam="email"
            label="E-mailadres"
            type="email"
            waarde={waarden.email}
            fout={fouten.email}
            onChange={(w) => setWaarden((v) => ({ ...v, email: w }))}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-ink-soft">E-mailadres</span>
            <p className="flex h-9 items-center text-sm text-ink-faint">{begin?.email}</p>
            <p className="text-xs text-ink-faint">
              Een e-mailadres wijzigen kan nog niet: daar hangt het inloggen aan.
            </p>
          </div>
        )}

        {nieuw && (
          <div className="sm:col-span-2">
            <FormVeld
              naam="password"
              label="Beginwachtwoord"
              type="text"
              waarde={waarden.password}
              fout={fouten.password}
              hint="Minstens 12 tekens. Geef het veilig door; er is nog geen e-mail om het te versturen."
              onChange={(w) => setWaarden((v) => ({ ...v, password: w }))}
            />
          </div>
        )}
      </div>

      <fieldset className="mt-4 rounded border border-rule bg-surface p-5">
        <legend className="px-1 text-sm font-semibold">Rollen</legend>
        <p className="mb-3 text-xs text-ink-faint">
          Rechten horen bij een rol, niet bij een persoon. Zonder rol kan iemand inloggen maar
          verder niets.
        </p>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {rollen.map((rol) => (
            <label key={rol.key} htmlFor={`rol-${rol.key}`} className="flex items-start gap-2.5 text-sm">
              <input
                id={`rol-${rol.key}`}
                type="checkbox"
                checked={waarden.roleKeys.includes(rol.key)}
                onChange={(e) => zetRol(rol.key, e.target.checked)}
                className="mt-0.5 size-4 accent-[var(--color-accent)]"
              />
              <span>
                {rol.name}
                <span className="block text-xs text-ink-faint">
                  {rol.permissions.length} {rol.permissions.length === 1 ? 'recht' : 'rechten'}
                </span>
              </span>
            </label>
          ))}
        </div>
        {fouten.roleKeys && <p className="mt-2 text-xs text-alarm">{fouten.roleKeys}</p>}
      </fieldset>

      {algemeen && (
        <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
          {algemeen}
        </p>
      )}

      <FormVoet
        terug={terug}
        bezig={bezig}
        opslaanLabel={nieuw ? 'Gebruiker aanmaken' : 'Wijzigingen opslaan'}
      />
    </form>
  )
}
