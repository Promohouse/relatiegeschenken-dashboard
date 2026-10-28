import { Injectable, NestMiddleware } from '@nestjs/common'
import type { NextFunction, Request, Response } from 'express'
import { randomUUID } from 'node:crypto'
import { RequestContext } from './request-context'

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = (req.headers['x-request-id'] as string) || randomUUID()

    // Teruggeven zodat een melding van een gebruiker terug te vinden is in de logs.
    res.setHeader('x-request-id', requestId)

    RequestContext.run(
      {
        requestId,
        // Worden door de authenticatiestap gevuld zodra die er is (taak 4).
        userId: null,
        customerId: null,
        ipAddress: req.ip ?? null,
        userAgent: (req.headers['user-agent'] as string) ?? null,
      },
      () => next(),
    )
  }
}
