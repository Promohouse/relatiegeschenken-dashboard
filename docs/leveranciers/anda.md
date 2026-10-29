# ANDA Present - XML/CSV-feeds en Order API

Bronnen, beide ontvangen van de opdrachtgever op 29-10-2026:

- *ANDA WEB CUSTOMER EN XML and CSV feed manual*, versie 3.2, gedateerd
  28-04-2026
- *ANDA Present Ltd. Order API service manual*, versie 2.8, gedateerd
  22-09-2025, contact Tamás Gaál (gaal.tamas@andapresent.hu)

Dit document bevat **alleen wat in die handleidingen staat**, plus expliciet
gemarkeerde punten die nog bij ANDA nagevraagd moeten worden. Niets is
geverifieerd tegen een echte respons: er zijn nog geen feeds geactiveerd.
Zodra de eerste bestanden binnen zijn hoort dit document bijgewerkt te worden
met wat er werkelijk in staat. Bij midocean weken drie dingen af van hun eigen
handleiding en alle drie zouden ze verkeerde prijzen hebben opgeleverd.

## Toegang tot de feeds

| | |
|---|---|
| Basis-URL | `https://xml.andapresent.com/export/<feed>/[<taalcode>/]<unieke_id>` |
| Authenticatie | **geen header of sleutel** - de unieke id ín de URL, plus IP-whitelisting |
| Activeren | via de vaste ANDA-contactpersoon, met opgave van één of meer **vaste** IP-adressen |
| Talen | 19, waaronder `nl`; alleen voor product, category, labeling en printing time |
| CSV | alleen voor product, price, labeling, printing time en pantone - **met een ándere unieke id en URL dan de XML** |

Drie dingen die het bouwen raken:

1. **De unieke id in de URL ís de sleutel.** Wie hem heeft en vanaf een
   toegelaten IP-adres komt, krijgt onze inkoopprijzen te zien. Hij hoort
   daarom in `supplier_connections.credentials`, versleuteld, net als een
   API-sleutel - niet in een config-bestand en niet in de repository.
2. **IP-whitelisting betekent dat de import vanaf een vast adres moet komen.**
   Dat raakt de hosting: een willekeurig uitgaand IP van een
   Kubernetes-cluster werkt niet. Zie de openstaande vraag bij D-05.
3. **De feed bevat alleen actieve producten.** Vraag 12 in hun QandA:
   *"Only active products appear in the xml feed."* Een artikel dat uit de
   feed verdwijnt is dus niet per se vervallen. Harde regel 12 geldt hier
   onverkort: markeren ter beoordeling, nooit verwijderen.

### Foutsituaties

De handleiding noemt er twee, allebei zonder HTTP-code:

| Melding | Betekenis |
|---|---|
| Access denied | het IP-adres staat niet op de lijst |
| Not found | het bestand is nog niet gegenereerd; na activering kan dat tot 24 uur duren |

Onze foutafhandeling hoort dat verschil te noemen. "Access denied" is een
hostingprobleem, "Not found" is geduld - wie die twee door elkaar haalt zoekt
in de verkeerde hoek.

## De feeds

| Feed | Pad | Omvang | Frequentie volgens de tabel (blz. 4) |
|---|---|---|---|
| Product | `/products/{taal}/{id}` | 30-40 MB | 3× per week, oneven dagen 09:00 |
| Product CSV | `/products-csv/{taal}/{id}` | 30-40 MB | idem |
| Category | `/categories/{taal}/{id}` | 20-30 kB | 2× per dag |
| Inventory | `/inventories/{id}` | 4-5 MB | **elke 30 minuten** (X:00, X:30) |
| Price | `/prices/{id}` | 3-5 MB | 1× per week, zaterdag 22:00 |
| Price CSV | `/prices-csv/{id}` | 3-5 MB | idem |
| Labeling | `/labeling/{taal}/{id}` | 20-25 MB | 3× per week, even dagen 04:00 |
| Labeling CSV | `/labeling-csv/{taal}/{id}` | 3-5 MB | 1× per week, zaterdag 07:00 |
| Printing price | `/printingprices/{id}` | 200-300 kB | 1× per week, zaterdag 09:00 |
| Unique product prices | `/uniqueproductprices/{id}` | 100 kB | 1× per week, zaterdag 09:00 |
| Printing time info CSV | `/printing_time_info/{taal}/{id}` | 5-10 kB | elke 10 minuten |
| Pantone CSV | `/csv_pantone/{id}` | 35 kB | dagelijks 01:00 |

### Drie tegenstrijdigheden in de handleiding zelf

De overzichtstabel op blz. 4 en de hoofdstukken erna spreken elkaar tegen.
**Niet zelf invullen; navragen bij ANDA.** Tot die tijd aanhouden wat het
vaakst ophaalt, want te vaak ophalen kost alleen bandbreedte en te weinig
levert verkeerde prijzen op.

| Feed | Tabel blz. 4 | Hoofdstuk |
|---|---|---|
| Category | 2× per dag, 7:30 en 21:30 | 2× per dag, 7:10 en 21:10 (blz. 23) |
| Printing price | 1× per week, za 09:00 | *"when our printing price list is updated, every day 6:00 PM"* (blz. 27) |
| Unique product prices | 1× per week, za 09:00 | 1× per dag, 18:00 (blz. 22) |

## Product feed

Velden: `itemNumber`, `designName`, `primaryColor` + `primarycolorCode`,
`secondaryColor` + `secondarycolorCode`, `name`, `description`,
`primaryImage`, `images`, `images_modified_date`, `temporarilyUnavailable`,
`customProduction`, `minimumOrderQuantity`, `individualProductWeightGram`,
`countryOfOrigin`, `tariffNumber`, `brandName`, `eanCode`, `rootItemNumber`,
`multiple`, `lastModifiedDate`, `geographicalRestriction`, `assemblyProduct`,
plus blokken `productTheme`, `collections`, `packageDatas`, `specification`,
`categories`, `allCategories`, `relatedProducts`, `productCertificate`,
`testReports`.

### Het artikelnummer draagt de variant

Dit is de belangrijkste afwijking van hoe onze catalogus is opgezet. ANDA
heeft geen variantenblok: elke kleur en maat is een **eigen itemNumber**.

| Vorm | Betekenis |
|---|---|
| `AP12345-01` | `-01` is de kleurcode (codelijst in de appendix, blz. 41-43) |
| `AP12345-01-02` | twee kleuren |
| `AP12345-01T` | transparant |
| `AP12345_L`, `AP12345_16GB` | `_X` is de maatcode |
| `AP12345-01_L` | kleur eerst, dan maat |
| `AP12345-A` | vorm (bijvoorbeeld een dierfiguur), waarden A, B, C, D, … |

`rootItemNumber` groepeert ze. **Dat veld is dus de sleutel voor ons product
en `itemNumber` die voor onze variant** - andersom om zou elke kleur een eigen
artikel worden, en dan klopt geen enkele staffel meer.

Let op bij samengestelde producten: `assemblyProduct` = 1 betekent dat het een
onderdeel is van een samengesteld artikel (`AP892006-06_B`: `-06` kleur, `_B`
onderdeelcode). Die moeten niet als los verkoopbaar artikel in de catalogus
belanden. **Open vraag:** hoe herken je het samengestelde artikel zelf, en
hoort dat wel of niet in ons assortiment?

Booleans komen als 0/1 in integerformaat, niet als `true`/`false` - de
handleiding zegt dat expliciet (`(boolean/integer)*`). Onze
`parseSupplierBoolean` kan dat al aan.

## Price feed - welke prijs is onze inkoopprijs

Vier velden: `itemNumber`, `currency`, `amount`, `type`.

| `type` | Betekenis |
|---|---|
| `listPrice` | catalogusprijs |
| `discountPrice` | **distributeurs-inkoopprijs, inclusief onze korting** |

`discountPrice` is dus onze inkoopprijs. De valuta volgt de valuta van ons
webshopaccount.

**Let op:** *"The products with custom prices are not in the feed."* Artikelen
met een eigen prijsafspraak ontbreken hier en staan in de Unique product
prices feed. Een import die alleen de price feed leest mist die artikelen -
en dat valt niet op, want ze staan wél in de product feed.

## Unique product prices feed - prijs inclusief druk

Per `itemNumber` een reeks `range` met `QuantityFrom`, `QuantityTo`,
`UnitPrice` en `SetupCost`.

De handleiding: *"the price info for the products where the price includes the
printing price too"*.

**Dit is een valkuil waar geld in zit.** Voor deze artikelen mag er géén
drukprijs bovenop: die zit er al in. Doe je dat wel, dan rekent de calculator
het drukwerk twee keer en is de offerte te duur. Een artikel dat in deze feed
voorkomt moet in onze catalogus gemarkeerd worden als "prijs is inclusief
bedrukking", en de calculator hoort de drukprijs dan over te slaan en dat te
melden.

Let ook op de vorm: `QuantityFrom`/`QuantityTo` is een **gesloten bereik**, niet
een ondergrens zoals onze `minQuantity`-staffels. Bij het omzetten gaat
`QuantityTo` verloren; dat is goed zolang de bereiken aansluiten, maar een gat
tussen twee bereiken wordt dan stil opgevuld. De import hoort te controleren
dat de bereiken aansluiten en anders te waarschuwen.

## Inventory feed

Velden: `itemNumber`, `type`, `amount`, `moreThanAmount`, `arrivalDate`
(`Y_M_D`). Er zijn **meerdere records per artikel**, één per voorraadsoort.

| `type` | Betekenis |
|---|---|
| `central_stock` | direct leverbaar |
| `incoming_to_central_stock` | binnen 1-2 dagen |
| `external_stock` | binnen 6-8 dagen |
| `incoming_to_external_stock` | onderweg naar het externe magazijn |

`moreThanAmount`: 0 = de binnenkomende voorraad is gelijk aan de waarde,
1 = er is meer dan de waarde.

**Deze vier mogen niet zomaar opgeteld worden.** "Direct leverbaar" is iets
anders dan "over acht dagen leverbaar", en de calculator waarschuwt nu op één
getal. De voorraadweergave moet minstens onderscheid maken tussen centraal en
extern, anders beloven we een levertijd die niet klopt.

## Labeling feed - wat er te bedrukken valt

Per `itemNumber`: `printTemplate` (PDF, kan leeg zijn), `lastModifiedDate` en
`positions`. Per `position`: `serial` (I, II, …), `posName`, `posImage`, en
`technologies`. Per `technology`: `Code`, `Name`, `maxColor`, `maxWmm`,
`maxHmm`, `maxDmm`, `fixedSize`, `printTemplate`.

Twee dingen die botsen met ons model:

1. **`maxColor` is geen getal.** De waarde is `fullcolor` óf 1-10. Onze
   `ProductPrintOption.maxColors` is een `Int`. `fullcolor` moet een eigen
   betekenis krijgen; nul gebruiken als "onbeperkt" is vragen om een
   calculatie die stilletjes nul kleuren rekent.
2. **De maximale drukmaat staat hier, de prijs niet.** Breedte × hoogte, of
   diameter als `maxDmm` gevuld is. Dat maximum is het vertrekpunt voor de
   prijsberekening hieronder.

## Printing price feed - en waarom dit het lastigste deel is

Per `TechnologyCode` een `UnitPriceType` en een reeks `ranges`. Per `range`:
`NumberOfColours`, `QuantityFrom`, `QuantityTo`, `SizeFrom`, `SizeTo`,
`UnitPrice`, `SetupCost`.

| `UnitPriceType` | Betekenis |
|---|---|
| `price / pc` | prijs per stuk bij dit aantal, deze kleuren en eventueel deze maat |
| `price / cm2` | prijs per cm²; vermenigvuldigen met het oppervlak van het logo |

`NumberOfColours` is `fullcolour` of 0-10. Setupkosten worden per logo
gerekend en zijn afhankelijk van het aantal kleuren, **maar niet bij
fullcolour-technieken**.

### De code uit de labeling feed is niet de code uit de prijsfeed

Dit is het punt waar een naïeve koppeling verkeerde prijzen geeft. De labeling
feed zegt dat een artikel techniek `UVA` heeft. De prijsfeed kent `UVA`
helemaal niet - daar staan `UVA1`, `UVA2`, … `UVA+`, en welke geldt hangt af
van **het oppervlak van het gevraagde logo**:

| Code | Oppervlak |
|---|---|
| UVA1 | 0,01 - 5 cm² |
| UVA2 | 5,01 - 10 cm² |
| … | telkens de vorige bovengrens + 0,01 |
| UVA+ | vanaf 50,01 cm², en dan **alleen nog per cm²** |

Hetzelfde geldt voor DTA-D, TA-D, RUV, OP en TR. De handleiding zegt het zo:
de distributeur mag een kleiner logo vragen dan het maximum, dus de prijs is
pas te bepalen als het logoformaat bekend is.

**Dat is precies de situatie die ADR-0016 voor midocean beschrijft**, en de
conclusie is dezelfde: drukprijzen worden bewaard als prijsstructuur en bij
het calculeren uitgerekend. Onze `print_price_tiers` kunnen dit niet
bevatten. `SizeFrom`/`SizeTo` in de feed zijn de velden die het oppervlakbereik
dragen; ons bestaande `supplier_print_techniques.varCosts` heeft al
`areaFrom`/`areaTo`, dus het model past.

### Technieken per prijssoort

Uit blz. 33-36, letterlijk overgenomen:

| Soort | Technieken |
|---|---|
| Alleen aantal, kleurafhankelijk | Pad (P0-P2), Transfer (T0-T2), Screen (S0-S2), Ceramic (C1-C3), Cylindrical screen (RS) |
| Alleen aantal | Engraving (E0-E3), Rainbow engraving (RE1-RE2), Doming (DO1-DO5), Sublimation (SU1-SU3), Digital (DG1-DG3), Vision film (VF), White (WPC1-3), Embossing (O1), Hat band sewing (HS), Rotary engraving for pens (EP0-2), Paper sleeve (PS1-5), Kraft paper sleeve (PSK1-5), Corrugated cardboard (CB1-5), Kraft (CBK1-5), Paperboard box (PB1-5), Kraft paperboard box (PBK1-5) |
| Aantal én oppervlak | UV-LED (UVA-D 1-5, +), Digital transfer (DTA-T 1-5), Reflective transfer (TR1-5), Vinyl sticker (VS1, VS+) |

### Vier gevallen waar geen bruikbare prijs uitkomt

Deze horen een waarschuwing te geven en nooit een verzonnen prijs:

1. **Embroidery (BR)** - *"An individual calculation is required in each case,
   so there is no price loaded into the system for this."* De prijsfeed is
   voor BR leeg.
2. **Free printing (FP-xx)** - de productprijs bevat de drukkosten al; de
   prijsfeed geeft 0 als stuksprijs en alleen setup wordt gerekend. Zelfde
   dubbeltel-risico als bij de unique product prices.
3. **Vinyl sticker (VS)** - *"a special calculation that use the price of the
   range and the sticker application"*, met daarnaast *"a separate price per
   piece for gluing"*. Die lijmprijs staat niet beschreven. **Open vraag.**
4. **Doming en sublimation** - de prijsgroep hangt af van de stickermaat
   respectievelijk de drukmaat, niet alleen van het aantal. Hoe die groep
   gekozen wordt staat er niet bij. **Open vraag.**

## Order API

| | |
|---|---|
| Productie | `https://orderapi.andapresent.com` |
| Sandbox | `https://sandbox.andapresent.com` (eigen sleutels, eigen schema's op `/docs/` en `/schema`) |
| Inloggen | `POST /v1/hu/account/login`, Basic Auth met gebruikersnaam en wachtwoord |
| Daarna | token in een eigen header `token:`, **niet** in `Authorization` |
| Tokenduur | 1 uur, schuivend: een aanroep in het tweede half uur verlengt met een uur |

**Wij plaatsen hier geen bestellingen mee** (harde regel 13). De capability
`PLACE_ORDER` wordt wel vastgelegd en staat uit, net als bij midocean.

Wat de Order API verder biedt en wat op termijn wél bruikbaar is, omdat het
alleen lezen is:

- orderstatus, ook in bulk (`6.1`, `6.2`)
- track & trace (`7`)
- factuurgegevens (`8`)
- **drukproefstatus ophalen én wijzigen** (`9`) - raakt onze drukproefmodule
  rechtstreeks, maar "wijzigen" is een handeling richting de leverancier en
  valt onder dezelfde terughoudendheid als bestellen

Twee punten om na te vragen:

- Het pad bevat `/v1/hu/`. Dat ziet eruit als een landsegment. **Is er een
  `/nl/`-variant, en verandert dat iets aan de inhoud?**
- De handleiding noemt een `subaccount`-veld en twee werkwijzen
  (full-automatic zonder bevestigingsmails, semi-automatic met goedkeuring in
  de ANDA-webshop). Relevant zodra er ooit besteld wordt, nu niet.

### ANDA beantwoordt onze vraag zelf

Uit de Order API-handleiding, blz. 3:

> To use our ANDA Order API we highly recommend integrating our XML feed
> solution to always have the proper and actual data of: Product information,
> Price information, Inventory information, Printing information and price.

De feeds zijn de gegevensbron, de API is voor transacties. Dat is ook het
besluit dat we nemen; zie ADR-0018.

## Nog op te vragen bij ANDA

1. De drie tegenstrijdige updatefrequenties hierboven.
2. Is er een XSD of ander schema voor de XML-feeds?
3. Is er een delta- of wijzigingsfeed, of moet elke keer het volledige bestand
   (30-40 MB) opgehaald worden?
4. Hoe wordt de lijmprijs bij VS berekend, en hoe de prijsgroep bij DO en SU?
5. Hoe is een samengesteld artikel (`assemblyProduct`) te herkennen als geheel?
6. Geldt voor de feeds een rate limit of een maximum aantal ophaalacties?
7. Is er een testomgeving voor de feeds, of alleen de echte?
