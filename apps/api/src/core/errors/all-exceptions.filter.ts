import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { mapError } from './error-mapping'

/**
 * Eén vorm voor elke fout:
 *   { error: { code, message, details?, requestId } }
 *
 * De requestId staat ook in het log, zodat een melding van een gebruiker
 * terug te vinden is zonder dat de interne oorzaak naar buiten gaat.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Fout')

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const requestId = (request.headers['x-request-id'] as string) || randomUUID()

    if (exception instanceof HttpException) {
      const status = exception.getStatus()
      const body = exception.getResponse()
      const message =
        typeof body === 'string'
          ? body
          : ((body as { message?: string | string[] }).message ?? exception.message)
      response.status(status).json({
        error: {
          code: status === 404 ? 'NIET_GEVONDEN' : 'HTTP_FOUT',
          message: Array.isArray(message) ? message.join('; ') : message,
          requestId,
        },
      })
      return
    }

    const mapped = mapError(exception)

    if (mapped.status >= 500) {
      this.logger.error(
        `${request.method} ${request.url} [${requestId}] ${mapped.internal ?? mapped.message}`,
        exception instanceof Error ? exception.stack : undefined,
      )
    } else {
      this.logger.warn(`${request.method} ${request.url} [${requestId}] ${mapped.code}: ${mapped.message}`)
    }

    response.status(mapped.status).json({
      error: {
        code: mapped.code,
        message: mapped.message,
        ...(mapped.details ? { details: mapped.details } : {}),
        requestId,
      },
    })
  }
}
