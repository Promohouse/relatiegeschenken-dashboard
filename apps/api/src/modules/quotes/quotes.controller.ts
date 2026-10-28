import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { calculateQuoteLineSchema, type CalculateQuoteLine } from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { CalculatorService } from './calculator.service'
import './quotes.schema'

@ApiTags('offertes')
@Controller('quotes')
export class QuotesController {
  constructor(private readonly calculator: CalculatorService) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('quotes:view')
  @ApiOperation({
    summary: 'Een offerteregel doorrekenen',
    description:
      'Rekent inkoopstaffel, prijsregel of klantafspraak, bedrukking, korting en btw door tot ' +
      'een regeltotaal met de werkelijke marge. Slaat niets op: een calculatie is een vraag, ' +
      'geen handeling.',
  })
  @ApiOkResponse({ schema: schemaRef('QuoteLineCalculation') })
  calculate(@Body(new ZodValidationPipe(calculateQuoteLineSchema)) body: CalculateQuoteLine) {
    return this.calculator.calculate(body)
  }
}
