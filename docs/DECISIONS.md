# DECISIONS — besluitenregister

Twee delen: de vastgelegde besluiten (ADR's) en de besluiten die nog open
staan. Een ADR wordt niet herschreven; bij een nieuw inzicht komt er een
nieuwe die de oude vervangt.

## 1. Vastgelegde besluiten

| ADR | Besluit | Status na de masterprompt |
|---|---|---|
| [0001](architecture/0001-modulaire-monoliet.md) | Modulaire monoliet in een monorepo, npm workspaces | blijft staan; de masterprompt vraagt hetzelfde |
| [0002](architecture/0002-ontwikkelomgeving.md) | Lokaal de gedeelde PostgreSQL met eigen rol en veiligheidsslot; productie op een eigen server | blijft staan; Docker, Kubernetes en Helm komen erbij, zie DEPLOYMENT.md |
| [0003](architecture/0003-authenticatie.md) | Onderhouden TypeScript-bibliotheek, autorisatie zelf | blijft staan; bibliotheekkeuze nog open (D-04) |
| [0004](architecture/0004-productdata-en-leverancierskoppelingen.md) | Directe leverancierskoppelingen, drie lagen, capability-routing | blijft staan, **maar de volgorde wijzigt**: CSV/XLSX-import eerst (D-06) |
| [0005](architecture/0005-geld-prijzen-en-btw.md) | NUMERIC en Decimal, prijsmomentopname, btw per regel op twee decimalen, instelbare nummerreeksen | blijft staan; aanvulling: definitieve factuurnummers komen uit SnelStart |
| [0006](architecture/0006-prisma-7-en-versievastzetting.md) | Prisma vastgezet op 7.10.0 | blijft staan |
| [0007](architecture/0007-offertemodel-splitsen.md) | Offertes als eigen aggregaat met onveranderlijke versies | besloten 2026-10-28 |
| [0008](architecture/0008-nestjs-als-backendframework.md) | NestJS blijft de backend | besloten 2026-10-28 |
| [0009](architecture/0009-achtergrondtaken-bullmq-valkey.md) | BullMQ op Valkey; outbox blijft in PostgreSQL | besloten 2026-10-28, vervangt pg-boss |
| [0010](architecture/0010-deployment-decorsign-k3s-argocd.md) | Deployment op Decorsign K3s via ArgoCD, GitOps, twee namespaces | besloten 2026-10-28; drie punten bij Decorsign open |
| [0011](architecture/0011-validatie-en-openapi-uit-zod.md) | Zod als enige bron voor validatie, types en documentatie | besloten 2026-10-28 |
| [0012](architecture/0012-authenticatie-better-auth.md) | better-auth voor identiteit, autorisatie en klantisolatie zelf | besloten 2026-10-28 |

## 1b. Bevestigd op 2026-10-28

- **De masterprompt vervangt de opdracht van 8 oktober.** SnelStart, Mollie en
  Microsoft 365 zijn daarmee in scope, waar de oude opdracht externe
  koppelingen uitsloot.
- **Bedrijfskleding valt buiten scope.** Geen maattabellen of bestellen per
  maat in het productmodel.
- **Partnerprogramma's**: de masterprompt noemt ze niet meer, alleen een
  toekomstige webshop-API. Aanname: de eis uit 8 oktober is vervallen. De
  tabellen `shop_channels`, `partner_accounts`, `feed_exports` en `api_keys`
  blijven staan als voorbereiding voor die API en voor eventuele
  wederverkopers. Correctie welkom als dit anders bedoeld is.

## 2. Wat de masterprompt verandert

Niet alles is nieuw; dit is wat afwijkt van de opdracht van 8 oktober.

| Onderwerp | Toen | Nu |
|---|---|---|
| Externe koppelingen | "geen externe koppelingen in deze fase" | SnelStart, Mollie en Microsoft 365 zijn **wel** in scope |
| Financiële bron | eigen systeem | **SnelStart is het bronsysteem**; definitieve factuurnummering gebeurt daar |
| Achtergrondtaken | pg-boss, geen Redis | opdracht noemt **Redis en BullMQ** (D-03) |
| Infrastructuur | lokaal, compose later | **Docker, Kubernetes, Helm, CI/CD**, DEV en productie gescheiden |
| Leveranciersbestellingen | capability `PLACE_ORDER` voorzien | **expliciet buiten het platform** in deze fase |
| Productimports | directe leveranciers-API's eerst | **handmatig en CSV/XLSX eerst**, API's later |
| Offertes | één aggregaat met orders | **offerteversies met een akkoord op een exacte versie** (D-01) |
| Workflow | tijdlijn als gebeurtenissenlog | **centrale configureerbare workflow-engine** als kernfunctie |
| Uitgaven | skelet voor later | **verplicht voor de eerste livegang** |
| Teamleader | buiten scope | **migratie in scope** |
| Observability | niet genoemd | **OpenTelemetry** |
| Uitgaande leveringen | niet gemodelleerd | `shipments` nodig; `goods_receipts` is inkomend |

## 3. Open besluiten

### D-01 — Offertemodel splitsen — **BESLOTEN 2026-10-28: splitsen**

Vastgelegd in [ADR-0007](architecture/0007-offertemodel-splitsen.md).

Nu zijn offerte en order één aggregaat (`orders.kind`). De opdracht vraagt
offerteversies en bij acceptatie "de exacte offerteversie bewaren". In het
samengevoegde model versioneren we rijen die de order daarna muteert, waardoor
het akkoord niet aan één onveranderlijke versie vastligt — precies wat een
digitaal akkoord moet bewijzen.

Advies: splitsen naar `quotes` / `quote_versions` / `quote_items` /
`quote_approvals`, met de order als gevolg van acceptatie. Zie
[DATABASE.md §3](DATABASE.md). Kosten: één migratie en nieuwe offertedemodata.
Er is nog geen echte data, dus nu is dit bijna gratis; met orders eraan is het
een verbouwing.

### D-02 — NestJS behouden — **BESLOTEN 2026-10-28: behouden**

Vastgelegd in [ADR-0008](architecture/0008-nestjs-als-backendframework.md).

De opdracht noemt TypeScript, Next.js en React, maar geen backendframework.
NestJS staat er nu in en levert modules, dependency injection, guards,
interceptors en OpenAPI-generatie uit één bron — precies wat
"domeinmodules met duidelijke grenzen" en "geen bedrijfslogica in
React-componenten" in de praktijk afdwingt. Omdat het niet genoemd is, wil ik
dit expliciet bevestigd hebben. Alternatief: Next.js route handlers met een
eigen servicelaag; dat werkt, maar modulegrenzen en autorisatie zijn dan
discipline in plaats van structuur.

### D-03 — Achtergrondtaken — **BESLOTEN 2026-10-28: BullMQ op Valkey**

Vastgelegd in [ADR-0009](architecture/0009-achtergrondtaken-bullmq-valkey.md).
Valkey 9.1.3 staat lokaal en draait.

**Licenties en kosten, nagekeken op 2026-10-28:**

- **BullMQ** is MIT-gelicentieerd en volledig kosteloos, zonder beperkingen op
  functies of gebruik. Dat omvat vertraagde taken, retries, prioriteiten,
  concurrency, rate limiting en herhalende taken. **BullMQ Pro** (groups,
  batches, observables) kost 139 dollar per maand of 1.395 dollar per jaar per
  deployment - die functies hebben wij niet nodig.
- **Redis** is sinds versie 8 (mei 2025) drievoudig gelicentieerd, waaronder
  AGPLv3, een door de OSI erkende open-sourcelicentie. Zelf hosten voor intern
  gebruik binnen de eigen organisatie is kosteloos toegestaan.
- **Valkey** is een BSD-3-Clause fork van Redis onder de Linux Foundation,
  drop-in compatibel en zonder enige licentiediscussie.
- Een wachtrij-dashboard hoeft niet uit BullMQ Pro te komen: **bull-board** is
  MIT en kosteloos.

Werkelijke kosten zijn dus uitsluitend hosting. In het eigen Kubernetes-cluster
is dat de resourcevoetafdruk, die voor deze wachtrij klein is. Een beheerde
Redis bij een hostingpartij kost grofweg enkele tot enkele tientallen euro's
per maand. Lokaal is het kosteloos via Homebrew.

**Advies: BullMQ met Valkey.** Valkey omzeilt de licentievraag volledig en is
compatibel. De transactional outbox blijft in PostgreSQL, los van deze keuze.

---

#### Oorspronkelijke afweging

De opdracht noemt Redis en BullMQ; nu staat pg-boss in het ontwerp omdat er
lokaal geen Docker en geen Redis is. Met Kubernetes in beeld is Redis geen
bezwaar meer, en BullMQ geeft betere wachtrij-inzage, planning en
dead-letter-afhandeling — wat deze workflow-engine echt gebruikt.

Advies: BullMQ met Redis. Gevolg: lokaal moet Redis erbij (Homebrew of Docker).
**De transactional outbox blijft in PostgreSQL**, los van deze keuze: een
gebeurtenis moet in dezelfde transactie als de statuswijziging worden
weggeschreven, en dat kan een externe wachtrij per definitie niet.

### D-04 — Definitieve auth-bibliotheek — **BESLOTEN 2026-10-28: better-auth**

Vastgelegd in [ADR-0012](architecture/0012-authenticatie-better-auth.md), met
de afweging tegen Lucia (beëindigd), Auth.js (alleen nog patches) en de
dienst-gebaseerde opties.

#### Oorspronkelijke formulering

ADR-0003 koos het soort oplossing, niet het pakket. Voor implementatie
verifieer ik eerst de actuele NestJS-integratie, MFA-ondersteuning en
onderhoudsstatus, en leg de keuze vast in een nieuwe ADR. Nog geen besluit
gevraagd; wel een waarschuwing dat dit vóór Fase 1 moet.

### D-05 — Hostingpartij en Kubernetes — **grotendeels BEANTWOORD 2026-10-28**

Decorsign, K3s, ArgoCD, één cluster, zelf gedraaide PostgreSQL, GitHub.
Vastgelegd in [ADR-0010](architecture/0010-deployment-decorsign-k3s-argocd.md).

Nog open, en nu bij **Decorsign** in plaats van bij de opdrachtgever: Helm of
Kustomize, mogen wij eigen StatefulSets en volumes aanmaken, een eigen
PostgreSQL per omgeving, back-up en PITR, registry, ingress en TLS, DNS,
monitoring, secretvoorziening en uitgaande mail. De tien vragen staan in
[DEPLOYMENT.md §2](DEPLOYMENT.md).

**Twee risico's die aandacht vragen:** dev en productie delen in het bestaande
project één PostgreSQL-instantie, en er is geen aantoonbare back-up- of
PITR-strategie. Zie ADR-0010 R1 en R2.

### D-06 — Importvolgorde *(advies: bestandsimport eerst)*

Op 8 oktober is gekozen voor directe leveranciers-API's in plaats van een
datadienst. Dat besluit blijft. De opdracht zet nu echter handmatige invoer en
CSV/XLSX-import vooraan, met de API-architectuur als voorbereiding. Dat is
dezelfde route die ik toen als eerste connector adviseerde: bestandsimport
werkt vandaag, zonder credentials, en blijft de oplossing voor Clipper en
Toppoint. Geen nieuw besluit nodig, wel een verschuiving in de planning.

### D-11 — Voorrang tussen prijsregels *(deels beslist in code)*

**Een klantprijsafspraak gaat altijd voor op elke prijsregel.** Dat is geen
aanname meer maar gebouwd gedrag: een afspraak is een toegezegd bedrag, een
regel is een rekenvoorkeur. Zouden afspraken via `priority` meedoen, dan kan
een verkeerd ingestelde algemene regel een commerciele toezegging overrulen en
merkt niemand dat tot de klant de factuur ziet. Een verliesgevende afspraak
wordt wel uitgevoerd, maar de uitkomst draagt `belowCost` zodat het scherm het
kan laten zien.

Wat hieronder staat gaat alleen over de onderlinge ordening van *marge-regels*
en is nog steeds een aanname:


De prijsengine kiest welke regel geldt. **`priority` is de knop**: de laagste
waarde wint, en dat is expliciet instelbaar per regel. Specificiteit is
alleen de tiebreaker als twee regels dezelfde priority hebben, met deze
standaardvolgorde:

`CUSTOMER` > `PRODUCT` > `CHANNEL` > `CATEGORY` > `SUPPLIER` > `GLOBAL`

De aanname die bevestigd moet worden: **een klantafspraak gaat voor op een
algemene productregel**, omdat een klantafspraak een commerciële toezegging
is. Wie dat anders wil, hoeft geen code te wijzigen - dan krijgt de
productregel een lagere priority.

Tweede regel die vastligt: **zonder toepasselijke prijsregel wordt er geen
prijs bepaald.** De engine geeft een fout in plaats van terug te vallen op de
inkoopprijs, want dat zou betekenen dat er zonder marge verkocht wordt zonder
dat iemand het merkt.

### D-07 — Mailbox en Graph-permissies

Welke mailboxen zijn beschikbaar en welke Microsoft Graph-permissies mogen
gebruikt worden? De voorkeur in de opdracht is een centrale zakelijke mailbox
voor ordercommunicatie, plus een aparte mailbox voor inkoopfacturen
(bijvoorbeeld `inkoopfacturen@...`). Dit bepaalt het ontwerp van Fase 7 en de
ontvangst van inkoopfacturen.

### D-08 — SnelStart: wat kan de API werkelijk

Te verifiëren vóór enig ontwerp: welke API's beschikbaar zijn, of
inkoopfacturen via de API geregistreerd kunnen worden, of originele documenten
als bijlage mee kunnen, hoe crediteuren en grootboekrekeningen gemapt worden,
hoe btw-codes verwerkt worden, hoe betaalstatussen teruggelezen worden, en
welke mogelijkheden er zijn voor betaalvoorstellen. Eerst een technische
integratieproef. Ontbreekt een handeling, dan een controleerbare alternatieve
werkwijze zonder dubbele boekingen. Geen aannames over endpoints.

### D-09 — Documentextractie: welke dienst, en waar gaat de data heen

Voor het uitlezen van inkoopfacturen is OCR of document-AI nodig. De poort is
verwisselbaar, maar de keuze heeft een privacykant: facturen bevatten
leveranciers-, bank- en soms persoonsgegevens. Te beslissen: een dienst in de
EU, een zelf-gehoste oplossing, of handmatige invoer met alleen tekstherkenning
als hulp. Mijn advies is dit pas te kiezen bij Fase 8, met een expliciete
afweging van kwaliteit tegen gegevensverwerking — en in de tussentijd het model
zo te bouwen dat ruwe extractie, herkende velden en handmatige correcties
gescheiden blijven, wat nu al in het ontwerp staat.

### D-10 — Btw-afronding bij SnelStart

ADR-0005 legt vast: btw per orderregel op twee decimalen, ordertotaal als som
van de afgeronde regels. Nu SnelStart het bronsysteem wordt, moet dit
aansluiten op hoe SnelStart boekt, anders ontstaan centverschillen bij de
registratie. Dit is onderdeel van de integratieproef uit D-08. De methode
staat als instelling `vat.rounding`, dus een afwijkende eis kost geen
migratie.
