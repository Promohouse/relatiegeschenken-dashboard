import { z, type ZodType } from 'zod'
import type { OpenAPIObject } from '@nestjs/swagger'

/**
 * Eén bron voor validatie én documentatie.
 *
 * Een Zod-schema wordt hier geregistreerd, gebruikt om te valideren, en bij
 * het opstarten omgezet naar JSON Schema in de OpenAPI-documentatie. Zo kan
 * de documentatie niet uit de pas lopen met wat de api werkelijk accepteert,
 * en hoeft er nergens een type natypt te worden.
 *
 * `schemaRef` controleert bewust NIET of het schema al bestaat: decorators
 * draaien tijdens het laden van een module, en dan is de registratie van een
 * ander bestand misschien nog niet gebeurd. In plaats daarvan houdt de
 * registry bij welke namen zijn opgevraagd en controleert
 * `applyRegisteredSchemas` dat ze allemaal bestaan. Een typefout valt dan bij
 * het opstarten op in plaats van bij het importeren.
 */
const registry = new Map<string, ZodType>()
const opgevraagd = new Set<string>()

export function registerSchema<T extends ZodType>(name: string, schema: T): T {
  const bestaand = registry.get(name)
  if (bestaand && bestaand !== schema) {
    throw new Error(`Er is al een ander OpenAPI-schema geregistreerd onder "${name}".`)
  }
  registry.set(name, schema)
  return schema
}

/** Verwijzing naar een geregistreerd schema, voor @ApiResponse en @ApiBody. */
export function schemaRef(name: string) {
  opgevraagd.add(name)
  return { $ref: `#/components/schemas/${name}` }
}

/** Zet de geregistreerde schema's in het document en controleert verwijzingen. */
export function applyRegisteredSchemas(document: OpenAPIObject): OpenAPIObject {
  const ontbrekend = [...opgevraagd].filter((n) => !registry.has(n))
  if (ontbrekend.length > 0) {
    throw new Error(
      `Deze OpenAPI-schema's worden gebruikt maar zijn nooit geregistreerd: ${ontbrekend.join(', ')}. ` +
        'Registreer ze met registerSchema, of importeer het bestand waarin dat gebeurt.',
    )
  }

  document.components ??= {}
  document.components.schemas ??= {}

  for (const [name, schema] of registry) {
    const json = z.toJSONSchema(schema, { io: 'output' }) as Record<string, unknown>
    delete json.$schema
    document.components.schemas[name] = json as never
  }
  return document
}

export const registeredSchemaNames = () => [...registry.keys()]
