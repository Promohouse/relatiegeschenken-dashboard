# ADR-0013 - midocean als eerste leverancierskoppeling, via REST

- Datum: 2026-10-28
- Status: geaccepteerd
- Vult ADR-0004 in: die koos *hoe* leveranciersdata binnenkomt (staging, nooit
  rechtstreeks in de catalogus), dit kiest de eerste leverancier en legt de
  feiten van hun API vast

## Aanleiding

ADR-0004 is geschreven zonder documentatie van enige leverancier: het
onderzoek van 8 oktober staat in `docs/leveranciers/koppelingen.md` en is daar
expliciet als ongeverifieerd gemarkeerd. Op 28 oktober 2026 leverde de
opdrachtgever de officiele midocean-handleiding (*API implementation guide and
integration overview*, v1.12.2, 23-10-2024). Daarmee kan er voor het eerst
gebouwd worden zonder iets aan te nemen - harde regel 8.

De feiten staan in `docs/leveranciers/midocean.md`. Hieronder alleen wat het
voor onze architectuur betekent.

## Besluit

### 1. REST, geen SFTP

Het onderzoeksdocument noemde SFTP met `Prodinfo_*.xml` als route voor
midocean. De handleiding haalt die route er sinds v1.11 volledig uit: *SFTP
service is now deprecated and will be discontinued in 2025*. De demo-verbinding
`midocean-sftp` in de seed blijft bestaan als vastlegging dat die route
onderzocht is, maar staat op inactief met die reden erbij. Hij wordt niet
verwijderd: dat zou de geschiedenis van het besluit wissen.

Alles loopt via `midocean-api`: voorraad, productinformatie, drukgegevens,
productprijzen en drukprijzen.

### 2. Bestellen wordt voorbereid, niet gebouwd

Harde regel 13 zegt dat leveranciersbestellingen buiten het platform gaan, en
de opdrachtgever heeft op 28 oktober bevestigd dat bestellen er nu niet bij
hoort maar wel open moet blijven.

Daarom:

- De capabilities `PLACE_ORDER` en `ORDER_STATUS` **bestaan** op de
  midocean-verbinding, maar staan op `isEnabled = false` met een notitie die
  naar deze ADR verwijst.
- De endpoints, de verplichte velden en de drukproefstroom staan beschreven in
  `docs/leveranciers/midocean.md`, zodat de kennis niet verdampt.
- Er wordt **geen** code geschreven die een POST naar midocean kan doen. Een
  uitgeschakelde capability met een ontbrekende connector is een eerlijkere
  rem dan een werkende functie achter een vlag: een vlag wordt ooit per
  ongeluk aangezet.

Wat straks nodig is om het wel te bouwen, is bekend en klein: de order-API
vraagt dezelfde gegevens die wij al in `Order`, `OrderLine` en `Proof` hebben,
plus een `ExternalReference` voor het midocean-ordernummer. De drukproefstroom
van midocean (proof approve/reject/addartwork) sluit aan op onze `Proof`-status.
Dat is precies de reden dat `external_references` polymorf is.

### 3. Bedragen uit leveranciersdata gaan door één functie

midocean levert bedragen als tekst met een decimale komma (`"4,22"`).
`parseFloat("4,22")` geeft stilzwijgend `4`. Dat is geen afrondingsfout maar
een factor, en het valt pas op in de marge van een order.

Alle leveranciersbedragen lopen daarom door `parseSupplierDecimal()` in
`@rgh/contracts`, die een punt, een komma en een lege waarde aankan en bij
iets anders een fout gooit in plaats van te gokken. Dit is de uitwerking van
harde regel 2 voor binnenkomende data.

### 4. Wij bepalen zelf wat er gewijzigd is

midocean heeft (in deze versie van de handleiding) geen wijzigings- of
deltafeed voor productinformatie. We halen de volledige catalogus op en
vergelijken per artikel een SHA-256 over de gecanoniseerde payload met wat er
in `raw_supplier_products` staat. Alleen een afwijkende hash levert een
`staged_change` op.

Gevolg voor het ontwerp: de import moet een volledige catalogus aankunnen
zonder die in zijn geheel in het geheugen te houden, en een onveranderd
artikel mag geen werk opleveren. Of er inmiddels wel een deltafeed is, staat
in de vragenlijst in `docs/leveranciers/midocean.md`.

### 5. De drukprijsberekening hoort in contracts, met hun eigen voorbeelden als test

Een drukprijs is bij midocean geen opzoeking maar een berekening met vier
prijstypes, een setup per kleur of per positie, een handlingcode en een
uitzondering voor techniek `ST`. Appendix F van de handleiding bevat vier
doorgerekende voorbeelden met verwachte totalen.

Die berekening staat in `@rgh/contracts`, niet in de connector: de
offertecalculator, het orderscherm en straks de webshop moeten er alle drie
mee rekenen (harde regel 11). De voorbeelden uit Appendix F staan als test,
zodat afwijking van midocean's eigen uitkomst meteen opvalt.

**Twee punten uit die appendix zijn intern inconsistent** (een setup die niet
klopt met zijn eigen uitkomst, en handling die wel of niet per positie telt).
Die zijn niet weggepoetst: de functie volgt de formule, de test legt het
verschil vast, en beide staan in de vragenlijst voor midocean. Een drukprijs
gaat pas naar een klant als dat met een echte order bevestigd is.

## Gevolgen

**Goed:** voor het eerst echte productdata in plaats van verzonnen testdata.
Voorraad per uur, prijzen per dag, en onze eigen inkoopprijzen rechtstreeks
uit hun systeem in plaats van uit een Excel die iemand bijwerkt.

**Kost ons:** de koppeling is leveranciersspecifiek. Dat is bewust: ADR-0004
koos tegen een tussenpartij als Promidata. Elke volgende leverancier is een
eigen connector achter dezelfde capability-routing, en dat is werk per
leverancier.

**Risico:** zonder deltafeed halen we dagelijks de volledige catalogus op. Bij
een paar honderdduizend varianten kan dat traag of zwaar worden. De hash-diff
beperkt het *vervolg*werk, niet het ophalen. Als dat knelt, is de deltafeed
(vraag 1) of een nachtelijk venster de oplossing.

## Nog te beslissen

- Of de productimport per taal draait (nl voor ons, en voor de webshop), of
  alleen nl met Engels als terugval.
- Of wij de midocean-afbeeldingen overnemen in onze eigen opslag of naar hun
  CDN blijven verwijzen. Overnemen is robuuster tegen wijzigingen aan hun
  kant, verwijzen is goedkoper en altijd actueel.
