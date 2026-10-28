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

### D-01 — Offertemodel splitsen *(advies: ja)*

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

### D-02 — NestJS behouden *(advies: ja)*

De opdracht noemt TypeScript, Next.js en React, maar geen backendframework.
NestJS staat er nu in en levert modules, dependency injection, guards,
interceptors en OpenAPI-generatie uit één bron — precies wat
"domeinmodules met duidelijke grenzen" en "geen bedrijfslogica in
React-componenten" in de praktijk afdwingt. Omdat het niet genoemd is, wil ik
dit expliciet bevestigd hebben. Alternatief: Next.js route handlers met een
eigen servicelaag; dat werkt, maar modulegrenzen en autorisatie zijn dan
discipline in plaats van structuur.

### D-03 — Achtergrondtaken: Redis en BullMQ, of pg-boss *(advies: BullMQ)*

De opdracht noemt Redis en BullMQ; nu staat pg-boss in het ontwerp omdat er
lokaal geen Docker en geen Redis is. Met Kubernetes in beeld is Redis geen
bezwaar meer, en BullMQ geeft betere wachtrij-inzage, planning en
dead-letter-afhandeling — wat deze workflow-engine echt gebruikt.

Advies: BullMQ met Redis. Gevolg: lokaal moet Redis erbij (Homebrew of Docker).
**De transactional outbox blijft in PostgreSQL**, los van deze keuze: een
gebeurtenis moet in dezelfde transactie als de statuswijziging worden
weggeschreven, en dat kan een externe wachtrij per definitie niet.

### D-04 — Definitieve auth-bibliotheek

ADR-0003 koos het soort oplossing, niet het pakket. Voor implementatie
verifieer ik eerst de actuele NestJS-integratie, MFA-ondersteuning en
onderhoudsstatus, en leg de keuze vast in een nieuwe ADR. Nog geen besluit
gevraagd; wel een waarschuwing dat dit vóór Fase 1 moet.

### D-05 — Hostingpartij en Kubernetes *(blokkeert infrastructuur)*

Twaalf vragen staan in [DEPLOYMENT.md §2](DEPLOYMENT.md). Zonder antwoorden
kan ik geen providerafhankelijke infrastructuur ontwerpen zonder te gokken.
De belangrijkste: welke host, beheerde Kubernetes of zelf, twee clusters of
één, beheerde PostgreSQL en Redis, S3-opslag, registry, en of GitHub gebruikt
wordt.

### D-06 — Importvolgorde *(advies: bestandsimport eerst)*

Op 8 oktober is gekozen voor directe leveranciers-API's in plaats van een
datadienst. Dat besluit blijft. De opdracht zet nu echter handmatige invoer en
CSV/XLSX-import vooraan, met de API-architectuur als voorbereiding. Dat is
dezelfde route die ik toen als eerste connector adviseerde: bestandsimport
werkt vandaag, zonder credentials, en blijft de oplossing voor Clipper en
Toppoint. Geen nieuw besluit nodig, wel een verschuiving in de planning.

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
