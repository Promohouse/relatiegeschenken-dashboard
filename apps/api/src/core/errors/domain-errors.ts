/**
 * Domeinfouten. Services gooien deze; de laag erboven weet niets van HTTP.
 * De exception filter vertaalt ze naar een statuscode en een vaste vorm.
 */

export abstract class DomainError extends Error {
  abstract readonly code: string
  abstract readonly status: number
  readonly details?: unknown

  constructor(message: string, details?: unknown) {
    super(message)
    this.name = new.target.name
    this.details = details
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NIET_GEVONDEN'
  readonly status = 404
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT'
  readonly status = 409
}

/** Een handeling die wel bestaat maar nu niet mag, bijvoorbeeld een
 *  statusovergang waarvan de voorwaarden niet kloppen. */
export class PreconditionError extends DomainError {
  readonly code = 'VOORWAARDE_NIET_VERVULD'
  readonly status = 422
}

export class ValidationFailedError extends DomainError {
  readonly code = 'ONGELDIGE_INVOER'
  readonly status = 400
}

export class UnauthorizedError extends DomainError {
  readonly code = 'NIET_INGELOGD'
  readonly status = 401
}

export class ForbiddenError extends DomainError {
  readonly code = 'GEEN_RECHTEN'
  readonly status = 403
}

/** Een extern systeem gaf een fout of was onbereikbaar. */
export class IntegrationError extends DomainError {
  readonly code = 'EXTERNE_FOUT'
  readonly status = 502
}
