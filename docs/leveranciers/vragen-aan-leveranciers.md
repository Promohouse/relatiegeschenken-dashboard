# Vragen aan de leveranciers

Concept-mails, klaar om te versturen. Per leverancier staan eerst de vragen
die **de prijs raken** - die horen beantwoord te zijn voordat er een
drukprijs aan een klant getoond wordt - en daarna de vragen die het bouwen
makkelijker maken.

Taal: alle drie in het Nederlands, op verzoek van de opdrachtgever. ANDA is
een Hongaars bedrijf en hun handleiding is Engels, dus als de contactpersoon
daar geen Nederlands leest kan de Engelse versie opgevraagd worden - de
veldnamen staan er sowieso in het Engels in, want zo heten ze in de feed.

Werkwijze: zodra een antwoord binnen is, gaat het naar het document van die
leverancier ([midocean.md](midocean.md), [anda.md](anda.md),
[pf-concept.md](pf-concept.md)) en vervalt de vraag hier. Een antwoord dat
afwijkt van de handleiding is geen detail: bij midocean weken drie dingen af
en alle drie zouden ze verkeerde prijzen hebben opgeleverd.

---

## 1. midocean

**Onderwerp:** Customer API - testsleutel en een aantal vragen over de
drukprijslijst

> Beste [naam],
>
> Wij zijn bezig onze Customer API-koppeling af te ronden. De productie-sleutel
> werkt en we halen inmiddels catalogus, prijzen, voorraad en drukgegevens op.
> Voordat wij drukprijzen aan klanten laten zien, willen we een paar dingen
> bevestigd hebben.
>
> **Toegang**
>
> 1. Kunnen wij een sleutel krijgen voor `apitest.midocean.com`? Die is niet
>    zelf aan te maken in het portaal. We willen onze koppeling tegen de
>    testomgeving afmaken zonder de productieomgeving te belasten.
> 2. Onze huidige productiesleutel is een keer buiten onze
>    beveiligde omgeving terechtgekomen. Kunnen jullie die intrekken en een
>    nieuwe afgeven?
>
> **Over de drukprijslijst (`printpricelist/2.0`)**
>
> Drie dingen wijken af van de *API implementation guide* v1.12.2. Wij volgen
> wat de API werkelijk teruggeeft, maar willen graag weten of dat klopt en zo
> blijft:
>
> 3. `next_colour_cost_indicator` bevat `"true"` en `"false"`. De handleiding
>    noemt `"X"`. Blijft dat `true`/`false`?
> 4. Staffeldrempels dragen een duizendtalpunt (`"1.000"`, `"2.500"`), terwijl
>    bedragen in hetzelfde bestand een decimale komma gebruiken. Is dat
>    bewust, en blijft dat zo? Wij lezen `"1.000"` nu als duizend; lezen we dat
>    goed?
> 5. Er bestaat een prijstype `Area` (prijs per cm², techniek DPT) dat niet in
>    de handleiding staat. Wij rekenen: prijs × oppervlak in cm² × aantal,
>    plus de handling per stuk. Klopt die formule?
>
> **Over Appendix F (de rekenvoorbeelden)**
>
> 6. Rij 1 noemt een setup van 29,25 en rekent vervolgens 29,25 × 3 = 88,50.
>    Dat is 87,75. De uitkomst 88,50 hoort bij een setup van 29,50. Welke van
>    de twee is juist?
> 7. Bij `AreaRange` en `NumberOfPositions` wordt in de voorbeelden de
>    handlingprijs met het aantal posities vermenigvuldigd, terwijl de tekst
>    zegt dat handling alleen van het product afhangt. Wordt handling per
>    positie gerekend of per product? Wij volgen nu het rekenvoorbeeld.
>
> **Praktisch**
>
> 8. Bestaat er inmiddels een delta- of wijzigingsfeed voor productinformatie?
>    Wij halen nu de volledige catalogus op (circa 36 MB) en bepalen zelf wat
>    er gewijzigd is.
> 9. Gelden er rate limits op de API, en wat gebeurt er bij overschrijding?
>
> Alvast dank. Met vriendelijke groet,
>
> [naam] — Promohouse BV

---

## 2. ANDA Present

**Onderwerp:** Activering XML-feeds en een aantal vragen over handleiding v3.2

> Beste [naam],
>
> Wij bouwen een koppeling met jullie XML-feeds, op basis van de *ANDA WEB
> CUSTOMER EN XML and CSV feed manual* versie 3.2. Kunnen jullie ons met het
> volgende helpen?
>
> **Activering**
>
> 1. Kunnen jullie onze toegang tot de XML-feeds activeren? Ons vaste
>    IP-adres is [IP-ADRES]. Graag ontvangen wij de unieke XML-id's voor de
>    feeds product, price, inventory, labeling, printing price, unique product
>    prices, category en Pantone. De feeds product, category, labeling en
>    printing time graag in het Nederlands (`nl`).
> 2. Is er een test- of acceptatieomgeving voor de feeds, of alleen de
>    live-bestanden?
>
> **Drukprijzen** *(dit raakt de prijzen die wij offreren, dus hier willen we
> zeker van zijn)*
>
> 3. Bij technieken die per oppervlak rekenen geeft de labeling feed een
>    techniekcode als `UVA`, terwijl in de printing price feed `UVA1`, `UVA2`
>    … `UVA+` staan. Wij bepalen het drukoppervlak en kiezen daarmee de
>    bijbehorende code via `SizeFrom`/`SizeTo`. Is dat de bedoelde werkwijze?
> 4. Bij **VS (vinylsticker)** noemt de handleiding "a separate price per
>    piece for gluing". Die prijs staat niet in de feed. Waar vinden wij hem,
>    en hoe wordt hij toegepast?
> 5. Bij **DO (doming)** en **SU (sublimatie)** staat dat de prijsgroep
>    afhangt van respectievelijk het stickerformaat en het drukformaat. Hoe
>    bepalen wij uit de feedgegevens welke prijsgroep geldt?
> 6. Bij **BR (borduren)** is geen prijs in het systeem geladen. Klopt het dat
>    dat zo blijft? Wij tonen dan een melding in plaats van een prijs te
>    berekenen.
>
> **Tegenstrijdigheden in de handleiding**
>
> De overzichtstabel op bladzijde 4 en de losse hoofdstukken geven
> verschillende updatemomenten. Welke is juist?
>
> | Feed | Tabel, blz. 4 | Hoofdstuk |
> |---|---|---|
> | Category | 2× per dag, 07:30 en 21:30 | 2× per dag, 07:10 en 21:10 (blz. 23) |
> | Printing price | wekelijks, zaterdag 09:00 | dagelijks 18:00 bij een wijziging (blz. 27) |
> | Unique product prices | wekelijks, zaterdag 09:00 | dagelijks 18:00 (blz. 22) |
>
> **Praktisch**
>
> 7. Is er een XSD of ander schema beschikbaar voor de XML-feeds?
> 8. Is er een delta- of wijzigingsfeed, of moet steeds het volledige bestand
>    opgehaald worden (30-40 MB voor producten)?
> 9. Gelden er rate limits of een maximum aantal ophaalacties per dag?
> 10. `assemblyProduct` markeert een onderdeel van een samengesteld artikel.
>     Hoe herkennen wij het samengestelde artikel zelf, zodat wij geen losse
>     onderdelen als verkoopbaar artikel tonen?
> 11. In de price feed ontbreken artikelen met een eigen prijsafspraak; die
>     staan in de unique product prices feed. Klopt het dat de prijs in die
>     tweede feed de bedrukking al bevat, en dat wij daar dus géén drukprijs
>     bovenop mogen rekenen?
>
> Alvast dank. Met vriendelijke groet,
>
> [naam] — Promohouse BV

---

## 3. PF Concept

**Onderwerp:** Aanvraag datafeeds + een paar inhoudelijke vragen (handleiding
v3.6.7)

> Beste [naam],
>
> Bijgaand het ondertekende aanvraagformulier voor de datafeeds. Wij bouwen
> een eigen ERP-koppeling op basis van de *Data feeds manual* versie 3.6.7.
>
> **Aanvraag**
>
> 1. Wij vragen de **price feed** en de **print price feed** aan, graag in
>    **JSON** en in het Nederlands.
> 2. Over de **stock feed**: op het formulier staat dat die niet altijd nodig
>    is. Wij gebruiken geen webshopleverancier maar een eigen systeem, en
>    willen voorraadstanden tonen bij het calculeren. Is de stock feed daarvoor
>    de aangewezen weg, of komt de voorraad die wij nodig hebben al mee in de
>    product feed?
> 3. Ons debiteurennummer is [NUMMER]. Welke assortimenten lopen er op ons
>    account - alleen stock (Avenue/Bullet/PFM), of ook WorldSource, USB en
>    Label? Dat bepaalt welke feeds wij moeten inlezen.
>
> **Drukprijzen** *(dit raakt de prijzen die wij offreren)*
>
> 4. In de print price feed staat per `decoCharge` het veld
>    `priceDependence`. De handleiding zegt dat de prijs afhangt van het
>    aantal kleuren, het formaat of geen van beide, en het voorbeeld toont
>    `None`. **Welke waarden kan dit veld hebben**, en welke dimensie moeten
>    wij per waarde uitlezen?
> 5. `LTMCharge` is de toeslag bij bedrukken onder `minDecoQty`. Wordt die
>    toeslag per order gerekend, per regel, of per drukpositie?
> 6. `logoSizeCm2` is `0` wanneer het formaat niet van toepassing is. Is dat
>    de enige betekenis van `0`, of kan het ook een werkelijk formaat zijn?
>
> **Productgegevens**
>
> 7. Welke waarden kan `markSegment` hebben? Wij zoeken het veld waarmee wij
>    kunnen zien uit welk assortiment een artikel komt.
> 8. `maxColours` en `maxColoursDefault` zijn een getal, behalve bij
>    fullcolour, waar er tekst staat. Welke tekstwaarde is dat precies?
>
> **Praktisch**
>
> 9. Is er een XSD of JSON-schema voor de v3-feeds?
> 10. Is er een delta-feed, of moet elke keer het volledige bestand opgehaald
>     worden? En hoe groot zijn de bestanden ongeveer?
> 11. Artikel 5 van de gebruiksvoorwaarden verbiedt "onevenredig vaak"
>     opvragen. Wij zijn van plan elke feed één keer op te halen na jullie
>     updatemoment, dus de product- en print data feed dagelijks en de
>     prijsfeeds wekelijks. Is dat akkoord?
>
> Met vriendelijke groet,
>
> [naam] — Promohouse BV

---

## Wat er van onze kant nog moet gebeuren

Dit zijn de dingen die niet bij een leverancier liggen.

| | Wat | Waarom het blokkeert |
|---|---|---|
| 1 | **Een vast uitgaand IP-adres** | ANDA laat de feeds alleen vanaf een vooraf opgegeven IP binnen. Zonder dat adres kan de koppeling niet geactiveerd worden. Hangt samen met besluit D-05 (hosting). |
| 2 | **midocean-sleutel laten vervangen** | De huidige productiesleutel is een keer buiten de beveiligde omgeving geweest. |
| 3 | **Debiteurennummer en assortimenten PF Concept** | Bepaalt welke feeds aangevraagd worden; PF splitst in vier assortimenten met eigen bestanden. |
| 4 | **Wie tekent de PF-voorwaarden** | Het aanvraagformulier is een overeenkomst, met een geheimhoudingsplicht op de feed-URL en de prijzen. |
| 5 | **Volgorde** | Met welke leverancier gaan we na midocean verder? PF Concept is technisch de eenvoudigste; ANDA kan pas zodra het IP-adres er is. |
