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

## 2. De hostingomgeving

Vastgesteld op 2026-10-28, uitgewerkt in
[ADR-0010](architecture/0010-deployment-decorsign-k3s-argocd.md).

| | |
|---|---|
| Hostingpartij | **Decorsign** |
| Orkestratie | **K3s**, door Decorsign beheerd. Geen cluster-admin of `kubectl` vanuit dit project. |
| Deployment | **ArgoCD**, door Decorsign beheerd. Nieuwe projecten aanvragen bij hen. |
| Clusters | **Eén**, gescheiden met namespaces `rgh-dev` en `rgh-prod` en twee ArgoCD-projecten |
| PostgreSQL | zelf gedraaid in het cluster. **Eigen instantie per namespace** - afwijking van het bestaande project, zie risico R1 in ADR-0010 |
| Valkey | nog niet aanwezig in het cluster; kleine StatefulSet per namespace |
| Versiebeheer en CI | **GitHub** en GitHub Actions; repository nog aan te maken |
| Domein | `promohouse.nl` draagt de huidige webshop. Platform op subdomeinen: `hub.` en `klanten.`, met `.dev.` ervoor op DEV |
| Back-up en PITR | **onbekend** - harde voorwaarde voor livegang, zie risico R2 |

### Nog te vragen aan Decorsign

1. Ondersteunen jullie ArgoCD-projecten **Helm**, of werken jullie met
   **Kustomize**? Wij volgen wat jullie beheren.
2. Mag ons ArgoCD-project **eigen StatefulSets en PersistentVolumeClaims**
   aanmaken, voor een eigen PostgreSQL en een Valkey per namespace? Of levert
   Decorsign die infrastructuur?
3. Kunnen DEV en productie een **eigen PostgreSQL-instantie** krijgen in plaats
   van één gedeelde met verschillende databasenamen?
4. Welke **back-upstrategie** loopt er op de PostgreSQL-volumes, met welke
   frequentie en bewaartermijn, en is **point-in-time-herstel** mogelijk?
   Kunnen wij een herstelproef uitvoeren?
5. Welk **container registry** gebruiken we: GitHub Container Registry of een
   registry van Decorsign?
6. Welke **ingress-controller** staat er, en hoe wordt **TLS** geregeld
   (cert-manager, of handmatig)?
7. Wie beheert de **DNS** van `promohouse.nl`, en kunnen de subdomeinen
   `hub.`, `klanten.` en hun `.dev.`-varianten naar de cluster-ingress wijzen
   zonder de huidige webshop te raken?
8. Is er **monitoring en logging** waar wij OpenTelemetry-traces in kwijt
   kunnen, of regelen we dat zelf in onze namespace?
9. Welke **secretvoorziening** is beschikbaar: Kubernetes-secrets, sealed
   secrets, of een kluis?
10. Mag de applicatie **uitgaande e-mail** via Microsoft 365 versturen, of
    loopt dat via een relay?

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
- Eén set manifesten met een overlay per omgeving. Of dat Helm of Kustomize
  wordt, hangt af van wat Decorsign ondersteunt (vraag 1 hierboven). Geen
  gekopieerde manifesten per omgeving.

## 5. CI/CD: GitHub Actions bouwt, ArgoCD deployt

Omdat er geen cluster-admin is, deployt CI nooit zelf.

**Op elke pull request:** install, typecheck, lint, unit- en integratietests
tegen een wegwerpdatabase, migratiecontrole (schema en migraties lopen
gelijk), image bouwen, Playwright-tests tegen de gebouwde applicatie.

**Op `main`:** image bouwen en pushen met een onveranderlijke digest, die
digest in de DEV-manifesten schrijven, commit. ArgoCD synchroniseert `rgh-dev`
automatisch. Daarna smoke-tests tegen DEV.

**Naar productie:** de digest die al op DEV draaide wordt in de
productiemanifesten gezet, in een aparte pull request. Het ArgoCD-project
`rgh-prod` staat op **handmatige sync**, dus niemand kan productie per ongeluk
wijzigen. Geen rebuild tussen DEV en productie: exact hetzelfde image.

**Terugrollen:** de vorige digest terugzetten in de manifesten. Omdat de staat
in Git staat, is terugrollen een commit en geen clusteractie.

**Migraties** draaien als Job vóór de nieuwe pods verkeer krijgen. Migraties
zijn voorwaarts; een migratie die niet terug te draaien is krijgt een
expliciete waarschuwing in de pull request, en dan wordt eerst een back-up
geverifieerd - wat met risico R2 uit ADR-0010 nu nog niet aantoonbaar is.

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
| A1 | **Bevestigd:** geen beheerde PostgreSQL, geen Redis aanwezig | zelf draaien in het cluster per namespace; zie ADR-0010 |
| A2 | **Bevestigd:** één cluster | strikte namespace-isolatie, geen gedeelde secrets, handmatige sync op productie; restrisico blijft en is geaccepteerd |
| A9 | **Nieuw:** dev en productie delen in het bestaande project één PostgreSQL-instantie | eigen instantie per namespace aanvragen; lukt dat niet, dan rollen scheiden met REVOKE CONNECT en het restrisico vastleggen (ADR-0010 R1) |
| A10 | **Nieuw:** back-up en point-in-time-herstel niet aantoonbaar | navragen bij Decorsign en een herstelproef doen; harde voorwaarde voor livegang (ADR-0010 R2) |
| A3 | SnelStart ondersteunt niet alle gewenste handelingen via de API | eerst een integratieproef; bij ontbrekende functionaliteit een controleerbare alternatieve werkwijze zonder dubbele boekingen |
| A4 | Microsoft Graph-permissies beperkter dan gehoopt | eerst vaststellen welke mailboxen en permissies mogen; functionaliteit daarop aanpassen in plaats van omgekeerd |
| A5 | Node 26 is geen LTS | bij onverklaarbare bouwfouten Node 24 LTS vastpinnen |
| A6 | Geen Docker op de ontwikkelmachine | compose-bestanden blijven ongetest tot Docker er is; dat staat vermeld in plaats van verzwegen |
| A7 | Documentextractie met OCR levert onvoldoende kwaliteit | verwisselbare extractieservice achter een poort; lage zekerheid leidt altijd tot handmatige controle |
| A8 | Teamleader-export dekt niet alles | proefimport met importverslag en foutenoverzicht vóór de echte migratie |
