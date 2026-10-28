# ADR-0015 - Voorraad gaat buiten de beoordeling om

- Datum: 2026-10-28
- Status: geaccepteerd
- Verfijnt ADR-0004: die eist dat externe data in staging landt en pas na
  beoordeling in onze gegevens komt. Dat blijft gelden voor catalogus en
  prijzen; voor voorraad niet, en dit legt uit waarom.

## De vraag

ADR-0004 kent één route voor leveranciersdata: ophalen, in staging zetten,
verschillen tonen, en pas na goedkeuring toepassen. Die route is er omdat
externe data onze eigen gegevens kan overschrijven - een productnaam, een
prijs, een omschrijving die iemand met de hand heeft bijgewerkt.

Voorraad past daar niet in. Bij twee ophaalmomenten per dag en een paar
duizend artikelen zou dat duizenden voorstellen per dag opleveren, die
allemaal "ja" zouden krijgen. Een werkvoorraad die altijd met één klik
weggewerkt wordt is geen controle maar een ritueel, en leidt ertoe dat de
voorstellen die er wél toe doen ondersneeuwen.

## Besluit

**Voorraad wordt rechtstreeks weggeschreven, zonder beoordeling.**

Dat mag omdat voorraad iets anders is dan de rest:

1. **Het is een meting, geen eigenschap.** Een voorraadstand zegt niet wat een
   product *is*, maar wat er op een moment lag. Hij hoort bij een tijdstip, en
   daarom draagt elke rij `fetchedAt`.
2. **Het overschrijft niets van ons.** `supplier_stock` bevat uitsluitend wat
   de leverancier zei. Er staat geen veld in dat een medewerker invult, dus er
   is niets dat per ongeluk weggegooid kan worden. Dat is precies het risico
   waar ADR-0004 tegen beschermt, en dat risico bestaat hier niet.
3. **Het is per definitie verouderd.** Een voorraadstand goedkeuren die twee
   uur oud is, is zinloos: tegen de tijd dat iemand kijkt klopt hij toch al
   niet meer. Wat telt is dat erbij staat hoe oud hij is.

Wat blijft: een proefimport schrijft ook hier niets weg, en een import legt
vast wat hij gedaan heeft.

## Wat dit betekent voor het scherm

Een voorraadstand mag nooit als harde toezegging getoond worden. Op het
productscherm staat hij per variant met de ophaaltijd erbij, en met de
eerstvolgende verwachte levering als de leverancier die geeft. De
opdrachtgever haalt twee keer per dag op; een stand kan dus een halve dag oud
zijn, en dat hoort zichtbaar te zijn.

## Gevolgen

**Goed:** de beoordelingslijst blijft gaan over dingen die werkelijk een
beslissing vragen. En een verkoper ziet bij het offreren of iets leverbaar is,
zonder dat iemand daar eerst iets voor hoeft goed te keuren.

**Kost ons:** een tweede route naast de staging-route, dus twee dingen om te
begrijpen in plaats van één. Dat is de prijs voor het onderscheid tussen
"gegevens over een product" en "een meting aan een product".

**Grens:** deze uitzondering geldt alleen voor voorraad. Komt er ooit iets bij
dat óók een meting is - een levertijd die per dag verschuift bijvoorbeeld -
dan hoort dat expliciet aan deze lijst toegevoegd te worden en niet stilzwijgend
meegenomen.
