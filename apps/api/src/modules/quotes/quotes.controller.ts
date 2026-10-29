import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  addQuoteLineSchema, calculateQuoteLineSchema, calculateTiersSchema, createQuoteSchema,
  updateQuoteSchema,
  type AddQuoteLine, type CalculateQuoteLine, type CalculateTiers, type CreateQuote,
  type UpdateQuote,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { CalculatorService } from './calculator.service'
import { QuotesService } from './quotes.service'
import './quotes.schema'

@ApiTags('offertes')
@Controller('quotes')
export class QuotesController {
  constructor(
    private readonly calculator: CalculatorService,
    private readonly quotes: QuotesService,
  ) {}

  @Get()
  @RequirePermission('quotes:view')
  @ApiOperation({ summary: 'Offertes, nieuwste eerst' })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('QuoteSummary') } })
  list() {
    return this.quotes.list()
  }

  @Post()
  @RequirePermission('quotes:create')
  @ApiOperation({
    summary: 'Een offerte aanmaken',
    description:
      'Maakt een offerte met een lege eerste versie en geeft een nummer uit de reeks QUOTE uit. ' +
      'De geldigheidsduur komt uit de instellingen.',
  })
  @ApiCreatedResponse({ schema: schemaRef('Quote') })
  create(@Body(new ZodValidationPipe(createQuoteSchema)) body: CreateQuote) {
    return this.quotes.create(body)
  }

  @Get(':id')
  @RequirePermission('quotes:view')
  @ApiOperation({ summary: 'Eén offerte met zijn huidige versie en regels' })
  @ApiOkResponse({ schema: schemaRef('Quote') })
  byId(@Param('id') id: string) {
    return this.quotes.byId(id)
  }

  @Patch(':id')
  @RequirePermission('quotes:update')
  @ApiOperation({ summary: 'Offertegegevens wijzigen' })
  @ApiOkResponse({ schema: schemaRef('Quote') })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateQuoteSchema)) body: UpdateQuote,
  ) {
    return this.quotes.update(id, body)
  }

  @Post(':id/lines')
  @RequirePermission('quotes:update')
  @ApiOperation({
    summary: 'Een regel aan de offerte toevoegen',
    description:
      'Rekent de regel door met dezelfde calculator als het scherm en schrijft de uitkomst over ' +
      'naar eigen kolommen. Een latere prijswijziging op het product raakt deze offerte dus ' +
      'nooit (harde regel 3). De klant komt van de offerte en niet uit de invoer.',
  })
  @ApiCreatedResponse({ schema: schemaRef('Quote') })
  addLine(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(addQuoteLineSchema)) body: AddQuoteLine,
  ) {
    return this.quotes.addLine(id, body)
  }

  @Delete(':id/lines/:lineId')
  @RequirePermission('quotes:update')
  @ApiOperation({ summary: 'Een regel van de offerte halen' })
  @ApiOkResponse({ schema: schemaRef('Quote') })
  removeLine(@Param('id') id: string, @Param('lineId') lineId: string) {
    return this.quotes.removeLine(id, lineId)
  }

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

  @Post('calculate/tiers')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('quotes:view')
  @ApiOperation({
    summary: 'Een staffel doorrekenen',
    description:
      'Dezelfde calculatie voor meerdere aantallen. Klanten vragen daar in deze handel vrijwel ' +
      'altijd om: de stuksprijs verschuift met het aantal langs de inkoopstaffel, de drukstaffel ' +
      'én de instelkosten die over meer stuks verdeeld worden. Een aantal waarvoor geen prijs ' +
      'te bepalen is krijgt de reden erbij en houdt de rest niet tegen.',
  })
  @ApiOkResponse({ schema: schemaRef('QuoteTiers') })
  calculateTiers(@Body(new ZodValidationPipe(calculateTiersSchema)) body: CalculateTiers) {
    return this.calculator.calculateTiers(body)
  }
}
