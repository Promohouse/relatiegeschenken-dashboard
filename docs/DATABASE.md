# DATABASE — Relatiegeschenken Hub

PostgreSQL 16, Prisma 7.10.0. UUID-sleutels, leesbare nummers voor klanten,
offertes, orders, zendingen en inkooporders. Stand: 67 tabellen, zeven
migraties.

## 1. Invarianten

Regels die de database zelf of een service afdwingt, niet de interface.

1. **Geld is nooit een floating-pointgetal.** `NUMERIC(14,4)` voor
   eenheidsprijzen en staffels, `NUMERIC(14,2)` voor regel- en ordertotalen.
2. **Historische prijzen staan vast.** Een orderregel kopieert bij aanmaak
   artikelnummer, naam, leveranciersnaam, inkoopprijs, verkoopprijs, gebruikte
   staffel en instelkosten naar eigen kolommen. Een latere productwijziging
   raakt bestaande offertes en orders nooit.
3. **Btw per orderregel, afgerond op twee decimalen.** Het ordertotaal is de
   som van de afgeronde regelbedragen, zodat de factuur optelt. Methode staat
   als instelling `vat.rounding` (ADR-0005).
4. **Statussen staan per orderregel**, niet alleen op de order. Een order kan
   regel 1 geleverd en regel 3 wachtend op drukproef hebben. De orderstatus is
   afgeleid.
5. **Externe data landt in staging.** Leveranciersdata gaat via
   `raw_supplier_products` en `staged_changes`, nooit rechtstreeks in
   `products` (ADR-0004).
6. **Een import verwijdert niets.** Een product dat ontbreekt in een
   importbestand wordt gemarkeerd als mogelijk vervallen en ter beoordeling
   aangeboden.
7. **Klantgegevens zijn per organisatie afgeschermd.** Elke query vanuit een
   portaalsessie wordt op `customerId` begrensd, afgedwongen door een
   Prisma-extensie, niet door discipline.
8. **Append-only waar bewijs nodig is.** Tijdlijn, auditlog, goedkeuringen,
   statushistorie en synchronisatie-events worden nooit gewijzigd. Voor
   offerteversies en offertebeslissingen dwingen databasetriggers dit af,
   niet de applicatie (§3).
9. **Definitieve verkoopfactuurnummers komen uit SnelStart.** Onze
   nummerreeksen geven offerte-, order-, inkooporder- en klantnummers uit, en
   voor facturen uitsluitend een interne conceptreferentie.
10. **Nummerreeksen zijn instelbaar.** Formaat én startwaarde zijn te
    wijzigen, ook nadat er nummers zijn uitgegeven, zodat reeksen uit
    Teamleader voortgezet kunnen worden. Uitgifte onder rij-lock; een
    uitgegeven nummer wordt nooit hergebruikt.

## 2. Domeinen en entiteiten

Status: **gereed** = staat in de database en is getest. **te bouwen** = nog
geen tabel.

### Identiteit en rechten
`users`, `roles`, `permissions`, `user_roles`, `role_permissions` — gereed.
Permissies als `module:actie` in de database, dus configureerbaar zonder code.

Te bouwen: sessie- en MFA-tabellen (komen uit de gekozen auth-bibliotheek,
ADR-0003), `customer_users` met klantrollen (klantbeheerder, besteller,
goedkeurder, financieel contact).

### CRM
`customers`, `contact_persons`, `addresses`, `customer_agreements` — gereed.

Te bouwen: `payment_terms` (betalingsvoorwaarden per klant),
`customer_price_agreements` als eigen tabel naast de generieke prijsregels.

### Leveranciers
`suppliers`, `supplier_contacts` — gereed.

### Catalogus
`product_categories`, `products`, `product_variants`, `product_suppliers`,
`purchase_price_tiers`, `sales_price_tiers`, `print_methods`,
`product_print_options`, `print_price_tiers`, `media_assets`,
`product_media`, `product_field_sources` — gereed.

`print_positions` — **gereed**. Meerdere bedrukkingen per orderregel konden al
via meerdere print jobs; wat ontbrak was de positie als genormaliseerde
entiteit, nodig om leveranciersbenamingen te mappen
(`MappingDomain.PRINT_POSITION`) en om op positie te filteren en te
rapporteren. `product_print_options` verwijst er verplicht naar en bewaart in
`positionLabel` de oorspronkelijke tekst van de leverancier.

Bedrukkingen op orderregels en offerteregels houden hun positietekst als
momentopname en verwijzen daarnaast naar de positie. Historische, vastgezette
offerteversies zijn met opzet **niet** aangevuld bij de migratie: daar is de
tekst het vastgelegde gegeven.

Te bouwen: `artwork_assets` (klantlogo's en ontwerpen, herbruikbaar bij
herhaalorders).

### Imports en leverancierskoppelingen
`supplier_connections`, `supplier_connection_capabilities`, `import_runs`,
`import_items`, `raw_supplier_products`, `field_mappings`, `value_mappings`,
`staged_changes` — gereed.

De capability `PLACE_ORDER` blijft in het model staan als voorbereiding, maar
wordt in deze fase **niet gebruikt**: leveranciersbestellingen gaan buiten het
platform.

### Offertes
`quotes`, `quote_versions`, `quote_items`, `quote_item_print_jobs`,
`quote_approvals` - **gereed**, met databasetriggers die de onveranderlijkheid
afdwingen. Zie §3 en ADR-0007.

### Orders
`orders`, `order_lines`, `order_line_print_jobs`, `order_events` — gereed.
`kind` is verdwenen; een order verwijst via `quoteVersionId` naar de
geaccepteerde offerteversie waaruit hij is ontstaan, één op één. `order_lines`
houdt via `quoteItemId` de herkomst per regel vast. Beide hebben een
`version`-kolom voor optimistic locking.

Te bouwen: `order_revisions` (wijzigingen na acceptatie, met het effect op
bestaande goedkeuringen).

### Workflow
**Volledig te bouwen.** `workflow_definitions`, `workflow_states`,
`workflow_transitions`, `workflow_events`, `workflow_tasks`,
`automation_rules`, `outbox_events`, `webhook_events`.
Ontwerp in [WORKFLOWS.md](WORKFLOWS.md).

`order_events` blijft bestaan als de voor mensen leesbare tijdlijn;
`workflow_events` is de machinelezbare gebeurtenisstroom. Die twee niet
samenvoegen: de eerste is presentatie, de tweede is verwerking met
idempotentie en versies.

### Drukproeven
`proofs`, `proof_approvals` — gereed. De opdracht noemt
`ProofVersions`/`ProofDecisions`; dat is hetzelfde model onder andere namen.
`proofs.versionNumber` is de versie, `proof_approvals` de beslissing.

Te bouwen: koppeling naar het exacte bestand plus bestandscontrolewaarde op
het moment van goedkeuring, en een onveranderbaarheidsvlag op het akkoord.

### Inkoop
`purchase_orders`, `purchase_order_lines`, `supplier_confirmations`,
`goods_receipts`, `goods_receipt_lines` — gereed.

### Uitgaande leveringen
`shipments`, `shipment_items` — **gereed**. Meerdere zendingen per order, elk
met eigen afleveradres, methode (rechtstreeks vanuit de leverancier of eigen
verzending), vervoerder, trackingcode en pakbon.

`goods_receipts` is **inkomend**: wat de leverancier bij ons of bij de klant
aflevert. Die twee niet door elkaar halen. Daarom is ook `LogisticsStatus`
uitgaand gemaakt: `NONE`, `EXPECTED`, `PREPARED`, `SHIPPED`,
`PARTIALLY_DELIVERED`, `DELIVERED`. De inkomende begrippen zitten in
`PurchaseStatus`.

De statussen zijn **afgeleid**, niet handmatig gezet: `deriveLineLogisticsStatus`
en `isOrderFullyDelivered` in `packages/contracts/src/shipping.ts` bepalen ze
uit de zendingen. Een order is pas volledig geleverd als elke relevante regel
volledig geleverd is; geannuleerde regels houden een order niet open.

### Documenten
`documents`, `document_versions` — gereed, met koppelingen naar klant, order,
orderregel, drukproef, inkooporder en inkoopfactuur.

### E-mail
**Te bouwen.** `email_threads`, `email_messages`, `email_templates`,
`email_attachments`. Met een deduplicatiesleutel op Graph-berichtidentificatie
en wijzigingsmeldingen.

### Verkoopfacturatie en betalingen
**Te bouwen.** `invoices`, `invoice_items`, `payments`,
`payment_allocations`. Facturen houden zowel onze conceptreferentie als het
definitieve SnelStart-nummer en de externe referentie vast.

### Uitgaven en crediteuren
`purchase_invoices`, `purchase_invoice_lines` — skelet gereed, met
dubbelherkenning op leverancier plus factuurnummer, gescheiden inhoudelijke en
financiële goedkeuring.

Te bouwen: `supplier_invoice_documents`, `supplier_invoice_extractions`
(ruwe extractie en herkende velden met betrouwbaarheid per veld, apart van de
handmatige correcties), `supplier_invoice_approvals`,
`supplier_invoice_allocations` (toerekening per order en orderregel),
`supplier_invoice_status_history`, `supplier_invoice_sync_events`,
`supplier_credit_notes`, `supplier_payment_statuses`,
`supplier_invoice_exceptions`.

### Marges en rapportage
**Te bouwen.** Op order en orderregel apart bewaren: gecalculeerde
inkoopkosten, werkelijke inkoopkosten, verkoopwaarde, gecalculeerde en
werkelijke brutowinst en -marge, plus een margestatus
(`VOORLOPIG | GEDEELTELIJK | DEFINITIEF`).
`financial_reporting_snapshots` voor periodeafsluitingen.

### Systeem
`audit_logs`, `number_sequences`, `vat_rates`, `settings` — gereed.

`external_references` — **gereed**. Herkomst en synchronisatiesleutel richting
Teamleader, SnelStart, Mollie, Graph en leverancierssystemen. Twee unieke
sleutels: één extern record wijst naar maximaal één intern record per systeem,
en omgekeerd. Daarmee is synchronisatie idempotent: een mislukte poging levert
bij de tweede keer geen duplicaat.

**Bewuste afweging:** polymorf met `entityType` plus `entityId`, dus zonder
foreign key. Het alternatief was vijftien nullable kolommen die bij elke
nieuwe entiteit weer groeien. De prijs is dat verwijsrijen kunnen achterblijven
als hun doel verdwijnt; dat vraagt een opruimtaak, die nog niet bestaat.

### Kanalen en partners
`shop_channels`, `channel_assortment_items`, `price_rules`, `feed_exports`,
`partner_accounts`, `api_keys` — gereed.

## 3. Offertes: gesplitst en onveranderlijk

Besloten en uitgevoerd op 2026-10-28, zie
[ADR-0007](architecture/0007-offertemodel-splitsen.md).

```
quotes            kop: klant, contactpersoon, eigenaar, huidige versie,
                  geaccepteerde versie
  quote_versions  ONVERANDERLIJK zodra lockedAt gevuld is
    quote_items   regels met prijsmomentopname
      quote_item_print_jobs
  quote_approvals append-only beslissing per versie

orders            ontstaat uit een geaccepteerde versie (quoteVersionId, uniek)
  order_lines     kopie van de offerteregels (quoteItemId als herkomst)
```

### Onveranderlijkheid staat in de database, niet in de code

Vier triggers dwingen dit af. Een digitaal klantakkoord moet aantoonbaar aan
een exacte versie vastliggen; dan is "de service doet het netjes" niet genoeg.

| Trigger | Weigert |
|---|---|
| `quote_versions_immutable` | elke wijziging of verwijdering zodra `lockedAt` gevuld is. De overgang naar vastgezet mag wel: dan is de oude waarde nog leeg. |
| `quote_items_immutable` | wijzigen, verwijderen **en toevoegen** van regels op een vastgezette versie |
| `quote_item_print_jobs_immutable` | hetzelfde voor bedrukkingen, via de regel naar de versie |
| `quote_approvals_append_only` | elke wijziging of verwijdering van een klantbeslissing |

### Ontsnappingsluik voor beheer

Demodata opruimen, testopruiming en gecontroleerde correcties zetten binnen
hun transactie:

```sql
SET LOCAL rgh.unlock_quotes = 'on';
```

In code: `allowLockedQuoteChanges(tx)` uit `@rgh/db`. Bewust omslachtig en
zichtbaar, zodat het niet per ongeluk gebeurt. Een order die aan een
offerteversie hangt blokkeert verwijdering ook met het luik open, want
`Order.quoteVersionId` is `Restrict`.

### Eén akkoord, nooit twee orders

`quote_approvals.idempotencyKey` is `"<quoteVersionId>:<decision>"` en uniek.
Tweemaal klikken op akkoord levert één beslissing. `orders.quoteVersionId` is
uniek, dus uit één geaccepteerde versie komt nooit meer dan één order. Beide
zijn getest.

## 4. Conventies

- Tabelnamen snake_case via `@@map`, kolomnamen camelCase. `order` is een
  SQL-sleutelwoord, en de importpijplijn gebruikt ruwe SQL met bulk-`COPY`.
- Code, tabel- en kolomnamen in het Engels; de interface in het Nederlands.
- `isDemo` op de hoofdtabellen markeert gezaaide demodata, zodat die veilig op
  te ruimen is en de interface een waarschuwing kan tonen.
- Verwijderregels expliciet: `Cascade` waar een kind zonder ouder zinloos is
  (orderregels, tijdlijn, ontvangsten), `Restrict` waar historie beschermd
  moet worden (klant met orders, leverancier met inkooporders), `SetNull` voor
  verwijzingen naar personen.

## 5. Schaal

Vijf leveranciers via directe koppelingen betekent tienduizenden producten,
honderdduizenden varianten en miljoenen prijsregels (staffels maal
bedruktechnieken). Daarom:

- imports schrijven via staging met bulk-`COPY`, nooit rij-voor-rij;
- verkoopprijzen worden berekend en gecached, niet gematerialiseerd voor
  miljoenen combinaties;
- zoeken eerst met PostgreSQL full-text (GIN en trigram); een aparte
  zoekmachine pas als dat aantoonbaar knelt.
