# ADR-0014 - De importvergelijking draait altijd, de hash bepaalt alleen opslag

- Datum: 2026-10-28
- Status: geaccepteerd
- **Corrigeert ADR-0013 paragraaf 4.** Die paragraaf stelde dat alleen een
  afwijkende hash een `staged_change` oplevert. Dat klopt niet, en dat bleek
  bij het bouwen.

## Wat er mis was

ADR-0013 beschreef de hash als de poort naar de hele verwerking: gelijke hash
is overslaan. Dat is een redenering vanuit de leverancier, en hij mist de helft
van de werkelijkheid.

Een gelijke hash zegt precies één ding: **de leverancier heeft niets gewijzigd
sinds de vorige keer.** Hij zegt niets over onze kant. Twee gevallen lopen
daardoor mis:

1. Een artikel dat bij de eerste import nog niet aan een eigen product
   gekoppeld was. De ruwe rij is opgeslagen, dus de hash klopt voortaan. Het
   voorstel om het product aan te maken verdwijnt daarmee voorgoed: het
   artikel wordt elke volgende import overgeslagen terwijl het product nooit
   is aangemaakt.
2. Iemand past bij ons een productnaam of -omschrijving aan. De
   leveranciersdata verandert niet, dus de afwijking wordt nooit gemeld.

Geval 1 kwam aan het licht door een test die een product pas na de eerste
import koppelde. De uitslag was "ongewijzigd" terwijl er duidelijk werk lag.
Geval 2 is dezelfde fout, een stap later in de tijd.

## Besluit

**De vergelijking met de catalogus draait altijd. De hash bepaalt alleen of de
ruwe payload opnieuw wordt vastgelegd.**

Dat kan zonder prestatieverlies omdat de vergelijking niet tegen de database
gebeurt maar tegen het geheugen: de producten van die leverancier worden in
één query geladen, en de vergelijking is daarna een lezing uit een `Map`. Eén
query per import in plaats van één per artikel.

Daarmee betekent "ongewijzigd" in de uitslag ook iets anders, en iets
bruikbaarders: **er is geen verschil tussen de bron en onze catalogus.** Niet:
de leverancier heeft niets gestuurd.

## Gevolgen

**Goed:** een voorstel blijft staan tot iemand het toepast of afwijst. Dat is
hoe een werkvoorraad hoort te werken. En een afwijking die bij ons is ontstaan
wordt gewoon zichtbaar.

**Kost ons:** de producten van een leverancier moeten in het geheugen passen.
Bij midocean gaat het om duizenden artikelen; dat is geen probleem. Wordt een
catalogus veel groter, dan moet dit in blokken, en dat staat als opmerking in
de code waar het geladen wordt.

**Blijft staan uit ADR-0013:** de hash bestaat nog steeds en doet nog steeds
nuttig werk - hij voorkomt dat er onnodig naar `raw_supplier_products`
geschreven wordt bij een dagelijkse volledige catalogus.
