# ADR-0001 - Modulaire monoliet in een monorepo

- Datum: 2026-10-08
- Status: geaccepteerd

## Context

Langlopend ERP/CRM met twaalf voorziene modules, 3-5 interne gebruikers en
100-500 orders per maand. Het systeem moet jarenlang uitbreidbaar zijn zonder
dat nieuwe modules bestaande functionaliteit beschadigen.

## Besluit

Een modulaire monoliet, geen microservices. Monorepo met npm workspaces:
`apps/api` (NestJS), `apps/web` (Next.js), en gedeelde packages voor database,
contracts, ui en config.

Iedere module in `apps/api/src/modules/` is een bounded context en bezit zijn
eigen tabellen. Modules communiceren uitsluitend via geexporteerde services.
Ontkoppeling van neveneffecten (tijdlijn, auditlog, meldingen) gaat via een
interne event bus, zodat de order-module niets van taken of documenten weet.

npm workspaces in plaats van pnpm: npm 11 is al aanwezig en vraagt geen extra
installatie. Overstappen op pnpm kost in dit stadium weinig als het knelt.

## Gevolgen

- Een nieuwe module toevoegen raakt bestaande code niet.
- Eén deploy, één database, één transactiegrens: eenvoudig te beheren.
- De moduleregel moet gehandhaafd worden; bij overtreding ontstaat alsnog een
  verknoopte monoliet. Opnemen in code review.

## Alternatieven

- **Microservices.** Afgewezen: operationele last staat niet in verhouding tot
  vijf gebruikers.
- **Eén Next.js-app met server actions.** Afgewezen: achtergrondtaken,
  leveranciersimports en een publieke lees-API vragen een echte backend.
