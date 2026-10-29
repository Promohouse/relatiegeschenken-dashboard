# Vragen aan de leveranciers

Concept-mails, klaar om te versturen. Per leverancier staan eerst de vragen
die **de prijs raken** - die horen beantwoord te zijn voordat er een
drukprijs aan een klant getoond wordt - en daarna de vragen die het bouwen
makkelijker maken.

Taal: midocean en PF Concept zijn Nederlandse bedrijven, ANDA is Hongaars en
hun documentatie is Engels.

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

**Onderwerp:** XML feed activation and a few questions about the manual (v3.2)

> Dear [name],
>
> We are building an integration with your XML feeds, based on the *ANDA WEB
> CUSTOMER EN XML and CSV feed manual* version 3.2. Could you help us with the
> following?
>
> **Activation**
>
> 1. Could you activate our XML feed access? Our static IP address is
>    [IP-ADRES]. Please let us know the unique XML IDs for the product, price,
>    inventory, labeling, printing price, unique product prices, category and
>    Pantone feeds. We would like the product, category, labeling and printing
>    time feeds in Dutch (`nl`).
> 2. Is a test or staging environment available for the feeds, or only the
>    live files?
>
> **Printing prices** *(these affect the prices we quote, so we would like to
> be certain)*
>
> 3. For area-based technologies, the labeling feed gives us a technology code
>    such as `UVA`, while the printing price feed contains `UVA1`, `UVA2` …
>    `UVA+`. We determine the imprint area from the requested logo size and
>    then select the matching code using `SizeFrom`/`SizeTo`. Is that the
>    intended way?
> 4. For **VS (vinyl sticker)** the manual mentions "a separate price per piece
>    for gluing". That price is not in the feed. Where do we find it, and how
>    is it applied?
> 5. For **DO (doming)** and **SU (sublimation)** the manual says the price
>    group depends on the sticker size and the print size. How do we determine
>    which price group applies from the feed data?
> 6. For **BR (embroidery)** no price is loaded. Is that still the case? We
>    will show a warning rather than calculate a price.
>
> **Contradictions in the manual**
>
> The overview table on page 4 and the individual chapters give different
> update moments. Which is correct?
>
> | Feed | Table, page 4 | Chapter |
> |---|---|---|
> | Category | twice a day, 07:30 and 21:30 | twice a day, 07:10 and 21:10 (p. 23) |
> | Printing price | weekly, Saturday 09:00 | every day 18:00 when updated (p. 27) |
> | Unique product prices | weekly, Saturday 09:00 | once a day, 18:00 (p. 22) |
>
> **Practical**
>
> 7. Is an XSD or other schema available for the XML feeds?
> 8. Is there a delta or change feed, or do we always need to download the
>    full file (30-40 MB for products)?
> 9. Are there rate limits or a maximum number of downloads per day?
> 10. `assemblyProduct` marks a part of an assembled product. How do we
>     recognise the assembled product itself, so we do not list parts as
>     separate sellable items?
>
> Thank you in advance. Kind regards,
>
> [name] — Promohouse BV, the Netherlands

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
