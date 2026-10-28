# ADR-0011 - Validatie en OpenAPI uit Zod, en decorator-metadata

- Datum: 2026-10-28
- Status: geaccepteerd

## Context

NestJS documenteert validatie met `class-validator` en `class-transformer`:
DTO-klassen met decorators, waaruit `@nestjs/swagger` de OpenAPI-schema's
leest. Dit project heeft echter al Zod in `packages/contracts` als gedeelde
bron voor front- en backend. Beide gebruiken betekent elk schema twee keer
onderhouden, en dat loopt uit elkaar.

## Besluit

**Zod is de enige bron.** Eén schema per vorm, gebruikt voor drie dingen:

1. validatie in de frontend;
2. validatie in de api via `ZodValidationPipe`, een eigen pipe van vijftien
   regels - geen extra afhankelijkheid, geen versiekoppeling;
3. de OpenAPI-documentatie, via `z.toJSONSchema()` uit Zod 4 en een kleine
   registry in `apps/api/src/core/openapi/schema-registry.ts`.

Geen `class-validator`, geen `class-transformer`, geen `nestjs-zod`.

De registry controleert bij het opstarten dat elk opgevraagd schema ook
geregistreerd is. `schemaRef()` doet die controle met opzet **niet**:
decorators draaien tijdens het laden van een module, en dan kan de registratie
uit een ander bestand nog niet gebeurd zijn. Een typefout valt daardoor op bij
het starten in plaats van bij het importeren, met een melding die zegt welk
schema ontbreekt.

### Foutafhandeling

Services gooien domeinfouten (`NotFoundError`, `ConflictError`,
`PreconditionError`, ...) en weten niets van HTTP. Eén exception filter
vertaalt alles naar `{ error: { code, message, details?, requestId } }`.

Twee regels daarin:

- **Een interne oorzaak lekt nooit naar de client.** Een onbekende fout wordt
  een 500 met een algemene melding; de echte tekst gaat met de requestId het
  log in.
- **Een melding uit onze eigen databasetriggers komt wél door.** Die dragen
  het ADR-nummer, en de filter vertaalt ze naar een 409 met de uitleg erin.
  Zonder dat zou een gebruiker alleen "conflict" zien in plaats van
  "offerteversie is vastgezet".

## Valkuil: emitDecoratorMetadata

NestJS lost constructorafhankelijkheden op via de metadata die TypeScript
uitstoot met `emitDecoratorMetadata`. **esbuild doet dat niet**, en daarmee
ook `tsx` niet. Het gevolg is een verwarrende foutmelding diep in de injector
("Cannot read properties of undefined"), zonder verwijzing naar de oorzaak.

Daarom gebruikt dit project SWC op beide plekken:

| Waar | Hoe |
|---|---|
| Tests | `unplugin-swc` in `apps/api/vitest.config.ts`, met `legacyDecorator` en `decoratorMetadata` |
| Draaien | `node -r @swc-node/register src/main.ts` |

Dat deze twee gelijk moeten lopen is geen detail: in de eerste opzet draaiden
de tests op SWC en de applicatie op tsx, waardoor alle 28 tests slaagden
terwijl de api niet kon starten. `configureApp()` wordt om dezelfde reden door
zowel `main.ts` als de tests gebruikt: anders test je een andere opzet dan je
uitrolt.

## Gevolgen

- Eén schema per vorm, voor validatie, types en documentatie.
- Twee transpileerconfiguraties om gelijk te houden; vastgelegd in CLAUDE.md.
- `@nestjs/swagger` wordt alleen gebruikt voor het document en de decorators
  op routes, niet om schema's uit klassen te lezen.
