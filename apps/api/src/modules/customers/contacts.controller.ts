import { Body, Controller, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createContactSchema, updateContactSchema, type CreateContact, type UpdateContact,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { ContactsService } from './contacts.service'

@ApiTags('klanten')
@Controller('customers/:customerId/contacts')
export class ContactsController {
  constructor(private readonly contacts: ContactsService) {}

  @Post()
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Contactpersoon toevoegen',
    description: 'Wordt deze het hoofdcontact, dan verliest de vorige die rol automatisch.',
  })
  create(
    @Param('customerId') customerId: string,
    @Body(new ZodValidationPipe(createContactSchema)) body: CreateContact,
  ) {
    return this.contacts.create(customerId, body)
  }

  @Patch(':contactId')
  @RequirePermission('customers:update')
  @ApiOperation({ summary: 'Contactpersoon wijzigen' })
  update(
    @Param('customerId') customerId: string,
    @Param('contactId') contactId: string,
    @Body(new ZodValidationPipe(updateContactSchema)) body: UpdateContact,
  ) {
    return this.contacts.update(customerId, contactId, body)
  }

  @Post(':contactId/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers:update')
  @ApiOperation({
    summary: 'Contactpersoon op inactief zetten',
    description:
      'Niet verwijderen: contactpersonen hangen aan orders en aan gegeven goedkeuringen.',
  })
  deactivate(@Param('customerId') customerId: string, @Param('contactId') contactId: string) {
    return this.contacts.setActive(customerId, contactId, false)
  }

  @Post(':contactId/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('customers:update')
  @ApiOperation({ summary: 'Contactpersoon weer activeren' })
  activate(@Param('customerId') customerId: string, @Param('contactId') contactId: string) {
    return this.contacts.setActive(customerId, contactId, true)
  }
}
