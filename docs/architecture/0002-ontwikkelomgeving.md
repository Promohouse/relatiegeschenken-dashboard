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
   databases, géén superuser. Zie de correctie onderaan voor wat dit precies
   wel en niet afdekt.
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

## Afbakening: dit besluit geldt alleen lokaal

Alles hierboven gaat over de **ontwikkelmachine**. De productieomgeving komt op
een **eigen server**, niet op een server die al voor een ander project in
gebruik is. Daar geldt dus:

- eigen PostgreSQL-instantie, alleen voor dit systeem
- `shared_buffers` en `max_connections` afgestemd op deze applicatie, geen
  concurrentie met andere projecten
- eigen back-up- en herstelprocedure, met een restore-test
- de compose-opzet in `docker/` is daarvoor het vertrekpunt

Het gedeelde geheugen en de gedeelde back-up van de lokale instantie zijn
daarmee een ontwikkelongemak, geen eigenschap van het systeem. De keuze voor
een eigen server in productie staat vast; de concrete invulling (hosting,
omvang, deploymethode) volgt in een eigen ADR zodra Fase 1 af is.


## Correctie 2026-10-08: wat de scheiding precies afdekt

Bij verificatie bleek de oorspronkelijke formulering ("technisch uitgesloten")
te sterk. PostgreSQL geeft `CONNECT` op elke database standaard aan `PUBLIC`,
dus ook aan een nieuwe rol. Gemeten rechten van de rol `relatiegeschenken`:

| | eigen databases | andere databases |
|---|---|---|
| CONNECT | ja | **ja** (standaard via PUBLIC) |
| CREATE op database | ja | nee |
| SELECT op tabellen | ja | **nee** - 0 van 22 tabellen in `promohouse` |
| INSERT / UPDATE / DELETE | ja | **nee** - 0 van 22 |
| objecten aanmaken in schema `public` | ja | nee |

Juiste formulering: de rol kan verbinden met de databases van andere projecten
en daar de systeemcatalogus zien (tabelnamen en structuur), maar kan **geen
enkele rij lezen of wijzigen en niets aanmaken**. Datatoegang is dus wel
uitgesloten, verbinden niet.

Verdere dichtzetten is mogelijk met
`REVOKE CONNECT ON DATABASE <db> FROM PUBLIC`, maar dat wijzigt rechten op de
databases van andere projecten. Alleen doen na expliciete toestemming, en na
controle met welke rol die projecten verbinden: de eigenaar van een database
kan altijd verbinden, een aparte applicatierol die op de PUBLIC-grant leunt
niet meer.
