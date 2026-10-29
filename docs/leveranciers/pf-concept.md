# PF Concept - datafeeds en Gateway

Bronnen, alle drie ontvangen van de opdrachtgever op 29-10-2026:

- *Data feeds manual*, versie 3.6.7, mei 2026
- *Gateway Web Service - Gateway order and other web services*, versie 2.2.2,
  augustus 2026
- *Request form data feeds* + *Conditions of use for the data feeds*
  (te ondertekenen, PF Concept International Coöperatief U.A.)

Dit document bevat **alleen wat in die stukken staat**, plus expliciet
gemarkeerde punten die nog bij PF Concept nagevraagd moeten worden. Niets is
geverifieerd tegen een echte respons: de feeds zijn nog niet aangevraagd.

## Het korte antwoord

De datafeeds zijn de gegevensbron. De Gateway is een **order**-webservice en
bevat geen catalogus, prijzen of drukprijzen - alleen `GET Inventory` is een
leesdienst. Bestellen gaat buiten het platform om (harde regel 13), dus de
Gateway blijft buiten beeld. Zie [ADR-0019](../architecture/0019-pf-concept-via-de-datafeeds.md).

## Toegang

| | |
|---|---|
| Basis-URL | `http://www.pfconcept.com/portal/datafeed/` |
| Attribute feed | `https://www.pfconcept.com/portal/datafeed/attributefeed/` |
| Formaat | **XML of JSON** - JSON is sinds mei 2020 de standaard; keuze opgeven bij aanvraag |
| Authenticatie | geen; de feeds met prijzen hebben een **unieke code in de bestandsnaam** |
| Aanvragen | ondertekend aanvraagformulier bij de klantenservice |

Drie feeds vragen activering per account en krijgen die unieke code: **price
feed, print price feed en stock feed**. Product feed, print data feed en
attribute feed zijn openbaar per taal en vragen geen activering.

De stock feed vraagt daarbovenop goedkeuring van de PF Concept country
manager, met op het formulier de kanttekening: *"Make sure you check if
activation of a stock feed is really necessary."*

### De gebruiksvoorwaarden zijn hier geen formaliteit

Het aanvraagformulier is een overeenkomst. Vier artikelen raken het ontwerp
rechtstreeks:

| Artikel | Wat het zegt | Wat dat voor ons betekent |
|---|---|---|
| 4 | altijd de meest recente informatie uit de feeds gebruiken bij het aanbieden van producten via internet | de import moet werkelijk draaien; een stilgevallen job is een contractbreuk, geen ongemak |
| 5 | de feeds niet onevenredig vaak opvragen | ophalen op hun updatemoment, niet pollen |
| 11 | **de URL van de feeds én de prijs- en voorraadgegevens erin zijn vertrouwelijk** | de URL hoort versleuteld in `supplier_connections.credentials`, niet in een config-bestand en niet in de repository |
| 13 | passende technische en organisatorische beveiligingsmaatregelen nemen | hetzelfde |

En twee die de planning raken: artikel 9 (PF mag URL, structuur en inhoud
naar eigen inzicht wijzigen, met twee weken aankondiging) en artikel 20 (PF
mag stoppen met de feeds, ook met twee weken aankondiging, zonder opgaaf van
reden en zonder vergoeding). Een koppeling die hierop steunt moet dus kunnen
omvallen zonder dat de catalogus verdwijnt - wat precies is waarom externe
data in staging landt en niet rechtstreeks in `products` (ADR-0004).

## De feeds

| Feed | Inhoud | Frequentie | Moment | Activering |
|---|---|---|---|---|
| Product v3 | product + standaard drukinformatie | 1× per dag | 05:00 | nee |
| Stock v3 | voorraad | 2× per dag | 02:00 en 13:00 | ja, + country manager |
| Price v3 | inkoopprijs + welke drukcodes gelden | 1× per week | za 14:00 | ja |
| USB price v3 | prijzen van USB-artikelen | 1× per dag | 02:00 | ja |
| Print data v3 | alle bedrukmogelijkheden | 1× per dag | 06:00 | nee |
| Print price v3 | prijzen van alle drukopties | 1× per week | za 14:00 | ja |
| Attributes v3 | omschrijving van productkenmerken | 1× per week | za 14:00 | nee |
| Afbeeldingen | live links, of zips per set | live / 1× per week | ma 05:00 | nee |

Nederlandse bestandsnamen: `productfeed_nl_v3`, `printdata_cnl1_nl_v3`,
`attributefeed_nl_v3`, en voor de geactiveerde feeds
`pricefeed_<code>_v3`, `printpricefeed_<code>_v3`, `stockfeed_<code>_v3`.

### Eén leverancier, meerdere assortimenten

Dit is de grootste praktische complicatie. PF Concept splitst in:

- **stock assortment** (Avenue, Bullet, PFM) - het gewone assortiment
- **WorldSource (WS)** - andere voorwaarden, eigen bestanden per land
- **USB** - eigen prijsfeed, dagelijks in plaats van wekelijks
- **Label** - eigen print data feed

De print data feed bestaat daardoor in **drie varianten per taal**:
Avenue/Bullet/PFM, Label en Worldsource. De prijsfeeds bestaan per land.

Eén leverancier wordt hier dus een handvol feeds. Ons model kan dat aan - een
leverancier mag meerdere verbindingen hebben - maar de import moet weten welk
artikel uit welk assortiment komt, want de voorwaarden en de prijsstructuur
verschillen. Het veld `markSegment` in de product feed lijkt dat te zeggen.
**Open vraag:** welke waarden heeft `markSegment`, en is dat het veld dat het
assortiment bepaalt?

## Product feed - en waarom die goed aansluit

De opbouw is `models > model (modelCode) > items > item (itemCode)`. Dat is
**precies onze opzet**: model is ons product, item is onze variant. Anders dan
bij ANDA, waar elke kleur een eigen artikelnummer is en we het verband uit de
nummering moeten afleiden.

Per item onder meer: `size`, `sizeGrid`, `gender`, `measurements` (gewicht,
afmetingen, giftbox), `qtyPerCarton`, `colors` (met `colorCode`, `hexColor`,
`pmsColorReference`), `material`, `battery`, `eanCode`, `launchDate`,
`imageData` (hoofdbeeld, logobeelden, verpakking, detail, sfeer, model, video),
`categoryData`, `catalogues`, `themes`, `relatedItems`, `greenPoints` met
`co2footprint`.

Drie velden die er in het bijzonder toe doen:

| Veld | Waarom |
|---|---|
| `isDiscontinued` | *"If true the item is discontinued and will be removed from feeds as soon as it's out of stock"* - PF **zégt** het dus, in tegenstelling tot ANDA waar een artikel gewoon verdwijnt. Dat is precies het signaal dat harde regel 12 vraagt: markeren ter beoordeling. |
| `decorationMandatory` | *"If YES, the item can be bought only decorated."* Een calculatie zonder bedrukking hoort daar te waarschuwen. |
| `decorationSettings > decoDefault` | de standaard drukmethode met positie, maximale afmetingen, aantal kleuren en de doorlooptijd - genoeg om een eerste calculatie te doen zonder de print data feed |

Let op: `maxColoursDefault` is *"number (integer) / text (string)\*"*, met de
voetnoot *"Text (string) when full color is applicable, all others number"*.
Dezelfde valkuil als bij ANDA: onze `maxColors` is een `Int`.

## Price feed - vier staffels, en een drukcodelijst

Per item: `currency`, `clearance`, `decoCharge`, `minDecoQty`, `scales` en
optioneel `customerSpecificPrice` en `promotion`.

| Veld | Betekenis |
|---|---|
| `scale > priceBar` | **beginaantal** van de staffel |
| `scale > nettPrice` | onze netto inkoopprijs |
| `scale > industryCol` | industrieprijs (niet de onze) |
| `decoCharge` | komma-gescheiden lijst drukcodes die voor dit artikel gelden, bijvoorbeeld `DOM001,DST01,GPE05,PAD05,LAS04` |
| `minDecoQty` | minimum bedrukkingsaantal |

Er zijn er altijd vier. *"If for example the priceBar in the second scale is
'100' and the priceBar in the third scale is '250', the price of the second
scale is applicable for quantities from 100 to 249."* Dat is precies onze
`minQuantity`-staffel - geen gesloten bereik zoals bij ANDA, dus het omzetten
is één op één.

Voor voorraadartikelen begint de eerste staffel bij 1. Voor PFM en WS geldt
een harde MOQ en begint de eerste staffel daar.

**`minDecoQty` hoort bij `LTMCharge` uit de prijsfeed voor drukwerk:** bestel
je bedrukt onder dat aantal, dan rekent PF een toeslag. Onze calculatie kent
dat begrip nog niet. Zonder die toeslag is een kleine bedrukte oplage te
goedkoop berekend.

`promotion` en `customerSpecificPrice` hebben een eigen begin- en einddatum en
eigen staffels met `standardPrice`. Dat sluit aan op de geldigheidsvensters
die onze prijsregels en klantafspraken al kennen.

## Print price feed - een tabel, geen formule

Dit is het grote verschil met midocean en ANDA. De opbouw:

```
decoCharges (currency)
 └ decoCharge
    ├ printCode           bijvoorbeeld DEB02
    ├ impMethod           Blinddruk
    ├ LTMCharge           toeslag onder het minimum bedrukkingsaantal
    ├ priceDependence     None | ...
    └ logoSizes
       └ logoSize (logoSizeCm2, itemCodeId)
          └ amountColors
             └ amountColor (amountColorsId)
                └ amountSetupCharges
                   └ amountSetupCharge (SetupCharge)
                      └ decoPrices
                         └ decoPrice (decoPriceFromQty) = prijs per stuk
```

Drie dimensies - logoformaat, aantal kleuren, aantal stuks - maar allemaal als
**opzoekbare waarden**, niet als berekening. De kwantiteitsas is
`decoPriceFromQty`, een ondergrens, net als onze `minQuantity`. En
`logoSizeCm2` is `0` wanneer het formaat niet uitmaakt.

Dat betekent dat PF Concept, anders dan de andere twee, grotendeels **wél** in
onze bestaande `print_price_tiers` past. Alleen de formaatdimensie ontbreekt
daar nog.

De drukcode draagt de snelheid: *"'MR' is the code for screenprint, and '02'
is the speed of how fast we can print an item. The lower the number the
cheaper it is to print."* De code uit de price feed (`decoCharge`) en uit de
print data feed (`printCode`) verwijzen naar dezelfde codes in deze feed.

**Open vraag:** `priceDependence` wordt omschreven als *"Price dependence of
the deco charge"* en de tekst zegt dat de prijs afhangt van het aantal
kleuren, het formaat of geen van beide. Het voorbeeld toont alleen `None`.
**Welke waarden kan dit veld hebben?** Zonder die lijst is niet te bepalen
wanneer welke dimensie gelezen moet worden, en dat is precies het soort gat
waar bij midocean verkeerde prijzen uit kwamen.

## Print data feed - genormaliseerd, met verwijzingen

Per item staan er alleen **verwijzingen**: `printfeedref ref="1"` met een
`imagePrintLine` en een `svgFile`. De eigenschappen zelf staan één keer in
`printFeedRows > printFeedRow ref="1"`.

Per rij onder meer: `impMethodCode`, `impMethod`, `printCode`,
`impLocationCode`, `impLocation`, `maxColours`, `impWidthMm`, `impHeightMm`,
`impDiameterMm`, `maxAreaCm2`, `maxLogoSizeCm2`, `allLogoSizeCm2`,
`allowedArtFile`, `minFontSize`, `minLineWeight`, `laserColor`,
`allowedColorType` (PMS/CMYK), `leadTime` met `leadTimeQty`, `leadTimeFactor`
en een `leadTimeRows`-tabel, acht coördinaten van het drukvlak,
`productionLocation` (PL of UK), en `sureship`-velden die als "N/A, for future
use" staan.

De importer moet die verwijzingen dus oplossen. Dat maakt het bestand klein,
maar een rij die ontbreekt levert een stille lege bedrukoptie op als er niet
op gecontroleerd wordt.

## Afbeeldingen

Twee wegen: zip-bestanden per set (500×500 of 1600×1600, per assortiment), of
live links waar de bestandsnaam uit de product feed achter geplakt wordt:

- `http://images.pfconcept.com/ProductImages_All/JPG/500x500/` (ook 1600 en 3000)
- `http://images.pfconcept.com/ImprintImages_All/JPG/500x500/`
- `http://imagedata.pfconcept.com/2d/models/` voor de SVG-drukvlakken

Live links zijn voor ons de aangewezen weg zodra er een opslagadapter is: geen
wekelijkse zip van gigabytes, en het beeld is altijd dat van het artikel.

## Gateway Web Service

| | |
|---|---|
| Live | `https://wsa.pfconcept.com/RestGateway/rest/RestGatewayService/` |
| Test | `https://wsa.pfconcept.com/test/RestGateway/rest/RestGatewayService/` |
| Formaat | uitsluitend JSON |
| Authenticatie | basic authentication, aparte credentials voor test en productie |
| Swagger | `https://wsa.pfconcept.com/test/RestGateway/` |
| Contact | e-commerce@pfconcept.com |

**Wij bestellen hier niet mee** (harde regel 13). `POST Order` wordt niet
gebouwd; de capability wordt vastgelegd en staat uit.

Wat er verder in zit en wat op termijn bruikbaar is:

- **`GET Inventory`** - voorraad op aanvraag, gefilterd op business unit,
  artikelnummer, SKU, datum en voorraadsoort. Geeft *available to sell*,
  locatie, volgende hoeveelheid en datum terug. Dat is rijker en verser dan de
  stock feed, maar hoort bij de Gateway en dus bij het orderproces.
- **Order status** - PF pusht statussen naar ons (Stalled, Processing, Partial
  shipped, Shipped, Completed, Cancelled), meermaals per dag tussen 08:15 en
  16:15.
- **ASN** - track & trace met vervoerder, PO-nummer en afleveradres.
- **Artwork** - `PROOF` (e-proof met de logopositie) en `RAW`, via URL of
  HTTP-upload. Raakt onze drukproefmodule rechtstreeks, maar is onderdeel van
  het bestelproces.

Die push-berichten vragen dat *wij* een endpoint aanbieden dat PF kan
aanroepen. Dat is een andere architectuur dan ophalen, en pas aan de orde als
er ooit via de Gateway besteld wordt.

## Nog op te vragen bij PF Concept

1. Welke waarden kan `priceDependence` hebben in de print price feed?
2. Welke waarden heeft `markSegment`, en is dat het veld dat het assortiment
   (stock / WS / USB / Label) bepaalt?
3. Is er een XSD of JSON-schema voor de v3-feeds?
4. Is er een delta-feed, of moet elke keer het volledige bestand opgehaald
   worden? (De omvang staat nergens in de handleiding genoemd.)
5. Hebben wij de stock feed nodig, of volstaat de voorraad die in de product
   feed meekomt? PF zet er zelf een vraagteken bij.
6. Wat is de gemiddelde en maximale bestandsgrootte per feed?
7. Geldt er een rate limit, en wat is "onevenredig vaak" uit artikel 5 in
   concrete termen?
