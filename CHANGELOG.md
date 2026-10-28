# Changelog

Alle noemenswaardige wijzigingen aan dit project.
Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).

## [Niet uitgebracht]

### Toegevoegd
- Offertes als eigen aggregaat (ADR-0007): quotes, quote_versions,
  quote_items, quote_item_print_jobs en quote_approvals, met vier
  databasetriggers die onveranderlijkheid afdwingen en een expliciet
  ontsnappingsluik voor beheer. Orders verwijzen via quoteVersionId naar de
  geaccepteerde versie; orderregels houden hun herkomst vast. 94 tests.
- BullMQ op Valkey als jobqueue (ADR-0009), Valkey lokaal draaiend.
- NestJS bevestigd als backendframework (ADR-0008).
- Fase 0 documentatie op basis van de masterprompt: MASTERPLAN.md,
  ARCHITECTURE.md, DATABASE.md, WORKFLOWS.md, SECURITY.md, DEPLOYMENT.md,
  DEVELOPMENT-ROADMAP.md en DECISIONS.md. CLAUDE.md uitgebreid met tien
  nieuwe harde regels.
- Ontwerp van de centrale workflow-engine: vijf statusdimensies, afgeleide
  orderstatus, parallelle orderregels, transactional outbox, idempotentie,
  optimistic locking en de workflow voor inkoopfacturen.
- Besluitenregister D-01 t/m D-10 met de verschillen tussen de masterprompt
  en de opdracht van 8 oktober.
- Stap 1b: staging- en connectortabellen met capability-routing per
  leverancier, drukproeven met versies en goedkeuringshistorie, inkoop met
  deelontvangsten, voorbereide inkoopfacturen met dubbelherkenning, en
  kanalen met prijsregels, partnerfeeds en API-sleutels. Tweede migratie,
  23 nieuwe tabellen (58 totaal). Seed uitgebreid met de koppelconfiguratie
  van de vijf leveranciers, alle inactief. 76 tests.
- `packages/contracts`: hash-vergelijking voor imports, API-sleutelhashing,
  inkooplogica voor deelontvangsten.
- `packages/db`: capability-routing en hash-controle voor connectoren.
- Stap 1a: eigen databaserol en databases, veiligheidsslot op destructieve
  databasecommando's, Prisma-opzet en het kernschema (34 tabellen) met eerste
  migratie, seed met gemarkeerde demodata, en 24 tests.
- `packages/db`: Prisma-client met pg-adapter, nummerreeksen met rij-lock.
- `packages/contracts`: geld- en btw-logica op decimal.js.
- ADR-0006 Prisma 7 en versievastzetting.
- Repository, monorepo-skelet en basisconfiguratie (stap 0).
- ADR-0001 t/m ADR-0005: architectuurbesluiten vastgelegd.
- Onderzoek naar koppelmogelijkheden van midocean, Toppoint, PF Concept,
  Clipper en Anda in `docs/leveranciers/koppelingen.md`.
