# ADR-0005 - Geld, prijzen, btw en nummerreeksen

- Datum: 2026-10-08
- Status: geaccepteerd, twee punten nog te beslissen

## Besluit

### Bedragen

PostgreSQL `NUMERIC`, Prisma `Decimal`, rekenen met decimal.js. Nooit `float`
of `double`. Eenheidsprijzen `NUMERIC(14,4)` omdat staffels en instelkosten
fijnmazig zijn; regel- en ordertotalen `NUMERIC(14,2)`.

### Historische prijzen

Een orderregel kopieert bij aanmaak inkoopprijs, verkoopprijs, gebruikte
staffel en instelkosten naar eigen kolommen. Een prijswijziging op het product
raakt bestaande orders daarna nooit meer. Totalen worden altijd server-side
herberekend uit die vastgelegde waarden, nooit uit de live productprijs.

### Eén prijsengine

Inkoopstaffels -> declaratieve margeregels (per leverancier, categorie,
product, klant, aantal) -> verkoopstaffels. Regels zijn versioneerd met een
geldigheidsdatum, zodat een verhoging per 1 januari vooruit klaargezet kan
worden. Dezelfde service bedient het orderscherm, de webshop en de
partnerfeeds. Prijslogica bestaat op precies één plek.

### Nummerreeksen

Tabel `NumberSequence(key, year, last)` met rij-lock bij uitgifte: unieke
nummers zonder gaten door gelijktijdigheid. Het formaat is instelbaar en de
teller kan op een startwaarde gezet worden, zodat bestaande nummerreeksen uit
Teamleader voortgezet kunnen worden.

### Btw

Het btw-tarief staat per orderregel vast (snapshot). De afrondingsmethode is
een **instelling**, geen hardgecodeerde keuze, zodat het latere antwoord geen
migratie vraagt.

## Nog te beslissen

1. **Afronding**: btw per orderregel afronden op twee decimalen, of berekenen
   over het ordertotaal? Moet aansluiten op hoe SnelStart het boekt, anders
   ontstaan centverschillen bij de facturatie.
2. **Formaat nummerreeksen**: voorstel `OFF-2026-00001`, `ORD-2026-00001`,
   `INK-2026-00001`, klantnummer `10001`. Plus: welke startwaarden, gegeven de
   bestaande nummers in Teamleader?
