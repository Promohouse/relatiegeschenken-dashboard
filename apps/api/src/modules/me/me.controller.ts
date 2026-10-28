import { Controller, Get, Req } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { z } from 'zod'
import { RequireLogin } from '../../core/auth/auth.decorators'
import { AuthService } from '../../core/auth/auth.service'
import { registerSchema, schemaRef } from '../../core/openapi/schema-registry'

export const currentUserSchema = registerSchema(
  'CurrentUser',
  z.object({
    id: z.string(),
    name: z.string(),
    email: z.string(),
    /** Gevuld bij een klantgebruiker; leeg bij een medewerker. */
    customerId: z.string().nullable(),
    twoFactorEnabled: z.boolean(),
    permissions: z.array(z.string()),
  }),
)

@ApiTags('systeem')
@Controller('me')
export class MeController {
  constructor(private readonly auth: AuthService) {}

  @Get()
  @RequireLogin()
  @ApiOperation({
    summary: 'Wie ben ik en wat mag ik',
    description:
      'De interface gebruikt dit om de navigatie en knoppen te tonen die bij deze rechten horen. ' +
      'De controle zelf gebeurt op de backend; dit is alleen om niets te tonen wat toch niet mag.',
  })
  @ApiOkResponse({ schema: schemaRef('CurrentUser') })
  async me(@Req() request: Request) {
    const user = request.user!
    const permissions = await this.auth.permissionsFor(user.id)
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      customerId: user.customerId,
      twoFactorEnabled: user.twoFactorEnabled,
      permissions: [...permissions].sort(),
    }
  }
}
