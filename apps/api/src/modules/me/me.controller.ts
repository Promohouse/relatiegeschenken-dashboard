import { Body, Controller, Get, Patch, Req } from '@nestjs/common'
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger'
import type { Request } from 'express'
import { z } from 'zod'
import { updateThemeSchema, type ThemePreference } from '@rgh/contracts'
import { RequireLogin } from '../../core/auth/auth.decorators'
import { AuthService } from '../../core/auth/auth.service'
import { PrismaService } from '../../core/prisma/prisma.service'
import { ZodValidationPipe } from '../../core/validation/zod-validation.pipe'
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
    /** Lichte of donkere weergave; SYSTEM volgt het besturingssysteem. */
    themePreference: z.enum(['SYSTEM', 'LIGHT', 'DARK']),
    permissions: z.array(z.string()),
  }),
)

@ApiTags('systeem')
@Controller('me')
export class MeController {
  constructor(
    private readonly auth: AuthService,
    private readonly prisma: PrismaService,
  ) {}

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
    const [permissions, voorkeur] = await Promise.all([
      this.auth.permissionsFor(user.id),
      this.prisma.db.user.findUnique({
        where: { id: user.id },
        select: { themePreference: true },
      }),
    ])

    return {
      id: user.id,
      name: user.name,
      email: user.email,
      customerId: user.customerId,
      twoFactorEnabled: user.twoFactorEnabled,
      themePreference: voorkeur?.themePreference ?? 'SYSTEM',
      permissions: [...permissions].sort(),
    }
  }

  @Patch('theme')
  @RequireLogin()
  @ApiOperation({
    summary: 'Lichte of donkere weergave kiezen',
    description:
      'Een persoonlijke voorkeur, geen systeeminstelling: wie \'s avonds werkt wil iets anders ' +
      'dan wie overdag werkt. Hij staat bij de gebruiker en geldt dus op elk apparaat.',
  })
  async setTheme(
    @Req() request: Request,
    @Body(new ZodValidationPipe(updateThemeSchema)) body: { theme: ThemePreference },
  ) {
    await this.prisma.db.user.update({
      where: { id: request.user!.id },
      data: { themePreference: body.theme },
    })
    return { themePreference: body.theme }
  }
}
