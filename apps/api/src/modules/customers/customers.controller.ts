import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createCustomerSchema, listCustomersQuerySchema, updateCustomerSchema,
  type CreateCustomer, type ListCustomersQuery, type UpdateCustomer,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { CustomersService } from './customers.service'
import './customers.schema'

@ApiTags('klanten')
@Controller('customers')
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  @RequirePermission('customers:view')
  @ApiOperation({
    summary: 'Klanten zoeken',
    description:
      'Zoekt op naam, klantnummer, e-mailadres, btw-nummer en achternaam van een contactpersoon.',
  })
  @ApiOkResponse({ schema: schemaRef('CustomerPage') })
  list(@Query(new ZodValidationPipe(listCustomersQuerySchema)) query: ListCustomersQuery) {
    return this.customers.list(query)
  }

  @Get(':id')
  @RequirePermission('customers:view')
  @ApiOperation({ summary: 'Eén klant met contactpersonen en adressen' })
  @ApiOkResponse({ schema: schemaRef('CustomerDetail') })
  byId(@Param('id') id: string) {
    return this.customers.byId(id)
  }

  @Post()
  @RequirePermission('customers:create')
  @ApiOperation({
    summary: 'Klant aanmaken',
    description: 'Het klantnummer wordt uitgegeven door het systeem en is niet mee te geven.',
  })
  @ApiCreatedResponse({ schema: schemaRef('CustomerDetail') })
  create(@Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomer) {
    return this.customers.create(body)
  }

  @Patch(':id')
  @RequirePermission('customers:update')
  @ApiOperation({ summary: 'Klantgegevens wijzigen' })
  @ApiOkResponse({ schema: schemaRef('CustomerDetail') })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomer,
  ) {
    return this.customers.update(id, body)
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Klant op inactief zetten',
    description:
      'Klanten worden niet verwijderd: orderhistorie en facturen moeten bewaard blijven.',
  })
  @ApiOkResponse({ schema: schemaRef('CustomerDetail') })
  deactivate(@Param('id') id: string) {
    return this.customers.setActive(id, false)
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers:update')
  @ApiOperation({ summary: 'Klant weer op actief zetten' })
  @ApiOkResponse({ schema: schemaRef('CustomerDetail') })
  activate(@Param('id') id: string) {
    return this.customers.setActive(id, true)
  }
}
