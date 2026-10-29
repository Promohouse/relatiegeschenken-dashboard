# midocean - REST API

Bron: *API implementation guide and integration overview*, versie 1.12.2,
gedateerd 23-10-2024, ontvangen van de opdrachtgever op 28-10-2026.

Dit document bevat **alleen wat in die handleiding staat**, plus expliciet
gemarkeerde punten die nog bij midocean nagevraagd moeten worden. Niets is
geverifieerd tegen een echte respons: er zijn nog geen credentials. Zodra er
een testsleutel is, hoort dit document bijgewerkt te worden met wat de API
werkelijk teruggeeft.

## Toegang

| | |
|---|---|
| Productie | `https://api.midocean.com` |
| Test | `https://apitest.midocean.com` |
| Authenticatie | header `x-Gateway-APIKey: <sleutel>` |
| Sleutel aanvragen | midocean-account → Account → tab *Customer API* → Register |
| Testsleutel | **niet zelf aan te maken**; opvragen bij de vaste midocean-contactpersoon |

Twee aandachtspunten die het bouwen raken:

1. **Een sleutel moet per endpoint geabonneerd worden.** In het portaal vink je
   per API aan of de sleutel hem mag gebruiken. Een foutmelding
   *"Unauthorized Application Request"* betekent dus niet per se een verkeerde
   sleutel; het kan ook een ontbrekend abonnement zijn. Onze foutafhandeling
   moet dat verschil noemen, anders zoekt iemand uren in de verkeerde hoek.
2. **De testomgeving staat 's avonds uit** (buiten Europese kantooruren),
   en geeft dan `503 Service Temporarily Unavailable`. Een nachtelijke import
   tegen test is dus zinloos; dat is geen storing van ons.

### Gemeten tegen de echte API, 28 oktober 2026

De sleutel bleek na activering te werken op **productie**, niet op test. De
eerste echte import leverde dit op:

| | |
|---|---|
| Producten | 2786 artikelen, 21.738 varianten, 36 MB JSON |
| Prijzen | 21.722 regels, 1,9 MB |
| Voorraad | 1,8 MB |
| Drukgegevens | 21 MB |
| Drukprijzen | 93 KB |
| Doorlooptijd catalogusimport | 17 seconden |

Drie dingen die de handleiding niet zegt en die wij gemeten hebben:

**1. Grote bestanden komen via een omleiding.** `stock/2.0` antwoordt met een
`303` en een `preSignedUrl` naar S3; het bestand zelf staat daar. Onze
connector volgt die omleiding vanzelf, dus het werkt, maar wie de ruwe respons
bekijkt moet weten dat het antwoord niet de data is.

**2. Staffels zijn er bijna niet.** Van de 21.722 prijsregels hebben er **52**
een staffel. De handleiding zegt al dat staffels van regio en account
afhangen; voor dit account betekent het dat vrijwel alles één prijs heeft.

**3. Varianten van hetzelfde artikel verschillen vaker in prijs dan gedacht.**
Gemeten: **291 van de 2786 artikelen** (ruim 10%) hebben varianten met
verschillende prijzen. Bij textiel is dat logisch - 3XL kost meer dan M - maar
het komt ook bij kleuren voor: bij A03643 kost naturel 3,21 en de rest 3,93 of
4,23.

Dat is hoger dan de uitzondering die ik verwachtte toen de prijsimport
gebouwd werd. Onze keuze om bij verschil niets te kiezen klopt nog steeds -
niets is beter dan een verzonnen gemiddelde - maar het betekent wel dat ruim
tien procent van de artikelen met de hand moet, tot er inkoopprijs per variant
is. Dat staat nu als afweging in de roadmap in plaats van als terzijde.

### De 401 zegt niet wát er mis is

Gemeten op 2026-10-28 met een sleutel die net van midocean kwam. Drie
verzoeken naar `apitest.midocean.com/gateway/stock/2.0`:

| Verzoek | Antwoord |
|---|---|
| Met de ontvangen sleutel | 401, *Unauthorized application request* |
| Met een verzonnen sleutel | 401, **exact dezelfde tekst** |
| Zonder enige sleutel | 401, **exact dezelfde tekst** |

De melding bevat `User - Default and Application:sys:defaultApplication`, wat
erop wijst dat de gateway de sleutel niet herkent en terugvalt op een
standaardtoepassing. Ook op `api.midocean.com` en op alle vijf de endpoints
hetzelfde beeld.

**Gevolg voor ons:** aan het antwoord is niet te zien of de sleutel verkeerd
is, of alleen nog niet geabonneerd op het endpoint. Onze foutmelding noemt
daarom allebei de oorzaken. Verder is het geen 500: een leverancier die
weigert is geen storing van ons, dus geeft onze api een 502 met de
leveranciersmelding erbij.

**Opgelost op 28 oktober:** de endpoints waren nog niet aangevinkt in het
midocean-account. Na activeren werkte de sleutel meteen - op productie. Voor
`apitest.midocean.com` is nog steeds een aparte sleutel nodig; die is bij de
contactpersoon op te vragen.

## Endpoints die wij gebruiken

Alle GET. Zonder `Accept`-header is het antwoord JSON.

| Doel | Endpoint | Ververst |
|---|---|---|
| Voorraad | `/gateway/stock/2.0` | elk uur bij midocean; wij halen om 06:00 en 18:00 op |
| Productinformatie | `/gateway/products/2.0?language=nl` | dagelijks |
| Drukgegevens | `/gateway/printdata/1.0` | dagelijks |
| Productprijzen (onze inkoop) | `/gateway/pricelist/2.0` | dagelijks |
| Drukprijzen | `/gateway/printpricelist/2.0` | dagelijks |

Talen voor productinformatie: en, es, pt, fr, it, nl, de, hu, ro, cs, sv, fi, da.

**Niet in gebruik, wel gedocumenteerd** (zie ADR-0013): `/gateway/order/2.1/create`,
`/gateway/order/2.1/detail?order_number=`, `/gateway/proof/1.0/approve`,
`/gateway/proof/1.0/reject`, `/gateway/proof/1.0/addartwork`.

## Vijf dingen die bepalen hoe wij dit bouwen

### 1. SFTP is dood

De changelog van v1.11 zegt: *SFTP service is now deprecated and will be
discontinued in 2025*, en alle SFTP-verwijzingen zijn uit de handleiding
gehaald. Ons onderzoeksdocument van 8 oktober noemde SFTP nog als de route
voor midocean; dat klopt niet meer. De koppeling is REST, punt.

### 2. Bedragen komen als tekst met een komma

Voorbeelden uit de handleiding: `"price": "4,22"`, `"setup": "60,00"`,
`"price": "0,08"`. Dat is een string met een decimale komma. `new Decimal("4,22")`
gooit een fout, en `parseFloat` maakt er stilletjes `4` van - dat laatste is
het gevaarlijke geval, want dan klopt een inkoopprijs met tientallen procenten
en valt het pas op in de marge.

Daarom gaat alle leveranciersdata door `parseSupplierDecimal()` in
`@rgh/contracts`, die een lege waarde, een punt en een komma aankan en bij iets
onverwachts een fout gooit in plaats van te gokken.

### 3. Er is geen wijzigingsfeed

> *At this moment it isn't possible to retrieve only a portion of the product
> data. This functionality will also be added during late 2024.*

De handleiding is van oktober 2024, dus mogelijk bestaat dit inmiddels wel.
**Navragen.** Zolang het er niet is, halen we steeds de volledige catalogus op
en bepalen wij zelf wat er veranderd is: elke rij gaat met een SHA-256 over de
gecanoniseerde payload naar `raw_supplier_products`, en alleen een gewijzigde
hash levert een `staged_change` op. Dat is ook de reden dat die hash-kolom er
al in staat (ADR-0004).

### 4. Drukprijzen zijn een berekening, geen opzoeking

De drukprijs volgt uit vier gegevens: de **manipulatiecode** (A-Z, handling per
stuk), de **setup** (eenmalig, of `setup_repeat` bij een herhaalorder), de
**staffelprijs** en het **prijstype** van de techniek. Er zijn vier prijstypes:

| Prijstype | Prijs hangt af van |
|---|---|
| `NumberOfPositions` | aantal posities |
| `NumberOfColours` | aantal kleuren; met `next_colour_cost_indicator = X` heeft kleur 2 en verder de prijs `next_price` |
| `AreaRange` | oppervlakte van het logo in cm², via `area_from`/`area_to` |
| `ColourAreaRange` | oppervlakte én aantal kleuren |

Bijzonderheid: techniek `ST` kost bij gekleurde artikelen één keer
`price_next * aantal` extra, omdat er eerst een witte onderlaag geprint wordt.

Appendix F van de handleiding geeft vier doorgerekende voorbeelden met de
verwachte totalen. Die staan als test in `packages/contracts/test/midocean-print-price.test.ts`,
zodat onze berekening aantoonbaar hetzelfde uitkomt als die van midocean.

**Drie dingen die de echte prijslijst anders doet** (gemeten 29-10-2026):

- `next_colour_cost_indicator` bevat `"true"`/`"false"`, niet `"X"` zoals de
  handleiding zegt;
- staffeldrempels dragen een duizendtalpunt: `"1.000"`, `"2.500"`. Bedragen in
  hetzelfde bestand gebruiken juist een decimale komma;
- er bestaat een vijfde prijstype `Area` (prijs per cm2, techniek DPT) dat niet
  in de handleiding staat. Onze formule daarvoor is afgeleid, niet bevestigd.

**Twee onopgeloste punten in die appendix**, die wij niet kunnen wegpoetsen:

- Rij 1 noemt een setup van `29,25` en rekent `29,25 * 3 = 88,5`. Dat is
  87,75. De uitkomst 88,5 hoort bij een setup van 29,50. Eén van beide is een
  typefout in de handleiding. Onze functie rekent met de formule, dus
  87,75, en de test legt het verschil vast met een verwijzing hiernaartoe.
- Bij `AreaRange` en `NumberOfPositions` wordt in de voorbeelden ook de
  handling met het aantal posities vermenigvuldigd, terwijl de tekst zegt dat
  handling alleen van het product afhangt en niet van de drukconfiguratie. Wij
  volgen het rekenvoorbeeld, want dat is wat midocean factureert, en noteren
  het als na te vragen.

Beide punten horen bevestigd te worden met één echte order voordat wij een
drukprijs aan een klant tonen.

### 4b. Prijzen zijn per variant, onze inkoopprijs per artikel

`pricelist/2.0` geeft een prijs per **sku**, dus per variant. Onze catalogus
houdt één inkoopprijs per **leveranciersartikel** aan, in
`product_suppliers.purchasePrice` met staffels in `purchase_price_tiers`.

Bij promotieartikelen kosten alle kleuren meestal hetzelfde en valt dat niet
op. Niet altijd: een afwijkende kleur of een textielmaat kan duurder zijn.

**Wat wij doen:** niets kiezen. Verschillen de varianten van een artikel in
prijs of staffel, dan komt dat als fout op die regel te staan, met de
bedragen erbij, en wijzigt er niets. Eén prijs verzinnen voor een artikel
waarvan de kleuren verschillend kosten is precies het soort stille aanname
dat pas in een marge opduikt.

De koppeling van sku naar artikelnummer komt uit de vastgelegde catalogus, niet
uit het opsplitsen van de sku op streepjes - dat laatste zou een aanname over
hun naamgeving zijn, en bij textiel (`{master}-{kleur}-{maat}`) gaat het mis.
Daarom moet er eerst een echte catalogusimport gedraaid zijn.

**Nog te beslissen:** of wij de inkoopprijs per variant gaan bijhouden. Dat is
een schemawijziging en raakt de prijsengine, dus dat gebeurt pas als blijkt
dat het in de praktijk vaak voorkomt.

### 5. Een product heeft varianten, drukwerk hangt aan het hoofdartikel

- `products/2.0` geeft per `master_code` (bijvoorbeeld `AR1804`) een lijst
  varianten met `sku` = `{master_code}-{variant_code}`, en bij textiel
  `{master_code}-{variant_code}-{size_code}`.
- Afbeeldingen hangen aan de **variant** (`digital_assets`, 700x700 en origineel),
  documenten en certificaten aan het **hoofdartikel**.
- `printdata/1.0` is per `master_code`: de drukinformatie is gelijk voor alle
  kleuren van een artikel. De koppeling tussen beide bestanden loopt dus over
  `master_code`.

Dat sluit aan op ons model: `Product` met `ProductVariant`, en bedrukopties aan
het product. De kleurcode uit de bestelling heet bij midocean
`item_color_number`, en is `color_code` uit de productinformatie.

## Nog na te vragen bij midocean

1. Bestaat de delta-/wijzigingsfeed voor productinformatie inmiddels? (Nu nog
   niet te zien aan de respons; 36 MB per keer blijft dus de norm.)
2. Welke van de twee waarden in Appendix F rij 1 klopt: setup 29,25 of 29,50?
3. Wordt de handling-prijs werkelijk per positie gerekend?
4. Zijn er rate limits, en wat gebeurt er bij overschrijding?
5. Hoe groot is de volledige productrespons? Dat bepaalt of wij hem kunnen
   streamen of in het geheugen mogen laden.
6. Een testsleutel voor `apitest.midocean.com`.
7. Klopt onze formule voor prijstype `Area`: prijs maal oppervlak in cm2 maal
   aantal? Techniek DPT is de enige die het gebruikt.
8. Waarom dragen staffeldrempels in de drukprijslijst een duizendtalpunt
   terwijl bedragen een decimale komma hebben? Blijft dat zo?

## Grenzen die wij onszelf opleggen

- **Geen bestellingen plaatsen.** Harde regel 13; zie ADR-0013 voor wat we wel
  alvast klaarzetten.
- **Geen credentials in de repository of in `.env` per leverancier.** Ze horen
  versleuteld in `supplier_connections.credentials`.
- **Geen productie-import vanuit DEV.** Lezen uit de testomgeving mag; de
  productiesleutel hoort niet op een ontwikkelmachine.
