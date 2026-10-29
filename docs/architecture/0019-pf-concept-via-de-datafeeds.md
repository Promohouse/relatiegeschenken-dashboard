# ADR-0019 - PF Concept koppelen via de datafeeds, in JSON

- Datum: 2026-10-29
- Status: geaccepteerd
- Gebaseerd op de *Data feeds manual* v3.6.7 (mei 2026), de *Gateway Web
  Service* handleiding v2.2.2 (augustus 2026) en de *Conditions of use for the
  data feeds*, alle ontvangen van de opdrachtgever op 29-10-2026. Feiten in
  [pf-concept.md](../leveranciers/pf-concept.md).
- Volgt het patroon van [ADR-0018](0018-anda-via-de-xml-feeds.md).

## Besluit

**Alle gegevens komen uit de datafeeds, in JSON. De Gateway wordt niet
gebruikt.**

De Gateway is een order-webservice. Hij bevat geen catalogus, geen prijzen en
geen drukprijzen; alleen `GET Inventory` is een leesdienst, en die hoort bij
het orderproces. Bestellen bij een leverancier gebeurt buiten het platform
(harde regel 13), dus `PLACE_ORDER` wordt vastgelegd en staat uit.

**JSON en niet XML.** PF Concept biedt elke feed in beide formaten aan en
noemt JSON sinds mei 2020 de standaard. Voor ons is het ook de betere keuze:
de print price feed is zes niveaus diep en de product feed kent herhaalde
groepen, en dat leest in JSON eenduidiger dan in XML, waar een enkel element
en een lijst van één element niet te onderscheiden zijn zonder schema. Een
schema is er niet - zie de open vragen.

## Capability per feed

| Capability | Feed | Frequentie bij PF | Wij halen |
|---|---|---|---|
| `CATALOG` | product (nl) | 1× per dag, 05:00 | dagelijks |
| `PRICE_TIERS` | price + USB price | wekelijks za 14:00, USB dagelijks | dagelijks |
| `PRINT_DATA` | print data (nl) + print price | dagelijks 06:00 resp. wekelijks | dagelijks |
| `INVENTORY` | stock | 2× per dag, 02:00 en 13:00 | 2× per dag |
| `MEDIA` | live links op images.pfconcept.com | doorlopend | met de catalogus mee |

De attribute feed hoort bij de catalogus: hij vertaalt de attribuutcodes uit
de product feed en wordt met dezelfde import meegenomen.

## Waarom dit de makkelijkste van de drie koppelingen is

Drie dingen die bij midocean en ANDA werk kostten en hier niet spelen:

**1. De opbouw is die van ons eigen model.** `model > item` is ons
`Product > ProductVariant`. Bij ANDA draagt het artikelnummer de variant en
moeten we het verband uit de nummering afleiden; hier staat het er gewoon.

**2. De inkoopstaffel is onze inkoopstaffel.** Vier schalen met `priceBar` als
**beginaantal** - letterlijk onze `minQuantity`. Geen gesloten bereiken zoals
bij ANDA, waar een gat tussen twee bereiken stil opgevuld zou worden.

**3. De drukprijs is een tabel en geen formule.** De feed geeft per drukcode
een opzoekstructuur over logoformaat, aantal kleuren en aantal stuks, met de
kwantiteitsas als ondergrens. Dat past grotendeels in onze bestaande
`print_price_tiers`; alleen de formaatdimensie ontbreekt daar nog. Bij
midocean en ANDA moest de prijs uitgerekend worden (ADR-0016); hier hoeft dat
niet.

## Wat hier juist wél extra werk is

**Eén leverancier, een handvol feeds.** PF Concept splitst in vier
assortimenten (stock/Avenue/Bullet/PFM, WorldSource, USB, Label), met een
eigen print data feed per groep en eigen prijsfeeds per land. De voorwaarden
en de prijsstructuur verschillen per assortiment. De import moet dus weten uit
welk assortiment een artikel komt. Welk veld dat zegt is een open vraag;
`markSegment` is de kandidaat.

**`LTMCharge` en `minDecoQty` zijn een nieuw begrip.** Bestel je bedrukt onder
het minimum bedrukkingsaantal, dan rekent PF een toeslag. Onze calculatie kent
dat niet. Zonder die toeslag is een kleine bedrukte oplage te goedkoop
berekend - hetzelfde soort stille fout als een ontbrekende drukmarge.

**De print data feed werkt met verwijzingen.** Per artikel staan alleen
`ref`-nummers; de eigenschappen staan één keer in `printFeedRows`. De importer
moet die oplossen en moet klagen als een verwijzing nergens heen wijst, want
anders ontstaat een lege bedrukoptie die er wel uitziet als een echte.

## De gebruiksvoorwaarden zijn onderdeel van het ontwerp

Het aanvraagformulier is een te ondertekenen overeenkomst. Vier bepalingen
raken de bouw:

- **Artikel 11: de URL van de feed en de prijs- en voorraadgegevens erin zijn
  vertrouwelijk.** De URL hoort dus versleuteld in
  `supplier_connections.credentials`, net als een API-sleutel, en niet in een
  config-bestand of in de repository.
- **Artikel 4: altijd de meest recente gegevens gebruiken.** Een import die
  stilvalt is hier geen ongemak maar een contractbreuk. De
  importmonitoring hoort dat te melden.
- **Artikel 5: niet onevenredig vaak opvragen.** Ophalen op hun updatemoment,
  niet pollen.
- **Artikel 9 en 20: PF mag structuur en URL wijzigen, en mag stoppen met de
  feeds, beide met twee weken aankondiging.** Dat is precies waarom externe
  data in staging landt en nooit rechtstreeks in `products` (ADR-0004): valt
  de feed weg, dan blijft de catalogus staan.

## Gevolgen

- `isDiscontinued` in de product feed is het signaal dat harde regel 12
  vraagt. PF verwijdert een uitlopend artikel pas als de voorraad op is, en
  zégt het tot die tijd. Beter dan ANDA, waar een artikel stilletjes uit de
  feed verdwijnt.
- `decorationMandatory` betekent dat een artikel alleen bedrukt verkocht mag
  worden. De calculator hoort te waarschuwen bij een calculatie zonder
  bedrukking.
- `maxColoursDefault` en `maxColours` zijn een getal óf tekst wanneer
  fullcolour van toepassing is. Zelfde probleem als bij ANDA: onze `maxColors`
  is een `Int` en nul betekent daar "onbeperkt".
- De prijsfeed loopt wekelijks (zaterdag 14:00). Prijzen zijn dus tot een week
  oud, en dat is hun meest recente - artikel 4 vraagt niet om meer.

## Wat hier bewust niet gebeurt

De Gateway kan ons orderstatussen en verzendberichten **pushen**, en kent een
artwork-upload met een e-proof die onze drukproefmodule rechtstreeks raakt.
Dat is interessant, maar het vraagt dat wij een endpoint aanbieden dat PF kan
aanroepen - een andere architectuur dan ophalen - en het hoort bij het
bestelproces. Genoteerd in [pf-concept.md](../leveranciers/pf-concept.md),
niet gebouwd.
