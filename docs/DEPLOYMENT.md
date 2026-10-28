# DEPLOYMENT — omgevingen, Kubernetes en CI/CD

**Dit document is een ontwerp, geen uitvoering.** Er is nog geen
infrastructuur aangemaakt en er staan nog geen Helm-charts of manifesten in de
repository. Dat gebeurt pas na expliciete toestemming én nadat de
hostinggegevens bekend zijn (§2).

## 1. Stand van de ontwikkelmachine

| | |
|---|---|
| Node | 26.7.0 (geen LTS; zie ADR-0002) |
| PostgreSQL | 16.14 via Homebrew, **gedeeld met andere projecten** |
| Redis | niet aanwezig |
| Docker, kubectl, Helm | niet aanwezig |
| Poorten | web 3100, api 3101 (3000 is bezet) |

Lokaal werkt het project op de bestaande PostgreSQL met een eigen rol en eigen
databases met het voorvoegsel `relatiegeschenken_`, beschermd door
`scripts/db-guard.mjs`. Productie krijgt een **eigen server en eigen
database-instantie**; de gedeelde opzet is een ontwikkelongemak, geen
eigenschap van het systeem.

Zodra Docker beschikbaar is komt er een `docker compose` voor lokale
ontwikkeling met PostgreSQL, Redis, MinIO (S3-compatibel) en Mailpit
(testmailbox). Die bestanden zijn er nog niet.

## 2. Wat ik van de hostingpartij moet weten

Zonder deze antwoorden kan ik geen providerafhankelijke infrastructuur
ontwerpen zonder te gaan gokken, en dat doe ik niet.

1. **Welke hostingpartij** is het, en welk product: beheerde Kubernetes, eigen
   cluster op VM's, of alleen VM's?
2. **Twee clusters mogelijk** voor DEV en productie, of één cluster met
   namespaces? Dit bepaalt het hele isolatieontwerp.
3. **Beheerde PostgreSQL** beschikbaar, of draaien we die zelf in het cluster?
   Welke versie, en is point-in-time-herstel mogelijk?
4. **Beheerde Redis** beschikbaar, of zelf draaien?
5. **S3-compatibele objectopslag** beschikbaar? Welke endpoint, en is
   versleuteling in rust standaard?
6. **Container registry**: eigen registry, of GitHub Container Registry?
7. **Ingress en TLS**: welke ingress-controller, en hoe worden certificaten
   beheerd?
8. **Secretvoorziening**: alleen Kubernetes-secrets, of een kluis?
9. **Back-ups**: wat verzorgt de host, met welke frequentie en bewaartermijn,
   en kunnen wij een herstelproef uitvoeren?
10. **Monitoring en logging**: wat is er al, en kunnen we daar
    OpenTelemetry-traces in kwijt?
11. **Uitgaande e-mail**: mag de applicatie via Microsoft 365 verzenden, of is
    er een relay?
12. **Gebruikt u GitHub?** Dat bepaalt of CI/CD op GitHub Actions kan.

## 3. Omgevingen

### DEV
Eigen applicatieomgeving, database, Redis, documentopslag, testaccounts,
testbetalingen (Mollie-testmodus), testmailbox, en een SnelStart-mock of
testomgeving. Automatische deployment na goedgekeurde codewijzigingen.

Harde begrenzing, technisch afgedwongen: geen echte klantmail, geen echte
betalingen, geen definitieve facturen. Zie SECURITY.md §8.

### PRODUCTIE
Eigen database, Redis en documentopslag. Live Microsoft 365, live SnelStart,
live Mollie. Back-ups, monitoring. **Handmatig goedgekeurde releases.**

## 4. Kubernetes-ontwerp

Voorkeur: **twee clusters**. Dat geeft isolatie zonder dat één verkeerde
configuratie productie raakt.

Als één cluster: strikte scheiding met aparte namespaces (`rgh-dev`,
`rgh-prod`), RBAC per namespace zonder cross-namespace rechten,
NetworkPolicies die default-deny zijn en alleen het noodzakelijke toestaan,
eigen secrets, eigen opslagklassen en strikt eigen databases. Geen enkele
gedeelde credential tussen DEV en productie.

Workloads per omgeving:

| Workload | Vorm | Opmerking |
|---|---|---|
| `web` | Deployment | Next.js |
| `api` | Deployment | NestJS, readiness op databaseverbinding |
| `worker-workflow` | Deployment | outbox en workflowovergangen |
| `worker-imports` | Deployment | leveranciersimports, bulkverwerking |
| `worker-mail` | Deployment | Graph in en uit |
| `worker-extraction` | Deployment | OCR en document-AI |
| `worker-accounting` | Deployment | SnelStart-synchronisatie, idempotent |
| `migrate` | Job | draait vóór de nieuwe versie live gaat |
| `cron` | CronJobs | herinneringen, geplande imports, feedgeneratie |

Afspraken:
- **Container-images met onveranderlijke digests**, geen `latest`-tags.
- De migratie-Job moet slagen voordat de nieuwe pods verkeer krijgen.
- Workers schalen onafhankelijk van de web- en api-pods; een zware import mag
  de interface niet vertragen.
- Resource requests en limits op alles, zodat een worker het cluster niet
  opeet.
- Pod-securitycontext: niet als root, read-only root filesystem,
  capabilities gedropt.
- Helm met één chart en per omgeving een values-bestand. Geen gekopieerde
  manifesten per omgeving.

## 5. CI/CD

Uitgangspunt GitHub Actions, onder voorbehoud van vraag 12.

**Op elke pull request:** install, typecheck, lint, unit- en integratietests
tegen een wegwerpdatabase, migratiecontrole (schema en migraties lopen
gelijk), build van de images, Playwright-tests tegen de gebouwde applicatie.

**Op `main`, na goedkeuring:** image bouwen en pushen met digest,
migratie-Job op DEV, deploy naar DEV, smoke-tests.

**Naar productie:** uitsluitend handmatig, met een expliciete goedkeuringsstap
en de digest die al op DEV heeft gedraaid. Geen rebuild tussen DEV en
productie — exact hetzelfde image.

**Terugrollen:** vorige digest opnieuw uitrollen. Database-migraties zijn
voorwaarts: een migratie die niet terug te draaien is krijgt een expliciete
waarschuwing in de pull request, en bij zo'n migratie wordt eerst een back-up
geverifieerd.

## 6. Observability

OpenTelemetry-traces over HTTP-requests, jobs en externe aanroepen, zodat een
trage order-opslag of een hangende SnelStart-aanroep terug te volgen is.
Minimaal te bewaken: foutpercentage per endpoint, lengte en leeftijd van de
wachtrijen, omvang van de dead-letter-wachtrij, achterstand van de outbox,
mislukte integratie-aanroepen, duur en uitkomst van imports, databaseconnecties
en replicatievertraging.

Alarmeren op wat een mens moet oplossen: dead-letter groeit, outbox loopt
achter, SnelStart-synchronisatie faalt herhaaldelijk, back-up mislukt.

## 7. Aannames en risico's

| | Risico | Beheersing |
|---|---|---|
| A1 | De host biedt geen beheerde PostgreSQL of Redis | zelf draaien in het cluster met persistente opslag; meer beheerlast, ontwerp verandert niet |
| A2 | Eén cluster in plaats van twee | strikte namespace-isolatie; restrisico blijft hoger, expliciet vastleggen |
| A3 | SnelStart ondersteunt niet alle gewenste handelingen via de API | eerst een integratieproef; bij ontbrekende functionaliteit een controleerbare alternatieve werkwijze zonder dubbele boekingen |
| A4 | Microsoft Graph-permissies beperkter dan gehoopt | eerst vaststellen welke mailboxen en permissies mogen; functionaliteit daarop aanpassen in plaats van omgekeerd |
| A5 | Node 26 is geen LTS | bij onverklaarbare bouwfouten Node 24 LTS vastpinnen |
| A6 | Geen Docker op de ontwikkelmachine | compose-bestanden blijven ongetest tot Docker er is; dat staat vermeld in plaats van verzwegen |
| A7 | Documentextractie met OCR levert onvoldoende kwaliteit | verwisselbare extractieservice achter een poort; lage zekerheid leidt altijd tot handmatige controle |
| A8 | Teamleader-export dekt niet alles | proefimport met importverslag en foutenoverzicht vóór de echte migratie |
