# Relatiegeschenken Hub

ERP/CRM voor relatiegeschenken, promotionele artikelen en bedrukte producten.
Zelfstandig systeem: CRM, offertes, orders, drukproeven, inkoop, documenten en
productdata uit leverancierskoppelingen, met op termijn een eigen webshop.

## Status

Fase 1 (fundament) in opbouw. Er staat nog geen applicatiecode: dit is het
skelet plus de vastgelegde architectuurbesluiten in `docs/architecture/`.

## Omgeving op deze machine

| | |
|---|---|
| Node | 26.7.0 aanwezig (zie ADR-0002 over de LTS-afweging) |
| PostgreSQL | 16.14 via Homebrew, draait als service op poort 5432 |
| Docker | niet geinstalleerd - compose-bestanden worden wel meegeleverd |
| Poorten | web 3100, api 3101 (3000 is door een ander project bezet) |

De lokale PostgreSQL wordt gedeeld met andere projecten op deze machine.
Dit project krijgt een eigen database en een eigen databaserol. Zie ADR-0002.

## Aan de slag

```bash
cp .env.example .env     # vul DATABASE_URL en de secrets in
npm install
```

Verdere commando's komen beschikbaar zodra de workspaces gevuld zijn.

## Structuur

```
apps/api        NestJS - modulaire monoliet
apps/web        Next.js - intern dashboard, later klantportaal en webshop
packages/db     Prisma schema, migraties, seed
packages/contracts  Zod-schemas en uit OpenAPI gegenereerde types
packages/ui     shadcn/ui componenten
packages/config tsconfig, eslint, tailwind-preset
docs/architecture   ADR's - besluiten, niet achteraf herschrijven
docs/leveranciers   onderzoek naar koppelingen per leverancier
```

Zie `CLAUDE.md` voor projectregels en conventies.
