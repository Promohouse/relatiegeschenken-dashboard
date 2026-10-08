# ADR-0006 - Prisma 7, en versies expliciet vastzetten

- Datum: 2026-10-08
- Status: geaccepteerd

## Context

Bij `npm install -D prisma` kwam **8.0.0-rc.21** binnen: de dist-tag `latest`
van het pakket `prisma` staat op een release candidate, terwijl `prev` de
laatste stabiele versie is (7.10.0). `@prisma/client` leverde wel 7.10.0, dus
een blind `install` geeft een CLI en een client met verschillende majors.

Prisma 8 is bovendien een geheel ander product: de CLI is omgebouwd tot een
platform-CLI (`prisma deploy`, `prisma contract`, `prisma project`) waarin de
ORM-commando's op andere plekken zitten.

## Besluit

1. **Prisma vastgezet op 7.10.0**, CLI en client in dezelfde versie. Geen
   caret-bereik over een major heen voor dit soort kernafhankelijkheden.
2. **Prisma 7-werkwijze overgenomen** zoals die versie het vraagt:
   - connectie-URL's staan in `packages/db/prisma.config.ts`, niet meer in
     het schema (`datasource` bevat alleen nog `provider`);
   - de client verbindt via de driver-adapter `@prisma/adapter-pg` op `pg`;
   - Prisma laadt `.env` niet meer zelf: de npm-scripts gebruiken
     `dotenv -e ../../.env --`, zodat er één `.env` in de repository-root is.
3. **Upgraden naar 8 is een eigen traject** met een eigen ADR, pas als 8 een
   stabiele release heeft en de migratiekosten bekend zijn.

## Gevolgen

- Reproduceerbare installaties; geen verrassing door een dist-tag.
- De pool wordt expliciet in code gezet (`max`), wat op de gedeelde lokale
  PostgreSQL ook nodig is (ADR-0002).
- Bij elke afhankelijkheid die we toevoegen controleren we eerst of `latest`
  daadwerkelijk stabiel is. Dat gold hier ook voor TypeScript en Vitest.

## Aandachtspunt: npm blokkeert install-scripts

npm 11 voert postinstall-scripts niet meer automatisch uit en waarschuwt
daarover (`@prisma/engines`, `esbuild`). In deze opstelling werkt alles
alsnog - Prisma genereert, esbuild heeft zijn binary - maar als een build
onverklaarbaar faalt is dit het eerste om te controleren:
`npm install-scripts ls`.
