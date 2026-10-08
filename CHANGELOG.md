# Changelog

Alle noemenswaardige wijzigingen aan dit project.
Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).

## [Niet uitgebracht]

### Toegevoegd
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
