# ADR-0005 - Geld, prijzen, btw en nummerreeksen

- Datum: 2026-10-08
- Status: geaccepteerd

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

## Beslist op 2026-10-08

1. **Btw-afronding: per orderregel, afgerond op twee decimalen.** Het regel-btw
   bedrag is de afgeronde waarde; het order-btw bedrag is de som van de
   afgeronde regelbedragen. Daarmee telt wat op de factuur staat exact op.
   De methode blijft als instelling `vat.rounding` opgeslagen, zodat een
   afwijkende eis van SnelStart later zonder migratie te volgen is.

2. **Nummerreeksen: formaat en startwaarde zijn instelbaar.** `NumberSequence`
   bewaart per reeks een `format` (met plaatshouders voor jaar en teller), een
   `prefix` en de huidige `lastValue`. Alle drie zijn te wijzigen via
   Instellingen, ook nadat er al nummers zijn uitgegeven, zodat bestaande
   reeksen uit Teamleader voortgezet kunnen worden. Uitgifte gebeurt onder een
   rij-lock; een uitgegeven nummer wordt nooit hergebruikt.

   Vertrekpunt: `OFF-{jaar}-{teller:5}`, `ORD-{jaar}-{teller:5}`,
   `INK-{jaar}-{teller:5}`, klantnummer `{teller:5}` vanaf 10001.
