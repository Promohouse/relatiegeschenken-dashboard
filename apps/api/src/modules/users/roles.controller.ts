import {
  Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post,
} from '@nestjs/common'
import { ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import {
  createRoleSchema, updateRoleSchema, type CreateRole, type UpdateRole,
} from '@rgh/contracts'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
import { schemaRef } from '../../core/openapi/schema-registry'
import { RolesService } from './roles.service'
import { UsersService } from './users.service'
import './users.schema'

/**
 * Rollen beheren valt onder `users:update`: wie gebruikers beheert, bepaalt
 * ook wat die gebruikers mogen. Een apart recht zou suggereren dat die twee
 * los van elkaar te geven zijn, en dat is niet zo.
 */
@ApiTags('gebruikers')
@Controller('roles')
export class RolesController {
  constructor(
    private readonly users: UsersService,
    private readonly roles: RolesService,
  ) {}

  @Get()
  @RequirePermission('users:view')
  @ApiOperation({ summary: 'Rollen met hun rechten' })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('Role') } })
  list() {
    return this.users.roles()
  }

  @Get('permissions')
  @RequirePermission('users:view')
  @ApiOperation({
    summary: 'Alle rechten, gegroepeerd per module',
    description: 'Rechten heten module:actie. Hiermee bouwt het scherm het rechtenraster op.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('PermissionGroup') } })
  permissions() {
    return this.roles.permissions()
  }

  @Get(':id')
  @RequirePermission('users:view')
  @ApiOperation({ summary: 'Eén rol, met het aantal gebruikers dat hem heeft' })
  @ApiOkResponse({ schema: schemaRef('RoleDetail') })
  byId(@Param('id') id: string) {
    return this.roles.byId(id)
  }

  @Post()
  @RequirePermission('users:update')
  @ApiOperation({ summary: 'Rol aanmaken' })
  @ApiCreatedResponse({ schema: schemaRef('RoleDetail') })
  create(@Body(new ZodValidationPipe(createRoleSchema)) body: CreateRole) {
    return this.roles.create(body)
  }

  @Patch(':id')
  @RequirePermission('users:update')
  @ApiOperation({
    summary: 'Naam, omschrijving of rechten wijzigen',
    description:
      'Ook bij een systeemrol. Een wijziging waarna niemand meer users:update heeft wordt ' +
      'geweigerd en teruggerold.',
  })
  @ApiOkResponse({ schema: schemaRef('RoleDetail') })
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRole,
  ) {
    return this.roles.update(id, body)
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('users:update')
  @ApiOperation({
    summary: 'Rol verwijderen',
    description:
      'Alleen als de rol van niemand is en niet door het systeem is aangemaakt. Anders zou ' +
      'iemand ineens rechten kwijt zijn zonder dat het opvalt.',
  })
  remove(@Param('id') id: string) {
    return this.roles.remove(id)
  }
}
