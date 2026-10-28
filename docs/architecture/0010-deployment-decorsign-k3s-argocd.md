# ADR-0010 - Deployment op Decorsign K3s via ArgoCD

- Datum: 2026-10-28
- Status: geaccepteerd voor de vastgestelde delen; drie punten staan open
- Vult ADR-0002 aan (ontwikkelomgeving) en concretiseert DEPLOYMENT.md

## Context

Opgave van de opdrachtgever, op basis van een bestaand project bij dezelfde
hostingpartij:

| | |
|---|---|
| Hostingpartij | **Decorsign** |
| Orkestratie | **K3s**, lichtgewicht Kubernetes op eigen (vermoedelijk VM-based) infrastructuur. Geen EKS/GKE/AKS. |
| Beheer | Decorsign beheert cluster en **ArgoCD**. Nieuwe ArgoCD-projecten moeten bij hen aangevraagd worden. **Geen self-service `kubectl` of cluster-admin vanuit dit project.** |
| Clusters | **Eén cluster.** Scheiding via namespaces en twee aparte ArgoCD-projecten; beide Applications wijzen naar `https://kubernetes.default.svc`. |
| PostgreSQL | **Zelf gedraaid in het cluster**, geen managed product. In het bestaande project draaien **dev en live tegen dezelfde Postgres-instantie**, alleen met een eigen databasenaam. |
| Redis | **Niet in gebruik** bij Decorsign in het bestaande project. |
| Point-in-time-herstel | **Onbekend.** Nergens gedocumenteerd; er is geen reden aan te nemen dat het geregeld is. |
| Versiebeheer | **GitHub**, nieuwe repository nog aan te maken. |
| Domein | **promohouse.nl**, maar dat draagt de huidige webshop. Klantportaal bijvoorbeeld `klanten.promohouse.nl`. |

## Besluit

### GitOps, geen deploy vanuit CI

Omdat er geen cluster-admin is en Decorsign ArgoCD beheert, deployt CI niet
zelf. De rolverdeling:

1. GitHub Actions bouwt en test, en pusht een image met een **onveranderlijke
   digest** naar het registry.
2. CI schrijft die digest in de manifesten in Git.
3. ArgoCD synchroniseert de doelnamespace.

Daarmee is de staat van beide omgevingen altijd uit Git te lezen, en is
terugrollen een commit. Niemand hoeft `kubectl` te kunnen.

### Twee namespaces, twee ArgoCD-projecten

`rgh-dev` en `rgh-prod` in hetzelfde cluster, elk een eigen ArgoCD-project.
Omdat het één cluster is, is de scheiding volledig een kwestie van
configuratie en moet die daarom hard zijn:

- RBAC per namespace, geen rechten over de grens;
- NetworkPolicies default-deny, alleen het noodzakelijke open;
- eigen secrets per namespace, geen enkele gedeelde credential;
- **ArgoCD-project `rgh-prod` zonder automatische sync**: productie wijzigt
  alleen na expliciete goedkeuring.

### Eigen database-instantie per omgeving

**Dit is een afwijking van het bestaande project en bewust.** Daar delen dev
en live één Postgres-instantie met verschillende databasenamen. Voor dit
platform wordt dat een eigen instantie per namespace. Zie de risicoparagraaf.

### Valkey per omgeving

Valkey bestaat nog niet in het cluster. Omdat Postgres daar ook zelf gedraaid
wordt, past Valkey op dezelfde manier: een kleine StatefulSet per namespace.
Vereist dat ons ArgoCD-project eigen workloads en volumes mag aanmaken - zie
openstaande punten.

### Subdomeinen

`promohouse.nl` blijft bij de huidige webshop; die mag hier niet door geraakt
worden. Voorstel:

| Omgeving | Intern dashboard | Klantportaal |
|---|---|---|
| Productie | `hub.promohouse.nl` | `klanten.promohouse.nl` |
| DEV | `hub.dev.promohouse.nl` | `klanten.dev.promohouse.nl` |

## Risico's, en wat we eraan doen

### R1 - Eén Postgres voor dev en productie (hoog)

Zo werkt het bestaande project. Databases in PostgreSQL zijn onderling
gescheiden, dus data lekt niet zomaar van de ene naar de andere - dat is
lokaal gemeten en vastgelegd in de correctie bij ADR-0002. Maar de instantie
is wel gedeeld, en daarmee:

- een zware import of migratie op DEV vertraagt **productie**;
- één storing of vol volume raakt beide omgevingen;
- back-up en herstel zijn niet per omgeving te scheiden: terugzetten van
  productie raakt de instantie waar DEV ook op draait;
- `CONNECT` staat in PostgreSQL standaard open voor `PUBLIC`, dus een
  DEV-rol kan met de productiedatabase verbinden. Datatoegang blijft
  geblokkeerd, verbinden niet.

Dit botst daarnaast met de opdracht zelf, die voor DEV en productie
expliciet een eigen database vraagt.

**Beheersing:** eigen Postgres-instantie per namespace. Die wordt al in het
cluster gedraaid, dus het is een tweede StatefulSet, geen nieuw product en
geen extra licentie. Lukt dat niet, dan als minimum: aparte rollen per
omgeving met `REVOKE CONNECT ... FROM PUBLIC` op elkaars databases, eigen
resource-limieten, en expliciet vastleggen dat het restrisico blijft.

### R2 - Back-up en herstel niet aantoonbaar (hoog)

Er is geen zichtbare back-upstrategie en geen PITR-configuratie. Een back-up
die nooit is teruggezet is geen back-up.

**Beheersing:** vóór livegang navragen bij Decorsign wat er precies loopt, en
een **herstelproef** uitvoeren waarbij database én documentopslag samen in een
schone omgeving worden teruggezet. Dit is een harde voorwaarde in Fase 9; geen
livegang zonder.

### R3 - Eén cluster (gemiddeld)

Een configuratiefout kan in principe over de namespacegrens heen werken.
Beheersing zoals hierboven, plus: geen gedeelde secrets, en geen
automatische sync op productie. Restrisico blijft en wordt geaccepteerd.

### R4 - Geen cluster-admin (laag, maar bepalend)

We kunnen niets zelf aanmaken of debuggen op clusterniveau. Alles loopt via
Decorsign. Dat vraagt om een duidelijke aanvraag in één keer, en om manifesten
die zelfbeschrijvend zijn. Dit is de reden dat het ontwerp GitOps-first is.

## Openstaande punten

1. **Helm of Kustomize.** De opdracht vraagt Helm; het bestaande project bij
   Decorsign gebruikt Kustomize. ArgoCD ondersteunt beide. Voorstel: volgen
   wat Decorsign in hun ArgoCD-projecten ondersteunt en gewend is, want zij
   beheren het. Dan wijkt dit onderdeel gemotiveerd af van de opdracht.
2. **Mag ons ArgoCD-project eigen StatefulSets en PersistentVolumeClaims
   aanmaken** (voor Postgres en Valkey), of levert Decorsign die infrastructuur?
3. **Registry, ingress en TLS:** GitHub Container Registry of een registry van
   Decorsign? Welke ingress-controller, en wordt TLS met cert-manager geregeld?
   En wie beheert de DNS van promohouse.nl?
