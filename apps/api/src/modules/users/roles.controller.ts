import { Controller, Get } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import { RequirePermission } from '../../core/auth/auth.decorators'
import { schemaRef } from '../../core/openapi/schema-registry'
import { UsersService } from './users.service'
import './users.schema'

@ApiTags('gebruikers')
@Controller('roles')
export class RolesController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('users:view')
  @ApiOperation({
    summary: 'Rollen met hun rechten',
    description:
      'Rechten staan in de database als module:actie, dus ze zijn te wijzigen zonder ' +
      'code-release. Het scherm om ze te wijzigen volgt nog.',
  })
  @ApiOkResponse({ schema: { type: 'array', items: schemaRef('Role') } })
  list() {
    return this.users.roles()
  }
}
