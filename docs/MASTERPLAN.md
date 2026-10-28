# MASTERPLAN — Relatiegeschenken Hub

Eén centraal bedrijfsplatform voor een Nederlands relatiegeschenkenbedrijf,
dat op termijn Teamleader vervangt. 2–5 interne medewerkers, 100–500
verkooporders per maand, meerdere leveranciers en drukproeven per order.

Dit document is de kaart. De uitwerking staat in
[ARCHITECTURE.md](ARCHITECTURE.md), [DATABASE.md](DATABASE.md),
[WORKFLOWS.md](WORKFLOWS.md), [SECURITY.md](SECURITY.md),
[DEPLOYMENT.md](DEPLOYMENT.md), [DEVELOPMENT-ROADMAP.md](DEVELOPMENT-ROADMAP.md)
en [DECISIONS.md](DECISIONS.md).

## 1. Wat het systeem doet

De kern is niet een verzameling schermen maar **één automatische
orderworkflow**: na iedere afgeronde stap, bevestiging of goedkeuring zet het
systeem de order zelf door naar de volgende stap. Medewerkers voeren acties
uit; het systeem bewaakt het proces. Alles eromheen — CRM, producten,
calculator, drukproeven, portaal, documenten, e-mail, facturatie, uitgaven,
rapportages — levert aan die workflow of leest eruit.

## 2. Harde grenzen van deze fase

Dit zijn geen details maar scope-bepalende regels uit de opdracht:

| Grens | Betekenis |
|---|---|
| **Leveranciersbestellingen gaan buiten het platform** | De workflow mag een interne bestelactie klaarzetten en laten registreren dat er extern besteld is. Hij plaatst zelf nooit een bestelling bij een leverancier. |
| **SnelStart is het financiële bronsysteem** | Definitieve factuurnummering gebeurt daar. Wij maken concepten en laten registreren. Nooit een live boeking zonder expliciete toestemming. |
| **Het platform doet zelf geen bankbetalingen** | Mollie verwerkt betalingen; betaalopdrachten richting bank zijn buiten scope. |
| **Klantgoedkeuring wordt nooit gesimuleerd** | Geen enkele automatisering mag een akkoord van een klant namaken of overslaan. |
| **DEV raakt nooit echte klanten** | Geen echte mail, geen echte betaling, geen definitieve factuur uit DEV. |
| **Importbestanden verwijderen geen producten** | Een product dat ontbreekt in een importbestand wordt gemarkeerd, niet weggegooid. |
| **Bedrijfskleding valt buiten scope** | Bevestigd 2026-10-28. Geen maattabellen, geen bestellen per maat, geen naamborduring per persoon. Raakt dit later wel aan de orde, dan is dat een eigen traject met gevolgen voor het product- en orderregelmodel. |
| **Productie wijzigt alleen na expliciete toestemming** | Releases zijn handmatig goedgekeurd. |

## 3. Modules

Gegroepeerd naar de volgorde waarin ze elkaar nodig hebben.

**Fundament** — gebruikers, rollen, rechten, auditlog, nummerreeksen,
instellingen, documentopslag, achtergrondtaken.

**Stamgegevens** — CRM (bedrijven, contactpersonen, adressen, afspraken,
betalingsvoorwaarden, klantprijzen), leveranciers, productdatabase met
varianten, staffels, bedrukopties en imports.

**Commercie** — offertecalculator, offerteversies, PDF-offertes, digitaal
akkoord, orders, orderregels, herhaalorders.

**Proces** — de centrale workflow-engine, taken, automatiseringsregels,
drukproeven met versies en goedkeuring, leveringen en deelzendingen.

**Communicatie** — Microsoft 365 via Graph, e-mailsjablonen, threads aan
orders koppelen, herinneringen.

**Financieel** — verkoopfacturatie richting SnelStart, Mollie-betalingen,
uitgaven en crediteuren (inkoopfacturen met uitlezen, koppelen, goedkeuren,
synchroniseren), werkelijke marges, financiële rapportages.

**Buitenkant** — klantenportaal, en later een versiebeheerde webshop-API.

## 4. Wat er al staat (stand 2026-10-28)

Vier commits, 58 tabellen, 76 tests groen, typecheck schoon.

| Onderdeel | Status |
|---|---|
| Repository, monorepo, conventies | gereed |
| Eigen databaserol en databases, veiligheidsslot | gereed |
| Rollen en rechten als `module:actie` in de database | model gereed, guard nog niet |
| CRM-datamodel | gereed |
| Leveranciers, catalogus, varianten, staffels, bedrukopties | gereed |
| Orders en orderregels, statussen per regel | gereed, maar zie het offertebesluit in DECISIONS.md |
| Ordertijdlijn (append-only) | gereed als gebeurtenissenlog, nog geen workflow-engine |
| Documenten met versiebeheer | model gereed |
| Taken | model gereed |
| Auditlog, nummerreeksen, btw-tarieven, instellingen | gereed |
| Staging en connectoren voor leveranciersdata | model gereed, connectoren niet gebouwd |
| Drukproeven, inkoop met deelontvangsten | model gereed |
| Offertes met onveranderlijke versies en digitaal akkoord | datamodel gereed, triggers actief |
| Uitgaande zendingen met deelleveringen | datamodel en afleidlogica gereed |
| Herkomst en idempotente synchronisatie (`external_references`) | gereed |
| Bedrukposities genormaliseerd | gereed |
| Inkoopfacturen | alleen een skelet; de nieuwe eisen vragen veel meer |
| Kanalen, prijsregels, partnerfeeds, API-sleutels | model gereed |
| Geld- en btw-logica, hashing, inkoopberekeningen | gereed en getest |

**Niet gebouwd:** API, interface, authenticatie, workflow-engine,
prijsengine-resolutie, connector-implementaties, e-mail, facturatie,
betalingen, portaal, rapportages, infrastructuur.

## 5. Fasen

De opdracht nummert Fase 0–10. Zo verhoudt zich dat tot wat er al is:

| Fase | Inhoud | Stand |
|---|---|---|
| **0** Architectuur en infrastructuur | repo, documenten, Docker, Kubernetes, Helm, CI/CD, PostgreSQL, Redis, objectopslag, secrets, monitoring, authenticatiebasis | repo en documenten gereed; infrastructuur wacht op hostinggegevens; auth nog niet |
| **1** CRM en gebruikers | klanten, contactpersonen, adressen, rollen, rechten | datamodel gereed; API en UI nog niet |
| **2** Productbeheer | producten, varianten, leveranciers, staffels, imports | datamodel gereed; imports nog niet |
| **3** Offertes | calculator, offerteversies, PDF, digitaal akkoord | regelberekening gereed; de rest nog niet |
| **4** Workflow-engine | statusmodellen, overgangen, voorwaarden, events, taken, parallelle orderregels, foutafhandeling | ontworpen in WORKFLOWS.md, niet gebouwd |
| **5** Ordermanagement | orderkaart, regels, tijdlijn, documenten, statusweergave | datamodel gereed; UI nog niet |
| **6** Drukproeven en klantenportaal | PDF-drukproeven, versies, goedkeuring, klantrollen | datamodel gereed; de rest nog niet |
| **7** Communicatie | Microsoft 365, in- en uitgaande e-mail, sjablonen, herinneringen | nog niet; vereist eerst antwoord over mailboxen en Graph-permissies |
| **8** Leveringen en financiën | leveringen, deelzendingen, SnelStart, Mollie, facturatie, **uitgaven en crediteuren** | inkomende ontvangsten gereed; uitgaande leveringen, facturatie en betalingen nog niet |
| **9** Migratie en livegang | Teamleader-import, end-to-end tests, securitycontrole, back-up- en hersteltests, acceptatie, productiedeploy | nog niet |
| **10** Uitbreidingen | webshop-API, leveranciers-API's, geavanceerde rapportages | modellen voorbereid |

De module **Uitgaven en crediteuren** is verplicht voor de eerste
operationele livegang. Die bouwen we nadat orders, leveranciers en documenten
werken, en vóór de definitieve financiële integratietests.

## 6. Definitie van gereed

Een module is pas gereed als de functionaliteit werkt, de interface bruikbaar
is, de database klopt, autorisatie werkt, automatische overgangen werken waar
van toepassing, foutgevallen getest zijn, auditlogging aanwezig is, de
relevante tests slagen, de documentatie bij is, en de module op DEV te testen
is.

Er wordt geen succes gemeld zonder dat de tests daadwerkelijk zijn gedraaid.
Wat niet gedraaid is, wordt als zodanig benoemd.

## 7. Twee soorten akkoord

Niet verwarren, want ze doen iets anders:

- **Klantakkoord in de applicatie** — een offerte- of drukproefgoedkeuring
  door een bevoegde klantgebruiker. Dit laat de zakelijke workflow
  automatisch doorlopen.
- **Akkoord van de opdrachtgever tijdens ontwikkeling** — bepaalt of er naar
  een volgende ontwikkelfase gegaan mag worden, en of infrastructuur
  aangemaakt mag worden.
