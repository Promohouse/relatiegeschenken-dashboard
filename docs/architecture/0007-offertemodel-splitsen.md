# ADR-0007 - Offertes als eigen aggregaat met onveranderlijke versies

- Datum: 2026-10-28
- Status: geaccepteerd
- Vervangt het offertedeel van ADR-0001 en van het schema uit stap 1a

## Context

In stap 1a zijn offerte en order samengevoegd tot één aggregaat: `orders` met
`kind = QUOTE | ORDER`. De reden was dat de orderdetailpagina het
belangrijkste scherm is en we die niet twee keer wilden bouwen.

De masterprompt vraagt offerteversies, en bij acceptatie expliciet "de exacte
offerteversie bewaren". In het samengevoegde model zouden we dezelfde rijen
versioneren die de order daarna muteert. Het klantakkoord ligt dan niet vast
aan iets onveranderlijks, en juist dat is bij een digitaal akkoord het hele
punt: bij een geschil moet aantoonbaar zijn wát de klant heeft goedgekeurd.

Daarbovenop vragen offerte en order verschillende statusreeksen. Een offerte
kan `VERLOPEN` of `WIJZIGING_GEVRAAGD` zijn; een order niet.

## Besluit

Offertes worden een eigen aggregaat:

```
quotes            kop: klant, contactpersoon, eigenaar, huidige versie
  quote_versions  ONVERANDERLIJK na verzenden: versienummer, totalen,
                  geldigheidsdatum, PDF-verwijzing
    quote_items   regels van die versie, met prijsmomentopname
      quote_item_print_jobs
  quote_approvals akkoord of afwijzing: versie, gebruiker, tijdstip,
                  bestandscontrolewaarde - append-only

orders            ontstaat bij acceptatie, verwijst naar quote_version
  order_lines     overgenomen uit de geaccepteerde versie
```

Regels die dit afdwingt:

1. Een verzonden `quote_version` is niet meer te wijzigen. Een wijziging maakt
   een nieuwe versie.
2. Een `quote_approval` verwijst altijd naar één versie, nooit naar de
   offertekop.
3. Acceptatie is idempotent op de sleutel offerteversie plus beslissing:
   tweemaal klikken levert één order.
4. `orders.kind` verdwijnt, net als de offertestatussen op `orders`.

## Gevolgen

- Het klantakkoord is aantoonbaar gekoppeld aan een onveranderlijk document.
- Twee schermen in plaats van één, maar het offertescherm is eenvoudiger: een
  document met versies en een akkoord, geen procesdossier. De orderdetailpagina
  blijft één scherm.
- Eén migratie en nieuwe offertedemodata. Er is nog geen echte data, dus de
  kosten zijn nu minimaal. Met orders eraan was dit een verbouwing.
- De conversie offerte naar order wordt een expliciete overgang in de
  workflow-engine, met een eigen test.

## Alternatief

Samengevoegd houden. Afgewezen: offerteversies en digitaal akkoord worden dan
een compromis waarbij niet hard te maken is wat de klant goedkeurde.
