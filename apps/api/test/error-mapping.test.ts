import { describe, it, expect } from 'vitest'
import { z } from 'zod'
import { mapError } from '../src/core/errors/error-mapping'
import {
  ConflictError, ForbiddenError, IntegrationError, NotFoundError,
  PreconditionError, UnauthorizedError, ValidationFailedError,
} from '../src/core/errors/domain-errors'

describe('domeinfouten', () => {
  it('vertaalt elke domeinfout naar zijn eigen status en code', () => {
    const gevallen = [
      [new NotFoundError('Klant bestaat niet.'), 404, 'NIET_GEVONDEN'],
      [new ConflictError('Nummer is al uitgegeven.'), 409, 'CONFLICT'],
      [new PreconditionError('Drukproef nog niet goedgekeurd.'), 422, 'VOORWAARDE_NIET_VERVULD'],
      [new ValidationFailedError('Aantal moet groter dan nul zijn.'), 400, 'ONGELDIGE_INVOER'],
      [new UnauthorizedError('Niet ingelogd.'), 401, 'NIET_INGELOGD'],
      [new ForbiddenError('Geen recht om goed te keuren.'), 403, 'GEEN_RECHTEN'],
      [new IntegrationError('SnelStart gaf 503.'), 502, 'EXTERNE_FOUT'],
    ] as const

    for (const [fout, status, code] of gevallen) {
      const m = mapError(fout)
      expect(m.status).toBe(status)
      expect(m.code).toBe(code)
      expect(m.message).toBe(fout.message)
    }
  })

  it('geeft details mee als die er zijn', () => {
    const m = mapError(new ConflictError('Botsing.', { veld: 'number' }))
    expect(m.details).toEqual({ veld: 'number' })
  })
})

describe('validatiefouten', () => {
  it('maakt van een ZodError een lijst per veld', () => {
    const schema = z.object({ quantity: z.number().int().positive(), name: z.string().min(1) })
    const resultaat = schema.safeParse({ quantity: -1, name: '' })
    const m = mapError(resultaat.error)
    expect(m.status).toBe(400)
    expect(m.code).toBe('ONGELDIGE_INVOER')
    expect(m.details).toHaveLength(2)
    expect(JSON.stringify(m.details)).toContain('quantity')
  })
})

describe('databasefouten', () => {
  it('maakt van een unieke-sleutelfout een 409 met de velden erbij', () => {
    const m = mapError({ code: 'P2002', meta: { target: ['number'] }, message: 'Unique constraint failed' })
    expect(m.status).toBe(409)
    expect(m.code).toBe('AL_IN_GEBRUIK')
    expect(m.message).toContain('number')
  })

  it('maakt van een ontbrekend record een 404', () => {
    expect(mapError({ code: 'P2025', message: 'not found' }).status).toBe(404)
  })

  it('maakt van een geschonden verwijzing een 409 die uitlegt dat het nog in gebruik is', () => {
    const m = mapError({ code: 'P2003', message: 'fk' })
    expect(m.status).toBe(409)
    expect(m.message).toContain('nog aan andere gegevens gekoppeld')
  })
})

describe('onze eigen databasetriggers', () => {
  it('laat de melding over een vastgezette offerteversie doorkomen als 409', () => {
    // Zo komt de melding uit PostgreSQL via Prisma terug.
    const ruw = new Error(
      '\nInvalid `db.quoteVersion.update()` invocation:\n\n' +
        'Offerteversie 1234 is vastgezet op 2026-10-28 en kan niet worden gewijzigd (ADR-0007).',
    )
    const m = mapError(ruw)
    expect(m.status).toBe(409)
    expect(m.code).toBe('ONVERANDERLIJK')
    expect(m.message).toContain('vastgezet')
    expect(m.message).not.toContain('Invalid `db.quoteVersion.update()`')
  })

  it('laat de melding over append-only beslissingen doorkomen', () => {
    const m = mapError(new Error('Een offertebeslissing is append-only en kan niet worden gewijzigd (ADR-0007).'))
    expect(m.status).toBe(409)
    expect(m.message).toContain('append-only')
  })
})

describe('onbekende fouten', () => {
  it('geeft 500 zonder de interne oorzaak naar buiten te brengen', () => {
    const m = mapError(new Error('connect ECONNREFUSED 10.0.0.5:5432 wachtwoord=geheim'))
    expect(m.status).toBe(500)
    expect(m.code).toBe('INTERNE_FOUT')
    expect(m.message).toBe('Er is een onverwachte fout opgetreden.')
    // De oorzaak gaat wel het log in, maar niet het antwoord.
    expect(m.internal).toContain('ECONNREFUSED')
  })

  it('maakt van een geschonden check-constraint een 422 in plaats van een 500', () => {
    const m = mapError(
      new Error(
        'new row for relation "customer_price_agreements" violates check constraint ' +
          '"customer_price_agreements_geldigheid"',
      ),
    )
    expect(m.status).toBe(422)
    expect(m.code).toBe('REGEL_GESCHONDEN')
    // De naam van de constraint zegt een gebruiker niets en blijft intern.
    expect(m.message).not.toContain('customer_price_agreements_geldigheid')
    expect(m.internal).toContain('customer_price_agreements_geldigheid')
  })

  it('kan ook met iets dat geen Error is omgaan', () => {
    expect(mapError('kapot').status).toBe(500)
    expect(mapError(undefined).status).toBe(500)
  })
})
