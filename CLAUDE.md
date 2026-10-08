# CLAUDE.md - Relatiegeschenken Hub

Instructies voor iedere ontwikkelsessie in deze repository. Lees dit eerst.

## Wat dit is

Zelfstandig ERP/CRM voor een relatiegeschenkenbedrijf: 3-5 interne
medewerkers, 100-500 verkooporders per maand, meerdere leveranciers en
drukproeven per order. Langlopend project, modulair uit te breiden.
Geen koppeling met Teamleader of SnelStart in deze fase.

## Harde regels

1. **Module-eigendom.** Een module praat nooit met de tabellen van een andere
   module. Alleen via de geexporteerde service van die module.
2. **Geld nooit als float.** PostgreSQL `NUMERIC`, Prisma `Decimal`. Zie ADR-0005.
3. **Historische prijzen.** Een orderregel kopieert prijzen bij aanmaak naar
   eigen kolommen. Een latere productwijziging raakt bestaande orders nooit.
4. **Rechten op de backend.** De frontend verbergt alleen; de guard beslist.
5. **Klantscope.** Portaalsessies worden altijd op `customerId` begrensd, via
   de Prisma-extensie. Nooit alleen op discipline vertrouwen.
6. **Externe data landt in staging**, nooit rechtstreeks in de eigen catalogus.
   Zie ADR-0004.
7. **Auditlog** op iedere betekenisvolle handeling.
8. **Geen verzonnen endpoints of specificaties.** Eerst de documentatie van de
   leverancier lezen of opvragen. Bij twijfel: zeggen dat het onbekend is.
9. **Nooit gegevens verwijderen zonder expliciete toestemming.** Dat geldt ook
   voor `prisma migrate reset` - zie het veiligheidsslot hieronder.

## Taal

- **UI, teksten, e-mails, documenten: Nederlands.** Via een tekstenlaag, niet
  hardcoded, zodat teksten op een plek beheerd worden.
- **Code, tabel- en kolomnamen, API-velden: Engels.** Anders krijg je
  halfslachtige namen als `orderRegelAantal` naast bibliotheekcode.
- **Domeinbegrippen zonder goede vertaling blijven Nederlands** in de UI:
  drukproef, staffel, instelkosten, orderbevestiging, pakbon.

## Omgeving

- PostgreSQL 16 op poort 5432 wordt **gedeeld met andere projecten** op deze
  machine (`promohouse`, `promohouse_bedrijfskleding`, `voetbalticketskopen`).
  Dit project gebruikt uitsluitend databases met het voorvoegsel
  `relatiegeschenken_` en een eigen databaserol.
- **Veiligheidsslot:** draai nooit een destructief databasecommando zonder
  eerst te controleren dat de databasenaam met `relatiegeschenken_` begint.
- `max_connections` is 100 voor alle projecten samen. Houd de connection pool
  klein (richtlijn: 10 voor de api, 5 voor jobs).
- Poort 3000 is bezet door een ander project. Web = 3100, api = 3101.
- Geen Docker op deze machine. Compose-bestanden staan in `docker/` en worden
  pas getest zodra Docker beschikbaar is.

## Werkwijze per stap

Werk in kleine, controleerbare stappen. Per stap:

1. Zeg wat je gaat bouwen en welke bestanden veranderen.
2. Implementeer.
3. Maak of werk tests bij.
4. Draai de tests.
5. Controleer TypeScript en migraties.
6. Beschrijf het resultaat en de beperkingen.
7. Commit logisch, werk `CHANGELOG.md` bij.

Architectuurbesluiten horen in `docs/architecture/` als ADR. Een ADR wordt
niet herschreven: bij een nieuw inzicht schrijf je een nieuwe die de oude
vervangt (`Vervangt ADR-000X`).

## Openstaande besluiten

Zie de kop "Nog te beslissen" onderaan de betreffende ADR. Op dit moment open:
btw-afrondingsmethode (ADR-0005), formaat van nummerreeksen (ADR-0005),
invulling van partnerprogramma's (ADR-0004), definitieve auth-bibliotheek
(ADR-0003).
