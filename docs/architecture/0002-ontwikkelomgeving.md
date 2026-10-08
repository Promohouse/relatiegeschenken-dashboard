# ADR-0002 - Ontwikkelomgeving: gedeelde lokale PostgreSQL, Docker later

- Datum: 2026-10-08
- Status: geaccepteerd

## Context

De opdracht vroeg Docker Compose voor de lokale omgeving. Op deze machine is
**geen Docker geinstalleerd**, terwijl PostgreSQL 16.14 al als Homebrew-service
draait op poort 5432. Die instantie wordt gedeeld met andere projecten:
`promohouse`, `promohouse_bedrijfskleding`, `voetbalticketskopen` en
`voetbalticketskopen_test`. Op poort 3000 draait een dev-server van een ander
project.

## Besluit

Ontwikkelen op de bestaande PostgreSQL-instantie, met harde scheiding:

1. **Eigen databases**: `relatiegeschenken_dev` en `relatiegeschenken_test`.
   Databases in PostgreSQL zijn strikt gescheiden; een verbinding met de ene
   kan de andere niet uitlezen of wijzigen.
2. **Eigen databaserol** `relatiegeschenken`, eigenaar van alleen die twee
   databases, géén superuser. Hiermee is onbedoelde schade aan de databases van
   andere projecten technisch uitgesloten, niet alleen per afspraak.
3. **Veiligheidsslot**: destructieve commando's (`prisma migrate reset`) worden
   voorafgegaan door een controle op het voorvoegsel `relatiegeschenken_` uit
   `DB_NAME_PREFIX`. Wijkt de naam af, dan weigert het script.
4. **Poorten** 3100 (web) en 3101 (api), zodat poort 3000 vrij blijft.
5. **Verbindingen**: `max_connections` is 100 voor alle projecten samen.
   Connection pool klein houden: 10 voor de api, 5 voor jobs.
6. **Compose-bestanden** worden meegeleverd in `docker/` en gelden als de
   referentie voor server- en CI-omgevingen, maar zijn ongetest tot Docker
   beschikbaar is. Dat staat erbij vermeld.

Achtergrondtaken via **pg-boss** op dezelfde PostgreSQL in een eigen schema,
zodat er geen Redis en dus geen Docker nodig is.

## Gevolgen

- Direct aan de slag zonder installaties of beheerdersrechten.
- Andere projecten op deze machine ondervinden geen hinder, afgezien van
  verwaarloosbaar gedeeld geheugen- en verbindingsgebruik.
- De compose-opzet moet alsnog een keer getest worden voor de serveromgeving.
- Back-ups van de lokale instantie omvatten nu meerdere projecten; dat is een
  aandachtspunt voor wie die back-ups maakt.

## Nog te beslissen

Node 26.7.0 is de huidige versie, geen LTS; NestJS en Prisma worden getest op
22 en 24. We bouwen voorlopig op 26. Bij onverklaarbare bouwfouten: Node 24 LTS
installeren via `fnm` en vastpinnen in `.nvmrc`.
