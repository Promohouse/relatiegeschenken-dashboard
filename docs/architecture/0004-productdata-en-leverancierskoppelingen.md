# ADR-0004 - Productdata: directe leverancierskoppelingen, drie lagen

- Datum: 2026-10-08
- Status: geaccepteerd

## Context

Productdata van leveranciers moet geautomatiseerd binnenkomen, zodat de eigen
catalogus klopt en er op termijn een eigen webshop op gebouwd kan worden.
Startleveranciers: midocean, Toppoint, PF Concept, Clipper en Anda.

Onderzocht (zie `docs/leveranciers/koppelingen.md`): vier van de vijf bieden
bruikbare koppelingen, in vier verschillende formaten. Toppoint publiceert
niets openbaar. Promidata levert dezelfde vijf leveranciers plus 150 andere in
één gestandaardiseerd formaat, inclusief decoratie- en prijslogica, voor
197-297 euro per maand.

**Afweging:** Promidata was geadviseerd omdat het de normalisatie van
decoratie- en staffellogica uit handen neemt - het bewerkelijkste deel. De
opdrachtgever kiest bewust voor directe koppelingen: geen maandlasten, geen
afhankelijkheid van een derde partij, en bestaande leveranciersrelaties.
Besluit vastgelegd; het normalisatiewerk komt daarmee bij ons te liggen.

## Besluit

### Drie lagen, nooit twee

```
leverancier  ->  [1] staging          ->  [2] eigen catalogus  ->  [3] kanalen
API/feed/FTP     ruwe snapshots,          gecureerd, eigen         dashboard
                 onaangetast, gehasht     teksten en prijzen       klantportaal
                        |                        ^                 webshop
                        +--- mapping + diff -----+                 partnerfeeds
```

Leveranciersdata komt nooit rechtstreeks in de eigen catalogus. Zonder
stagingslaag overschrijft de import van vanavond de eigen producttekst, marge
en categorie-indeling.

### Connectoren met capabilities

Eén `SupplierConnector`-interface met losse capabilities: `catalog`, `media`,
`priceTiers`, `inventory`, `placeOrder`, `orderStatus`, `shipping`. Elke
leverancier implementeert alleen wat hij ondersteunt. Daaronder
transportadapters: REST/JSON, SOAP, BMEcat/XML, CSV/Excel, SFTP en FTP.

**Capability-routing per leverancier**: per leverancier en capability wordt
vastgelegd welke bron hem levert, met prioriteit en terugvaloptie. Zo kan
voorraad bij een directe API vandaan komen terwijl de catalogus uit een
nachtelijke feed komt.

### Generieke bestandsimport als eerste connector

Een CSV/Excel/XML-importeur werkt vandaag op de prijslijsten die nu al van
leveranciers komen, zonder credentials. Die bewijst de pijplijn end-to-end en
is tevens de permanente oplossing voor Clipper en Toppoint zolang die geen API
hebben.

### Veldeigendom

Ieder productveld krijgt een bron (`LEVERANCIER` of `HANDMATIG`) en een slot.
Zodra iemand de Nederlandse productnaam of -tekst zelf schrijft, overschrijft
geen enkele import die meer. Zonder dit durft niemand na twee maanden nog iets
in de catalogus te wijzigen.

### Pijplijn

`ophalen -> ruwe snapshot + hash -> parsen -> mappen -> valideren (Zod) -> diff
-> wijzigingen klaarzetten -> toepassen -> publiceren`

- Hash-vergelijking: ongewijzigde data wordt niet verwerkt.
- `ImportRun` met fouten per regel: één kapot artikel sloopt de run niet.
- Diff-review-scherm, per wijzigingstype instelbaar automatisch of met
  goedkeuring. Prijsstijgingen wil je zien, nieuwe afbeeldingen niet.
- Dry-run op iedere connector.

### Mapping als eersteklas module

Per leverancier instelbaar: veldmapping, categorie-, kleur-, maat- en
bedrukkingstechniekmapping, eenheden. In deze branche is dat geen luxe:
"navy", "donkerblauw" en "NY" zijn bij drie leveranciers hetzelfde. Zonder
Promidata is dit het grootste risico van het project en dus een volwaardige
module met eigen UI en tests, geen bijzaak.

### Schaal

Vijf leveranciers betekent tienduizenden producten, honderdduizenden varianten
en miljoenen prijsregels (staffels x decoratietechnieken). Daarom:

- Import schrijft via staging en bulk-`COPY`, nooit rij-voor-rij via Prisma.
- Verkoopprijzen worden berekend en gecached, niet gematerialiseerd voor
  miljoenen combinaties.
- Zoeken eerst met PostgreSQL full-text (GIN/trigram). Meilisearch of Typesense
  pas als dat aantoonbaar knelt.

### Uitgaand: kanalen

`ShopChannel` (publieke webshop, klantomgeving, partnerkanaal), elk met een
eigen assortiment, prijsregels en zichtbaarheid. Daarnaast een read-only,
cachebare publieke lees-API, gescheiden van de interne api, plus `FeedExport`
voor uitgaande partnerfeeds. Inkomende partnerorders lopen via dezelfde
connectorstructuur en landen als gewone order in de tijdlijn.

### Credentials

Versleuteld in de database (`SupplierConnection`), nooit in code of in `.env`
per leverancier. Alleen de ontsleutelsleutel staat in de omgeving. Publiek
rondslingerende gedeelde leveranciersinloggegevens worden niet gebruikt; we
vragen eigen toegang aan.

## Gevolgen

- Geen maandlasten en geen afhankelijkheid van een datadienst.
- Vijf connectoren te bouwen en te onderhouden; formaatwijzigingen bij een
  leverancier zijn onderhoud voor ons.
- De decoratie- en staffellogica moeten we zelf normaliseren. Dit is de
  belangrijkste risicopost in de planning.
- Toppoint en Clipper lopen voorlopig via bestandsimport.
- Het besluit is omkeerbaar: Promidata kan later als extra connector naast de
  directe koppelingen, zonder wijziging in de lagen of het datamodel.

## Nog te beslissen

Wat "partnerprogramma's" concreet betekent: wederverkopers/dropship,
affiliate, marktplaatsen of inkoopcollectieven. Bepaalt of de uitgaande kant
feeds, een API of volwaardige accounts nodig heeft.
