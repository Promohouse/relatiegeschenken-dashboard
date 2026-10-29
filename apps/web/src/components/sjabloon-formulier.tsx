'use client'

import { useState } from 'react'
import { renderTemplate, exampleValues, type TemplateView } from '@rgh/contracts'
import { FormVeld, FormVoet, useOpslaan } from './deelformulier'
import { Input } from '@/components/ui/input'

/**
 * Een tekstsjabloon bewerken, met de beschikbare velden ernaast en een
 * proefweergave eronder.
 *
 * De proefweergave rekent in het scherm mee met dezelfde functie die de
 * server gebruikt, zodat je ziet wat een klant krijgt terwijl je typt - en
 * niet pas nadat je hebt opgeslagen.
 */
export function SjabloonFormulier({ sjabloon }: { sjabloon: TemplateView }) {
  const { fouten, algemeen, bezig, opslaan } = useOpslaan('/beheer/sjablonen')
  const [name, setName] = useState(sjabloon.name)
  const [description, setDescription] = useState(sjabloon.description ?? '')
  const [subject, setSubject] = useState(sjabloon.subject ?? '')
  const [body, setBody] = useState(sjabloon.body)

  const voorbeeld = exampleValues(sjabloon.kind)
  const toegestaan = new Set(sjabloon.variables.map((v) => v.naam))
  const gebruikt = new Set(
    [...`${subject}\n${body}`.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)].map((m) => m[1]),
  )
  const onbekend = [...gebruikt].filter((naam) => !toegestaan.has(naam))

  /** Een veld op de plek van de cursor invoegen scheelt overtypen. */
  const voegToe = (naam: string) => setBody((huidig) => `${huidig}{{${naam}}}`)

  return (
    <form
      className="grid gap-5 lg:grid-cols-[1fr_18rem]"
      onSubmit={(e) => {
        e.preventDefault()
        void opslaan(`/api/templates/${sjabloon.key}`, 'PATCH', {
          name,
          description,
          ...(sjabloon.kind === 'QUOTE_EMAIL' ? { subject } : {}),
          body,
        })
      }}
    >
      <div>
        <div className="grid gap-4 rounded border border-rule bg-surface p-5">
          <FormVeld naam="name" label="Naam" waarde={name} fout={fouten.name} onChange={setName} />
          <FormVeld
            naam="description"
            label="Waar dit sjabloon voor is"
            waarde={description}
            fout={fouten.description}
            onChange={setDescription}
          />

          {sjabloon.kind === 'QUOTE_EMAIL' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="subject" className="text-sm font-medium text-ink-soft">
                Onderwerp
              </label>
              <Input
                id="subject"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className={fouten.subject ? 'border-alarm' : undefined}
              />
              {fouten.subject && <p className="text-xs text-alarm">{fouten.subject}</p>}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="body" className="text-sm font-medium text-ink-soft">
              Tekst
            </label>
            <textarea
              id="body"
              rows={14}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className={`w-full rounded border bg-surface px-3 py-2 font-[family-name:var(--font-mono)] text-sm text-ink focus:border-accent focus:outline-none ${
                fouten.body ? 'border-alarm' : 'border-rule'
              }`}
            />
            {fouten.body ? (
              <p className="text-xs text-alarm">{fouten.body}</p>
            ) : (
              <p className="text-xs text-ink-faint">
                Een veld schrijf je als {'{{'}veld{'}}'}. Een veld zonder waarde blijft leeg en
                laat geen lege regel achter.
              </p>
            )}
          </div>
        </div>

        {onbekend.length > 0 && (
          <p className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
            Onbekend veld: {onbekend.map((n) => `{{${n}}}`).join(', ')}. Opslaan wordt geweigerd;
            kies een veld uit de lijst hiernaast.
          </p>
        )}

        {algemeen && (
          <p role="status" className="mt-3 rounded border border-alarm/30 bg-alarm-bg px-3 py-2 text-sm text-alarm">
            {algemeen}
          </p>
        )}

        <div className="mt-4 rounded border border-rule bg-surface p-5">
          <h2 className="text-sm font-semibold">Zo ziet het eruit</h2>
          <p className="mt-1 text-xs text-ink-faint">Met voorbeeldwaarden ingevuld.</p>
          {sjabloon.kind === 'QUOTE_EMAIL' && (
            <p className="mt-3 text-sm font-medium">{renderTemplate(subject, voorbeeld)}</p>
          )}
          <p className="mt-2 whitespace-pre-line text-sm text-ink-soft">
            {renderTemplate(body, voorbeeld)}
          </p>
        </div>

        <FormVoet terug="/beheer/sjablonen" bezig={bezig} opslaanLabel="Wijzigingen opslaan" />
      </div>

      <aside className="rounded border border-rule bg-surface p-4">
        <h2 className="text-sm font-semibold">Velden die je kunt gebruiken</h2>
        <p className="mt-1 text-xs text-ink-faint">
          Klik om achteraan de tekst toe te voegen.
        </p>
        <ul className="mt-3 grid gap-2">
          {sjabloon.variables.map((veld) => (
            <li key={veld.naam}>
              <button
                type="button"
                onClick={() => voegToe(veld.naam)}
                className="w-full text-left"
              >
                <span
                  className={`block font-[family-name:var(--font-mono)] text-xs ${
                    gebruikt.has(veld.naam) ? 'text-accent' : 'text-ink'
                  }`}
                >
                  {'{{'}
                  {veld.naam}
                  {'}}'}
                </span>
                <span className="block text-xs text-ink-faint">{veld.uitleg}</span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </form>
  )
}
