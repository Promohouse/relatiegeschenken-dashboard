# ADR-0018 - ANDA koppelen via de XML-feeds, niet via de Order API

- Datum: 2026-10-29
- Status: geaccepteerd
- Gebaseerd op de *XML and CSV feed manual* v3.2 (28-04-2026) en de *Order API
  service manual* v2.8 (22-09-2025), ontvangen van de opdrachtgever op
  29-10-2026. Feiten in [anda.md](../leveranciers/anda.md).
- Volgt het patroon van [ADR-0013](0013-midocean-rest-koppeling.md) en
  [ADR-0016](0016-drukprijzen-worden-berekend-niet-opgeslagen.md).

## De vraag

ANDA biedt twee dingen aan die allebei "koppeling" heten: een reeks XML- en
CSV-feeds, en een REST Order API. De opdrachtgever vroeg welke van de twee
beter is.

## Besluit

**Alle gegevens komen uit de XML-feeds. De Order API wordt niet gebruikt.**

Dat is geen compromis tussen twee gelijkwaardige opties: ze bieden
verschillende dingen. De Order API plaatst en volgt orders en bevat geen
catalogus, geen prijzen, geen voorraad en geen drukprijzen. ANDA zegt het in
hun eigen Order API-handleiding op blz. 3:

> To use our ANDA Order API we highly recommend integrating our XML feed
> solution to always have the proper and actual data of: Product information,
> Price information, Inventory information, Printing information and price.

Daar komt bij dat bestellen bij een leverancier sowieso buiten het platform
gebeurt (harde regel 13). De capability `PLACE_ORDER` wordt vastgelegd en
staat uit, zoals bij midocean.

## Capability per feed

Eén verbinding met transport `XML_FEED`, met deze capabilities:

| Capability | Feed | Frequentie |
|---|---|---|
| `CATALOG` | product (nl) | 3× per week; wij halen dagelijks |
| `CATALOG` | category (nl) | 2× per dag |
| `PRICE_TIERS` | price + unique product prices | wekelijks resp. dagelijks |
| `INVENTORY` | inventory | elke 30 minuten beschikbaar; wij halen 2× per dag |
| `PRINT_DATA` | labeling (nl) + printing price | 3× per week resp. dagelijks |
| `MEDIA` | staat in de product feed | met de catalogus mee |

Voorraad halen we 2× per dag op, zoals afgesproken voor midocean, en niet elk
half uur: de opdrachtgever heeft gezegd dat zo actueel niet nodig is, en elke
ophaalactie is 4-5 MB.

De CSV-varianten gebruiken we niet. Ze bevatten minder (geen labeling-detail,
geen geneste structuren), hebben een eigen unieke id en lopen op een andere
frequentie. Twee bronnen voor hetzelfde gegeven is hoe je verschillen krijgt
die niemand kan verklaren.

## Wat deze koppeling anders maakt dan midocean

Vier dingen die werk opleveren en die in het model al passen of aangepast
moeten worden:

**1. Geen sleutel, maar een geheime URL plus IP-whitelisting.** De unieke id
staat ín de URL en geeft toegang tot onze inkoopprijzen. Hij gaat daarom
versleuteld in `supplier_connections.credentials`, net als een API-sleutel.
De IP-eis raakt de hosting: de import moet vanaf een vast uitgaand IP komen.
Dat is een randvoorwaarde bij D-05 en geen detail - zonder vast IP werkt deze
koppeling niet.

**2. Het artikelnummer draagt de variant.** ANDA kent geen variantenblok:
`AP12345-01` is een kleur, `AP12345_L` een maat. `rootItemNumber` groepeert
ze. Onze `Product` hoort dus op `rootItemNumber` te matchen en onze
`ProductVariant` op `itemNumber`. Andersom zou elke kleur een eigen artikel
worden en klopt geen enkele inkoopstaffel meer.

**3. Drukprijs is opnieuw een berekening, niet een tabel.** De labeling feed
noemt techniek `UVA`; de prijsfeed kent alleen `UVA1`, `UVA2`, … `UVA+`, en
welke geldt hangt af van het oppervlak van het gevraagde logo. Hetzelfde voor
DTA-D, TA-D, RUV, OP, TR en VS. Dat is dezelfde situatie als bij midocean en
dus hetzelfde besluit: bewaren als prijsstructuur in
`supplier_print_techniques`, uitrekenen tijdens het calculeren (ADR-0016).
De velden `SizeFrom`/`SizeTo` vullen onze bestaande `areaFrom`/`areaTo`.

**4. Twee gevallen waar de prijs de bedrukking al bevat.** Artikelen in de
unique product prices feed, en technieken met code `FP-xx`. Daar mag géén
drukprijs bovenop. Een import die dat niet weet laat de calculator het
drukwerk dubbel rekenen, en dat merk je pas als een klant de offerte te duur
vindt.

## Gevolgen

- De feeds bevatten **alleen actieve producten**. Een artikel dat verdwijnt is
  niet automatisch vervallen; harde regel 12 geldt onverkort.
- `ProductPrintOption.maxColors` is een `Int`, maar ANDA levert `fullcolor`
  als waarde. Dat vraagt een eigen betekenis in het model; nul betekent nu
  "onbeperkt" en dat zou hier stil nul kleuren rekenen.
- Voorraad komt in vier soorten (centraal, extern, en onderweg naar beide) met
  elk een eigen levertijd. Die optellen tot één getal belooft een levertijd
  die niet klopt.
- De handleiding spreekt zichzelf op drie punten tegen over
  updatefrequenties. Die staan als open vraag in
  [anda.md](../leveranciers/anda.md) en worden niet geraden.

## Wat hier bewust niet gebeurt

De Order API biedt ook alleen-lezen diensten: orderstatus, track & trace,
factuurgegevens en drukproefstatus. Die zijn op termijn interessant - de
drukproefstatus raakt onze eigen drukproefmodule - maar vallen buiten deze
fase. Ze staan genoteerd in [anda.md](../leveranciers/anda.md) zodat de
mogelijkheid open blijft.
