import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createUserSchema, listUsersQuerySchema, updateUserSchema,
  type CreateUser, type ListUsersQuery, type UpdateUser,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { UsersService } from './users.service'
import './users.schema'

@ApiTags('gebruikers')
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users:view')
  @ApiOperation({ summary: 'Gebruikers zoeken', description: 'Zoekt op naam en e-mailadres.' })
  @ApiOkResponse({ schema: schemaRef('UserPage') })
  list(@Query(new ZodValidationPipe(listUsersQuerySchema)) query: ListUsersQuery) {
    return this.users.list(query)
  }

  @Get(':id')
  @RequirePermission('users:view')
  @ApiOperation({ summary: 'Eén gebruiker met zijn rollen' })
  @ApiOkResponse({ schema: schemaRef('User') })
  byId(@Param('id') id: string) {
    return this.users.byId(id)
  }

  @Post()
  @RequirePermission('users:create')
  @ApiOperation({
    summary: 'Gebruiker aanmaken',
    description:
      'Zelfregistratie staat uit; dit is de enige manier waarop een account ontstaat. Het ' +
      'beginwachtwoord stelt de beheerder in en geeft hij veilig door.',
  })
  @ApiCreatedResponse({ schema: schemaRef('User') })
  create(@Body(new ZodValidationPipe(createUserSchema)) body: CreateUser) {
    return this.users.create(body)
  }

  @Patch(':id')
  @RequirePermission('users:update')
  @ApiOperation({ summary: 'Naam of rollen wijzigen' })
  @ApiOkResponse({ schema: schemaRef('User') })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateUserSchema)) body: UpdateUser,
  ) {
    return this.users.update(id, body)
  }

  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users:update')
  @ApiOperation({
    summary: 'Gebruiker op inactief zetten',
    description:
      'Niet verwijderen: een gebruiker hangt aan orders, goedkeuringen en het auditlog. ' +
      'Jezelf op inactief zetten kan niet, en er moet altijd iemand overblijven die gebruikers beheert.',
  })
  @ApiOkResponse({ schema: schemaRef('User') })
  deactivate(@Param('id') id: string) {
    return this.users.setActive(id, false)
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('users:update')
  @ApiOperation({ summary: 'Gebruiker weer activeren' })
  @ApiOkResponse({ schema: schemaRef('User') })
  activate(@Param('id') id: string) {
    return this.users.setActive(id, true)
  }
}
