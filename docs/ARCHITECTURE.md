# ARCHITECTURE — Relatiegeschenken Hub

## 1. Vorm: modulaire monoliet

Eén applicatie, één database, duidelijk gescheiden domeinmodules. Geen
microservices: bij 2–5 interne gebruikers en 100–500 orders per maand is de
operationele last daarvan niet te rechtvaardigen, en de werkelijke
complexiteit zit in de samenhang tussen orders, drukproeven, inkoop en
financiën — precies wat je in één transactiegrens wilt houden.

```
                    ┌─────────────────────────────────────────┐
  medewerker ──────▶│ apps/web   Next.js   intern dashboard   │
  klant ───────────▶│            (app)/(portal) gescheiden    │
                    └──────────────────┬──────────────────────┘
                                       │ HTTP, sessiecookie
                    ┌──────────────────▼──────────────────────┐
                    │ apps/api   domeinmodules                │
                    │  identity  crm  catalog  quotes  orders │
                    │  workflow  proofs  purchasing  expenses │
                    │  documents  mail  invoicing  payments   │
                    │  imports  reporting  channels           │
                    └───┬───────────┬──────────────┬──────────┘
                        │           │              │
            ┌───────────▼──┐  ┌─────▼──────┐  ┌────▼─────────┐
            │ PostgreSQL   │  │ Redis      │  │ S3-opslag    │
            │ data+outbox  │  │ queue+lock │  │ documenten   │
            └──────────────┘  └─────┬──────┘  └──────────────┘
                                    │
                    ┌───────────────▼──────────────────────────┐
                    │ workers: workflow, imports, mail,        │
                    │ extractie, SnelStart-sync, feeds         │
                    └───────────────┬──────────────────────────┘
                                    │ adapters
             Microsoft Graph ── SnelStart ── Mollie ── leveranciers
```

## 2. Modulegrenzen

Iedere module in `apps/api/src/modules/` is een bounded context en **bezit
zijn eigen tabellen**. Een module leest of schrijft nooit rechtstreeks in de
tabellen van een andere module; dat gaat via de geëxporteerde service.

Dat is geen stijlvoorkeur. Zonder die regel groeit een systeem met twintig
modules binnen een jaar vast, en dan is "een nieuwe module toevoegen zonder
bestaande functionaliteit te beschadigen" niet meer waar.

Ontkoppeling van neveneffecten loopt via **domeingebeurtenissen**: de
order-module weet niets van taken, e-mail of de tijdlijn. Die luisteren.

## 3. Lagen, en waar bedrijfslogica staat

| Laag | Map | Wat er hoort |
|---|---|---|
| Pure domeinlogica | `packages/contracts/src` | geld en btw, calculatie, hashing, statusafleiding. Geen database, geen HTTP. Front- en backend gebruiken dit allebei. |
| Databasehelpers | `packages/db/src` | Prisma-client, nummeruitgifte, capability-routing |
| Domeinservices | `apps/api/src/modules/*/\*.service.ts` | de bedrijfsregels, transactiegrenzen, gebeurtenissen |
| HTTP-laag | `apps/api/src/modules/*/\*.controller.ts` | validatie, autorisatie, vertaling naar services. Geen logica. |
| Workers | `apps/api/src/jobs` | achtergrondtaken, roepen dezelfde services aan |
| Interface | `apps/web/src` | weergave en interactie |

**Geen bedrijfslogica in React-componenten.** Een prijs wordt op één plek
berekend, in `packages/contracts`, en zowel het offertescherm als de PDF als
de webshop-API als de workflow gebruiken diezelfde functie. Een tweede
implementatie in de frontend is hoe je centverschillen tussen scherm en
factuur krijgt.

Dezelfde regel geldt voor statussen: **alleen de workflow-service zet een
status**. Geen controller, geen scherm, geen los endpoint.

## 4. Techniekkeuzes

Vastgelegd, met de reden erbij:

| Onderdeel | Keuze | Toelichting |
|---|---|---|
| Taal | TypeScript | overal, ook in scripts |
| Frontend | Next.js 16, React 19, Tailwind 4 | serverrendering voor lijsten; cliëntcode alleen waar het echt moet |
| UI-componenten | in shadcn/ui-stijl, handgeschreven | dezelfde opzet (`cn()`, varianten via `class-variance-authority`) zonder de CLI en zonder Radix, tot een component het echt nodig heeft |
| Backend | NestJS | modules, dependency injection, guards, interceptors en OpenAPI-generatie uit één bron. **Niet genoemd in de opdracht; zie DECISIONS.md D-02.** |
| Database | PostgreSQL 16, Prisma 7.10.0 | versie vastgezet, zie ADR-0006 |
| Validatie | Zod, in `packages/contracts` | één schema voor front- en backend |
| Achtergrondtaken | Redis + BullMQ | zie DECISIONS.md D-03 (nu pg-boss) |
| Bestandsopslag | S3-compatibel achter `StoragePort` | lokaal een schijf-adapter, productie objectopslag |
| API-contract | OpenAPI, gegenereerd uit de Zod-schema's | één schema voor validatie, types en documentatie; zie ADR-0011 |
| Tests | Vitest (unit en integratie), Playwright (end-to-end) | |
| Observability | OpenTelemetry | traces over HTTP, jobs en externe aanroepen |
| Containers | Docker, Kubernetes, Helm | zie DEPLOYMENT.md |

## 5. Repositorystructuur

```
apps/
  api/src/
    core/          config, prisma, rbac, audit, errors, money, nummering, outbox
    modules/       één map per bounded context
    integrations/  adapters: graph/ snelstart/ mollie/ suppliers/
    jobs/          workers en planning
  web/src/app/
    (app)/         intern dashboard
    (portal)/      klantenportaal, strikt gescheiden routegroep
packages/
  contracts/       Zod-schema's, pure domeinlogica, gegenereerde API-types
  db/              Prisma-schema, migraties, seed, databasehelpers
  ui/              shadcn/ui-componenten, statuslabels, datatable
  config/          tsconfig, eslint, tailwind-preset
docs/              dit document en de andere ontwerpdocumenten
  architecture/    ADR's, genummerd en onveranderlijk
infra/             Helm-charts en Kubernetes-manifesten (nog niet aangemaakt)
scripts/           db-guard, testdatabase, onderhoud
```

Het klantenportaal is een **aparte routegroep in dezelfde applicatie**, niet
een tweede app. Reden: het hergebruikt het hele datamodel en de
domeinservices, en de scheiding die telt is de autorisatie, niet de
deployment. Die scheiding wordt op de backend afgedwongen (zie SECURITY.md).

## 6. Integraties: adapters achter poorten

Iedere externe partij zit achter een interface in `apps/api/src/integrations`,
met een eigen adapter. De domeinmodules kennen alleen de interface.

| Poort | Adapter | Status |
|---|---|---|
| `MailPort` | Microsoft Graph | te bouwen; eerst mailboxen en permissies vaststellen |
| `AccountingPort` | SnelStart | te bouwen; eerst verifiëren wat de API werkelijk kan |
| `PaymentPort` | Mollie | te bouwen |
| `DocumentExtractionPort` | OCR / document-AI | te bouwen, verwisselbaar |
| `StoragePort` | lokale schijf, S3 | schijf-adapter ontworpen |
| `SupplierConnector` | per leverancier, met capabilities | model gereed, adapters niet gebouwd |

Twee regels die hier niet onderhandelbaar zijn:

1. **Externe systemen wijzigen nooit rechtstreeks de interne database.**
   Inkomende data landt in een stagingtabel of een webhook-tabel en wordt
   daarna verwerkt.
2. **Geen verzonnen endpoints of veldnamen.** Eerst de werkelijke
   documentatie lezen of opvragen. Wat onbekend is, wordt als onbekend
   opgeschreven.

## 7. Betrouwbaarheid

De punten die de workflow-engine bruikbaar maken in plaats van gevaarlijk:

- **Transactional outbox** — een gebeurtenis wordt in dezelfde
  databasetransactie weggeschreven als de statuswijziging. Een worker
  publiceert hem daarna. Zo bestaat er geen toestand waarin de status
  gewijzigd is maar de e-mail nooit komt, of omgekeerd.
- **Idempotentie** — iedere externe aanroep en iedere gebeurtenisverwerking
  heeft een idempotency-sleutel. Een dubbele webhook, een herhaalde klik op
  "akkoord" of een herstart van een worker mag nooit een tweede order,
  factuur of betaling opleveren.
- **Optimistic locking** — orders en orderregels krijgen een versieteller.
  Twee medewerkers die gelijktijdig goedkeuren leveren één winnaar en een
  duidelijke melding, geen stille overschrijving.
- **Retries met backoff en een dead-letter-wachtrij** — mislukte taken gaan
  niet verloren en blijven niet eeuwig herhalen.
- **Geen oneindige statuslussen** — een overgang die zichzelf opnieuw
  triggert wordt door de engine geweigerd en gelogd.

## 8. Wat bewust niet gebeurt

- Geen aparte services per module; de modulegrens is logisch, niet fysiek.
- Geen eigen zoekmachine zolang PostgreSQL full-text het aankan.
- Geen eigen betaalverwerking of bankkoppeling.
- Geen automatische leveranciersbestellingen in deze fase.
- Geen tweede implementatie van prijs- of statuslogica, waar dan ook.
