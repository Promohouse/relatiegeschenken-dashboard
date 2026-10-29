# ADR-0017 - Een margeregel noemt zijn eigen grondslag, en drukwerk heeft een eigen marge

- Datum: 2026-10-29
- Status: geaccepteerd
- Vult ADR-0005 aan: die legde de prijsengine vast, maar liet in het midden
  waar het percentage van een regel op slaat.

## De vraag

Bij het bouwen van het margescherm kwam aan het licht dat `marginPercent` op
twee plaatsen in het systeem staat en op twee verschillende dingen slaat:

| Waar | Betekenis | Voorbeeld |
|---|---|---|
| `PriceRule.marginPercent` | opslag **op de inkoopprijs** | 110 betekent × 2,1 |
| `PrintPositionInput.marginPercent` | deel **van de verkoopprijs** | 40 betekent inkoop / 0,6 |

Allebei zijn in deze handel gangbaar en allebei heten "marge". 110% opslag is
52,38% marge; 40% marge is 66,67% opslag. `quote-calculation.ts` waarschuwde
er al voor in een commentaar, maar het systeem dwong niets af: uit het getal
alleen is niet op te maken welke van de twee bedoeld is.

Zo'n veld in een beheerscherm zetten met het label "Marge" zou de verwarring
vastleggen in de bedrijfsvoering. Iemand die 40 invult omdat hij 40% marge
wil, krijgt dan 40% opslag — en dat is 28,57% marge.

## Besluit

**Een regel zegt zelf wat hij bedoelt.** `PriceRule.marginBasis` is `COST`
(opslag op de inkoop) of `SALE` (deel van de verkoopprijs). De standaard is
`COST`, zodat bestaande regels precies dezelfde prijs blijven opleveren.

Het omrekenen staat in `@rgh/contracts` (`toSaleMarginPercent`,
`toCostMarkupPercent`) en nergens anders. Het formulier laat tijdens het
typen zien wat het percentage in de andere eenheid is, en de api geeft bij
elke regel `saleMarginPercent` mee. Zo kan geen scherm een ander antwoord
geven dan de berekening.

**Drukwerk krijgt een eigen marge** (`PriceRule.printMarginPercent`). Leeg
betekent: volg de marge op het artikel — het gedrag van vóór dit besluit.

## Twee regels voor het kiezen van de drukmarge

Dit zijn de twee keuzes waar de werking van afhangt.

**Een regel die niets over drukwerk zegt slaat de volgende niet dood.** De
drukmarge komt van de eerste toepasselijke regel die er iets over zegt, niet
van de regel die de artikelprijs won. Een klantregel met alleen een
artikelmarge laat de algemene drukmarge dus staan. Anders zou het instellen
van een klantkorting stilzwijgend de marge op het drukwerk weghalen, en dat
merkt niemand tot de order gedraaid is.

**Een klantprijsafspraak raakt de drukmarge niet.** Een afspraak noemt een
toegezegd bedrag per stuk voor het artikel; over wat bedrukken kost is niets
afgesproken. Zou het drukwerk de marge van de afspraak volgen, dan levert een
scherpe afspraak op het artikel ook nog eens drukwerk tegen bijna kostprijs
op. De drukmarge blijft daarom uit de regels komen.

## Gevolgen

- Bestaande regels wijzigen niet van gedrag; `COST` is wat ze bedoelden.
- Het scherm toont standaard de marge op de verkoopprijs, want zo praat de
  verkoop erover, en noemt de opslag erbij.
- `marginPercent` ≥ 100 blijft geldig bij `COST` en wordt geweigerd bij
  `SALE`. Die controle staat op het hele object, want hij hangt van een ander
  veld af.
- Een offerteregel kan de drukmarge nog steeds per calculatie overschrijven.
  De volgorde is: handmatig ingevuld, anders de ingestelde regel, anders de
  marge op het artikel.
