# ADR-0016 - Drukprijzen worden berekend, niet omgerekend naar eigen staffels

- Datum: 2026-10-29
- Status: geaccepteerd
- Breidt ADR-0015 uit: die stond rechtstreeks wegschrijven toe voor voorraad
  en vroeg om elk volgend geval expliciet toe te voegen. Dit is dat geval.

## De vraag

Onze catalogus kent drukprijzen als staffel: per bedrukoptie, per aantal
kleuren, vanaf een aantal stuks, een prijs. Dat werkt als een leverancier zijn
drukprijzen ook zo aanlevert.

midocean doet dat niet. Hun drukprijslijst is een **berekening** met vijf
prijstypes:

| Prijstype | Prijs hangt af van |
|---|---|
| `NumberOfPositions` | aantal posities |
| `NumberOfColours` | aantal kleuren, met een eigen prijs vanaf de tweede |
| `AreaRange` | in welk oppervlaktebereik het logo valt |
| `ColourAreaRange` | oppervlaktebereik én aantal kleuren |
| `Area` | prijs per vierkante centimeter |

Daar komt per artikel een handlingprijs bij (manipulatiecode A-Z) en een setup
die per kleur of per positie telt.

## Waarom het niet omgerekend kan worden

Twee van die vijf types hangen af van **het oppervlak van het logo**. Dat is
geen eigenschap van het product maar van de opdracht: dezelfde beker met een
klein logo kost iets anders dan met een groot. Het is dus pas bekend op het
moment dat er gecalculeerd wordt.

Een staffeltabel vooraf vullen zou betekenen: voor elk artikel, elke
techniek, elk aantal kleuren en elk denkbaar oppervlak een rij. Dat is niet
alleen onwerkbaar groot, het is ook fout zodra het oppervlak er niet precies
in staat.

## Besluit

**De prijsstructuur van de leverancier wordt bewaard zoals hij is, en de
calculatie rekent hem uit.**

- `supplier_print_techniques` en `supplier_print_manipulations` houden de
  prijslijst per koppeling bij, inclusief geldigheidsdatum.
- De berekening staat in `@rgh/contracts` en is getoetst aan de vier
  doorgerekende voorbeelden uit midocean's eigen Appendix F.
- Onze eigen `print_price_tiers` blijven bestaan voor leveranciers die wél
  gewone staffels aanleveren, en voor handmatig ingevoerde prijzen. De
  calculator probeert eerst de leverancier, dan de eigen staffel.

### Rechtstreeks wegschrijven, net als voorraad

De prijslijst gaat niet door de beoordeling heen. Dezelfde redenering als bij
voorraad (ADR-0015): de tabel bevat uitsluitend wat de leverancier zei, er
staat geen veld in dat een medewerker invult, en er valt dus niets van ons te
overschrijven. Bovendien kopieert een offerteregel zijn prijzen bij aanmaak
(harde regel 3), dus een nieuwe prijslijst verandert nooit een bestaande
offerte.

Wat wél door de beoordeling gaat zijn de **bedrukopties per artikel**: welke
posities een product heeft en welke technieken daarop kunnen. Dat zijn
producteigenschappen, en die volgen de gewone route van ADR-0004.

## Wat de echte data anders bleek te doen dan de handleiding

Gemeten op 29 oktober 2026, en alle drie met gevolgen voor de prijs:

1. **`next_colour_cost_indicator` is `"true"`/`"false"`, niet `"X"`.** Met
   alleen de X-controle zou de goedkopere vervolgkleur nooit gelden en werd
   elke kleur voor de volle prijs gerekend.
2. **Staffeldrempels dragen een duizendtalpunt**: `"1.000"`, `"2.500"`. Zonder
   onderscheid wordt dat één en tweeënhalf. Bij techniek P3 kost de eerste
   kleur 0,98 vanaf één stuk en 0,19 vanaf duizend; met de fout zou die 0,19
   al bij het eerste exemplaar gelden.
3. **Er bestaat een vijfde prijstype `Area`** dat niet in de handleiding
   staat. De formule - prijs maal oppervlak maal aantal - is afgeleid uit het
   feit dat `AreaRange` uitdrukkelijk zegt dat je daar niet met het oppervlak
   hoeft te vermenigvuldigen. Dat is een redenering, geen bevestiging, en een
   calculatie met dat type draagt daarom een waarschuwing.

## Gevolgen

**Goed:** de drukprijs klopt met wat de leverancier rekent, inclusief handling
en setup. Narekenen met de hand op een echt artikel gaf exact hetzelfde bedrag
(AR1253, 250 stuks, tampondruk in twee kleuren: 0,5300 per stuk en 55,00
instelkosten).

**Kost ons:** de calculatie is leveranciersspecifiek. Een tweede leverancier
met een ander model vraagt een eigen functie, en de calculator moet weten
welke hij moet gebruiken. Dat is dezelfde prijs die ADR-0004 al accepteerde
door geen tussenpartij te nemen.

**Opgelopen schuld:** onze `print_methods` en `print_positions` zijn nu
gevuld met de codes van midocean - 73 technieken en 1316 posities, met hun
eigen namen. Zolang er één leverancier is, is dat precies goed. Komt er een
tweede, dan moeten ze genormaliseerd worden met `value_mappings`
(`MappingDomain.PRINT_METHOD` en `PRINT_POSITION`), die daar al voor bestaan.
