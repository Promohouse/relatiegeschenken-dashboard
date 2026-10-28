# Changelog

Alle noemenswaardige wijzigingen aan dit project.
Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).

## [Niet uitgebracht]

### Toegevoegd
- Rollen bewerken vanuit het scherm: een raster van module tegen actie, met
  per module een "alles aan/uit", en een teller die zegt hoeveel van de 84
  rechten aanstaan. Daarmee is "rechten configureerbaar zonder nieuwe versie
  van de software" ook echt waar in de interface. De sleutel van een rol ligt
  vast zodra hij bestaat, want hij staat in de code. Systeemrollen zijn wel
  aan te passen maar niet te verwijderen, een rol die aan iemand is toegekend
  kan niet weg, en een wijziging waarna niemand meer gebruikers kan beheren
  wordt teruggerold. Het auditlog vermeldt per wijziging welke rechten erbij
  kwamen en welke eraf gingen. 120 api-tests, 37 e2e-tests.
- Gebruikersbeheer: aanmaken met een beginwachtwoord en rollen, wijzigen, op
  inactief zetten, en een overzicht van de rollen met hun aantal rechten.
- **Zelfregistratie geblokkeerd.** De registratieroute van better-auth stond
  open: een willekeurige buitenstaander kon een account aanmaken en inloggen.
  Rechten kreeg hij niet, maar op een intern systeem hoort die route dicht.
- Twee uitsluitbeveiligingen: je kunt jezelf niet op inactief zetten, en een
  wijziging waarna niemand meer gebruikers kan beheren wordt teruggerold.
  248 tests.
- Contactpersonen en adressen beheren vanuit het scherm. Hoogstens één
  hoofdcontact per klant en één standaardadres per soort, allebei door de
  service geregeld in plaats van door het formulier. Nederlandse postcodes
  worden gecontroleerd en genormaliseerd naar 1234 AB; buitenlandse blijven
  zoals ze zijn. Een adres dat aan een order, offerte of zending hangt kan
  niet verwijderd worden, met vermelding waar het gebruikt wordt. 259 tests.
- Klanten aanmaken en wijzigen vanuit het scherm, met foutmeldingen bij het
  veld waar ze horen, en op inactief zetten met een bevestiging die zegt dat
  er niets verloren gaat. Knoppen verschijnen alleen bij het juiste recht.
- End-to-end-tests met Playwright: tien tests die in een echte browser
  inloggen via het formulier, een verkeerd wachtwoord afhandelen, doorsturen
  en terugkeren, zoeken, filteren, sorteren en uitloggen. Daarmee is ook het
  formulier zelf aangetoond, niet alleen de inlogroute erachter.
- Dashboard-applicatie (`apps/web`): inlogscherm, vaste zijbalk die gebouwde
  en nog niet gebouwde modules uit elkaar houdt, klantenoverzicht met zoeken,
  filteren, sorteren en pagineren, en een klantdetailpagina met
  contactpersonen en adressen. Draait op poort 3100 en zet /api door naar de
  api, zodat de sessiecookie op één domein blijft.
- `/api/me` geeft de ingelogde gebruiker met zijn rechten, zodat de interface
  alleen toont wat die persoon mag.
- Klantenmodule in de api: zoeken, filteren, sorteren en pagineren, aanmaken
  met een door het systeem uitgegeven klantnummer, wijzigen met auditverschil,
  en op inactief zetten in plaats van verwijderen. Nederlandse btw-nummers
  worden op vorm gecontroleerd, buitenlandse niet. 222 tests.
- Demo-accounts met wachtwoord (`npm run db:seed`), zodat er op DEV ingelogd
  kan worden.
- Authenticatie met better-auth 1.7.14 (ADR-0012): registreren, inloggen,
  sessiecookie en de tweefactor-plugin, op onze eigen users-tabel in plaats
  van een tweede gebruikersadministratie.
- Rechten-guard op `module:actie` die dichtslaat bij een route zonder
  declaratie, en klantisolatie die standaard aanstaat: tijdens een
  portaalsessie begrenst elke query zich op de eigen klant, ook bij een
  zoekopdracht op id. 211 tests.
- Prijsengine: van inkoopstaffel naar verkoopprijs, met regels op klant,
  product, kanaal, categorie, leverancier of algemeen. `priority` bepaalt wat
  wint; zonder toepasselijke regel wordt er geen prijs bepaald in plaats van
  teruggevallen op de inkoopprijs (D-11).
- Nummeruitgifte achter een service: uitgifte onder rij-lock, vooruitkijken
  zonder verbruiken, teller en formaat instelbaar maar nooit omlaag.
- Verzoekcontext en auditlogging: wie deed wat vanaf welk adres, met een
  verschil-helper die alleen gewijzigde velden bewaart. Een hapering in het
  logboek laat de handeling zelf nooit mislukken.
- API-fundament in NestJS (`apps/api`): omgevingsvalidatie die bij het
  opstarten faalt met een leesbare melding en het databasevoorvoegsel
  afdwingt, domeinfouten met één uniforme foutvorm, Prisma-service,
  healthcheck op `/api/health` en OpenAPI op `/docs` gegenereerd uit de
  Zod-schema's. 150 tests.
- ADR-0011: Zod als enige bron voor validatie, types en documentatie, en de
  valkuil rond decorator-metadata in runtime en tests.
- Uitgaande zendingen (`shipments`, `shipment_items`) met deelleveringen,
  meerdere afleveradressen, tracking en pakbonnen. LogisticsStatus is uitgaand
  gemaakt; de statussen worden afgeleid uit de zendingen en een deellevering
  leidt nooit tot afronding. 122 tests.
- `external_references` voor herkomst en idempotente synchronisatie met
  Teamleader, SnelStart, Mollie en Graph.
- `print_positions` als genormaliseerde entiteit, met de oorspronkelijke
  leveranciersbenaming bewaard en vastgezette offerteversies ongemoeid.
- ADR-0010: deployment op Decorsign K3s via ArgoCD, met de risico's rond de
  gedeelde PostgreSQL en de ontbrekende back-upstrategie vastgelegd.
- Offertes als eigen aggregaat (ADR-0007): quotes, quote_versions,
  quote_items, quote_item_print_jobs en quote_approvals, met vier
  databasetriggers die onveranderlijkheid afdwingen en een expliciet
  ontsnappingsluik voor beheer. Orders verwijzen via quoteVersionId naar de
  geaccepteerde versie; orderregels houden hun herkomst vast. 94 tests.
- BullMQ op Valkey als jobqueue (ADR-0009), Valkey lokaal draaiend.
- NestJS bevestigd als backendframework (ADR-0008).
- Fase 0 documentatie op basis van de masterprompt: MASTERPLAN.md,
  ARCHITECTURE.md, DATABASE.md, WORKFLOWS.md, SECURITY.md, DEPLOYMENT.md,
  DEVELOPMENT-ROADMAP.md en DECISIONS.md. CLAUDE.md uitgebreid met tien
  nieuwe harde regels.
- Ontwerp van de centrale workflow-engine: vijf statusdimensies, afgeleide
  orderstatus, parallelle orderregels, transactional outbox, idempotentie,
  optimistic locking en de workflow voor inkoopfacturen.
- Besluitenregister D-01 t/m D-10 met de verschillen tussen de masterprompt
  en de opdracht van 8 oktober.
- Stap 1b: staging- en connectortabellen met capability-routing per
  leverancier, drukproeven met versies en goedkeuringshistorie, inkoop met
  deelontvangsten, voorbereide inkoopfacturen met dubbelherkenning, en
  kanalen met prijsregels, partnerfeeds en API-sleutels. Tweede migratie,
  23 nieuwe tabellen (58 totaal). Seed uitgebreid met de koppelconfiguratie
  van de vijf leveranciers, alle inactief. 76 tests.
- `packages/contracts`: hash-vergelijking voor imports, API-sleutelhashing,
  inkooplogica voor deelontvangsten.
- `packages/db`: capability-routing en hash-controle voor connectoren.
- Stap 1a: eigen databaserol en databases, veiligheidsslot op destructieve
  databasecommando's, Prisma-opzet en het kernschema (34 tabellen) met eerste
  migratie, seed met gemarkeerde demodata, en 24 tests.
- `packages/db`: Prisma-client met pg-adapter, nummerreeksen met rij-lock.
- `packages/contracts`: geld- en btw-logica op decimal.js.
- ADR-0006 Prisma 7 en versievastzetting.
- Repository, monorepo-skelet en basisconfiguratie (stap 0).
- ADR-0001 t/m ADR-0005: architectuurbesluiten vastgelegd.
- Onderzoek naar koppelmogelijkheden van midocean, Toppoint, PF Concept,
  Clipper en Anda in `docs/leveranciers/koppelingen.md`.
