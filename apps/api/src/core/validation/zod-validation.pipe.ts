import { Injectable, PipeTransform } from '@nestjs/common'
import type { ZodType } from 'zod'

/**
 * Validatie met het Zod-schema uit `packages/contracts`, zodat front- en
 * backend precies hetzelfde controleren. Een ZodError wordt door de exception
 * filter omgezet naar een 400 met de fouten per veld.
 *
 * Gebruik: `@Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomer`
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value)
  }
}
