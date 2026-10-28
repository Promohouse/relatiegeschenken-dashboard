import { Body, Controller, Delete, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createAddressSchema, updateAddressSchema, type CreateAddress, type UpdateAddress,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { AddressesService } from './addresses.service'

@ApiTags('klanten')
@Controller('customers/:customerId/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Post()
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Adres toevoegen',
    description:
      'Het eerste adres van een soort wordt vanzelf het standaardadres. Een nieuw standaardadres ' +
      'ontneemt die rol aan het vorige.',
  })
  create(
    @Param('customerId') customerId: string,
    @Body(new ZodValidationPipe(createAddressSchema)) body: CreateAddress,
  ) {
    return this.addresses.create(customerId, body)
  }

  @Patch(':addressId')
  @RequirePermission('customers:update')
  @ApiOperation({ summary: 'Adres wijzigen' })
  update(
    @Param('customerId') customerId: string,
    @Param('addressId') addressId: string,
    @Body(new ZodValidationPipe(updateAddressSchema)) body: UpdateAddress,
  ) {
    return this.addresses.update(customerId, addressId, body)
  }

  @Delete(':addressId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Adres verwijderen',
    description:
      'Kan alleen als het adres nergens gebruikt is. Een adres dat aan een order, offerte of ' +
      'zending hangt wordt geweigerd, met vermelding waar het gebruikt wordt.',
  })
  remove(@Param('customerId') customerId: string, @Param('addressId') addressId: string) {
    return this.addresses.remove(customerId, addressId)
  }
}
