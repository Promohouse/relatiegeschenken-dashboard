# Changelog

Alle noemenswaardige wijzigingen aan dit project.
Formaat: [Keep a Changelog](https://keepachangelog.com/nl/1.1.0/).

## [Niet uitgebracht]

### Toegevoegd
- **Offertecalculator** (`/calculator`). Van inkoopstaffel naar verkoopprijs,
  met bedrukking per positie, korting, instelkosten en btw-regime. De uitkomst
  zegt waar de prijs vandaan komt — prijsregel, klantafspraak of handmatig —
  en wat de werkelijke marge is. Er wordt niets opgeslagen: een calculatie is
  een vraag, geen handeling.
- **De calculator rekent bedrukking standaard met de maximale drukmaat.** Bij
  een offerte is het logo meestal nog niet bekend, en een te klein formaat
  levert een te lage prijs op die pas bij de leveranciersfactuur opvalt. Er
  hoeft dus niets meer ingevuld te worden; een kleiner logo kan nog steeds
  ingevuld worden om scherper te offreren, en de uitkomst zegt met welk
  oppervlak gerekend is. Geeft de leverancier geen maximum, dan waarschuwt de
  calculatie zoals voorheen in plaats van met nul te rekenen.
- **De offerte als PDF** (`/api/quotes/{id}/pdf`, knop op het offertescherm).
  Met de teksten uit de sjablonen, de bedrijfsgegevens uit de instellingen in
  drie kolommen onderaan, en de huisstijlkleur als accent. Wat erop komt te
  staan wordt los van het tekenwerk bepaald en is dus getest - de PDF tekent
  alleen.
- Een sjabloonregel waarvan alle velden leeg blijven verdwijnt. Zonder die
  regel staat er "Kleur:" zonder kleur op een offerte die naar een klant gaat.
- **De huisstijlkleur is een instelling** (`company.accentColor`), afgelezen
  uit het logo en te wijzigen bij de bedrijfsgegevens. Controleer hem tegen
  het briefpapier voordat er een offerte uitgaat.
- **Offertescherm** (`/offertes`). Een overzicht met nummer, klant, aantal
  regels, totaal en status; een offerte aanmaken bij een klant; en een
  detailscherm met de regels en de totalen.
- **De calculator opent als venster op de offerte.** Letterlijk dezelfde
  calculator als op het calculatorscherm, niet een nagebouwde: je ziet de
  prijs per stuk, de marge, de staffel en eventuele waarschuwingen, en pas
  als je op toevoegen klikt komt de regel op de offerte. De klant ligt vast
  op die van de offerte, dus zijn prijsafspraken en marge tellen mee zonder
  dat er een andere klant gekozen kan worden.
- Een vastgezette versie toont dat ook, en het toevoegen en verwijderen van
  regels verdwijnt dan uit het scherm. De database weigert het sowieso; dit is
  de beleefde kant ervan.
- **De offerte als document** (`/api/quotes`). Een offerte aanmaken bij een
  klant, regels toevoegen en weghalen, met een nummer uit de reeks
  (`OFF-2026-00001`) en een eerste versie. Een regel is een bewaarde
  calculatie: dezelfde calculator als het scherm rekent hem uit en het
  resultaat gaat naar eigen kolommen, zodat een latere prijswijziging op het
  product een uitgebrachte offerte nooit meer raakt.
- Een vastgezette offerteversie weigert wijzigingen met een melding die te
  plaatsen is. De databasetriggers weigeren het ook, maar hun melding is voor
  een gebruiker niet te lezen.
- **Importmapping voor PF Concept.** De pijplijn verwerkt nu twee soorten
  drukprijslijst. Catalogus, prijzen en voorraad liepen al generiek; de
  drukprijzen van PF landen in twee nieuwe tabellen als opzoektabel over
  formaat, kleuren en aantal. Een nieuwe lijst vervangt de oude per drukcode,
  want een achtergebleven regel zou gekozen kunnen worden en een verkeerde
  prijs geven.
- Het **minimum bedrukkingsaantal** komt mee uit de prijsfeed en staat
  voortaan op de leverancierskoppeling. Onder dat aantal rekent PF een
  toeslag; zonder dat getal is een kleine bedrukte oplage te goedkoop
  berekend.
- **ANDA-connector** (`anda-xml`). Leest hun XML-feeds: catalogus, prijzen,
  voorraad en drukgegevens. Artikelnummers worden op `rootItemNumber`
  gegroepeerd tot één product met varianten, want ANDA kent geen
  variantenblok. Drukprijzen zitten er bewust nog niet in: vier dingen in hun
  prijsopbouw zijn onbeantwoord en een aanname zou verkeerde prijzen
  opleveren (ADR-0018).
- **PF Concept-connector** (`pfconcept-feed`). Leest hun datafeeds v3 in JSON:
  catalogus, prijzen, voorraad, drukgegevens en drukprijzen, met de
  bestandsnamen per taal, afdeling en assortiment. Nog niet tegen echte
  bestanden gedraaid - de feeds zijn niet geactiveerd - maar wel getest tegen
  de voorbeelden uit hun eigen handleiding v3.6.7 (ADR-0019).
- De connectorlaag kent nu twee soorten drukprijslijst. midocean en ANDA geven
  een prijs*structuur* die pas uit te rekenen is als het logoformaat bekend is
  (ADR-0016); PF Concept geeft een opzoektabel die vooraf plat te slaan is.
  Eén vorm voor allebei zou betekenen dat de ene leverancier zich voordoet als
  de andere.
- De geseede koppelingen voor PF Concept en ANDA stonden nog op aannames uit
  het vooronderzoek. Ze volgen nu de handleidingen: PF Concept leest JSON en
  niet XML, ANDA leest feeds en geen REST, en bestellen staat bij beide uit.
  De oude PF-aanname blijft als vervallen regel staan, zodat zichtbaar is dat
  hij bestond.
- **Marges in te stellen** (`/beheer/marges`). Een standaardmarge voor alles,
  en afwijkende regels per klant of per product. Elke regel heeft een marge op
  het artikel én een eigen marge op de bedrukking; laat je die laatste leeg,
  dan volgt het drukwerk het artikel zoals voorheen.
- Een margeregel zegt zelf of zijn percentage een **opslag op de inkoop** of
  een **marge op de verkoopprijs** is (ADR-0017). Die twee werden door elkaar
  gehaald — 110% opslag is 52,38% marge — en stonden allebei onder dezelfde
  naam in het systeem. Het formulier rekent tijdens het typen de andere
  eenheid voor je uit, en de lijst toont altijd het deel van de verkoopprijs.
  Bestaande regels wijzigen niet van gedrag.
- **Drukwerk houdt altijd de normale marge.** Bepaalt een klantprijsafspraak
  of een handmatig bedrag de artikelprijs, dan zakt de marge op de bedrukking
  niet mee: die volgt de marge die de margeregel geeft. Zo blijft het drukwerk
  de plek waar de verzending uit betaald wordt, ook bij een scherpe afspraak.
  Dit maakt af wat ADR-0017 al besloot maar wat alleen werkte als er een
  aparte drukmarge was ingesteld.
- **Verzendwijzen als keuzelijst** onder *Bijdrage verzendkosten* in de
  calculator, met Pakket en Pallet als vertrekpunt. Kiezen vult beide bedragen
  en ze blijven aanpasbaar. De lijst staat in Instellingen, zodat een
  tariefwijziging van de vervoerder geen nieuwe versie van de software vraagt.
  Deze instelling wordt bij een nieuwe seed niet overschreven, anders zou een
  reseed de ingestelde tarieven stilzwijgend terugzetten.
- **Verzendkosten en een bijdrage** in de calculator. De kosten gaan niet naar
  de klant maar drukken wel op de marge, dus staan ze in de inkoopwaarde met
  eronder wat er per saldo wordt toegelegd. Een bijdrage van de klant komt
  eenmalig op de offerte en haalt dat bedrag er weer af.
- Het margeformulier zet de vermenigvuldigingsfactor erbij: &ldquo;60% opslag,
  inkoop × 1,60&rdquo;. Dat is het getal waarmee in deze handel gerekend
  wordt, en het maakt een vergissing tussen de twee grondslagen meteen
  zichtbaar — 60 invullen als marge op de verkoopprijs is geen × 1,60 maar
  × 2,50.
- De standaardmarge in de demogegevens staat op inkoop × 1,6 (60% opslag,
  37,5% van de verkoopprijs), zoals het bedrijf zelf rekent, in plaats van op
  een verzonnen 110%.
- Een klantprijsafspraak raakt de drukmarge niet meer: die gaat over wat een
  stuk kost, niet over wat bedrukken kost. Een scherpe afspraak levert dus
  niet langer ook drukwerk tegen bijna kostprijs op.
- Op de klantpagina staat de eigen marge van die klant naast de
  prijsafspraken, met de weg ernaartoe.
- **Staffel in de calculator.** Eén knop rekent dezelfde regel door voor een
  rij aantallen en zet ze onder elkaar: inkoop per stuk, prijs per stuk, totaal
  en marge. Dat is wat een klant in deze handel vraagt, want de instelkosten
  zijn eenmalig en wegen bij een kleine oplage veel zwaarder per stuk. De
  aantallen staan in de instellingen (`quote.tierQuantities`, standaard 50, 100,
  250, 500 en 1000) en zijn per berekening aan te passen. Een aantal dat niet
  te prijzen is krijgt een eigen melding in zijn regel en laat de rest van de
  tabel staan.
- Een handmatige prijs laat de berekende prijs zichtbaar staan, zodat te zien
  is wat er is weggegeven, en het drukwerk volgt de nieuwe marge in plaats van
  de oude.
- Drukwerk volgt standaard de marge van het artikel, zodat een offerte niet per
  ongeluk bedrukking zonder marge bevat. Een eigen percentage kan.
- De calculator waarschuwt in plaats van te blokkeren: te weinig voorraad bij
  de leverancier (met de stand, het tijdstip en de eerstvolgende levering),
  een inkoopprijs van nul, en een ontbrekende drukstaffel — daar wordt geen
  prijs verzonnen maar om een handmatig bedrag gevraagd.
- **Voorraadimport.** Standen per variant, met de eerstvolgende twee verwachte
  leveringen. Op het productscherm staat per variant het aantal met erbij hoe
  oud die stand is, en in de kop de opgetelde voorraad.
- Voorraad gaat **buiten de beoordeling om** (ADR-0015). Dat is een bewuste
  uitzondering op ADR-0004: een voorraadstand is een meting en geen eigenschap,
  hij overschrijft niets van ons, en bij twee ophaalmomenten per dag zou
  goedkeuren een ritueel worden dat de voorstellen die er wél toe doen laat
  ondersneeuwen.
- "Onbekend" en "nul" zijn in het scherm uit elkaar gehouden: een variant
  waarvoor de leverancier niets meldde staat op *onbekend*, nul op voorraad
  staat in rood. Dat verschil is bij het offreren precies het verschil dat
  telt.
- **Productcatalogus in het scherm** (`/producten`). Zoeken op artikelnummer,
  naam, merk, variantnummer en leveranciersartikelnummer; filteren op status en
  leverancier; sorteren en pagineren. Het detail toont kenmerken, varianten met
  kleurcode en EAN, de inkoopstaffels per leverancier en de bedrukopties.
  Daarmee is zichtbaar wat een import binnenbrengt, in plaats van dat het in de
  database blijft steken.
- Een product zonder inkoopprijs wordt als zodanig gemarkeerd, in het overzicht
  en op het detail, met de reden erbij: zonder prijs weigert de calculatie een
  verkoopprijs te bepalen.
- **Prijsimport**: inkoopprijzen en staffels uit `pricelist/2.0`, met dezelfde
  beoordelingsstap als de catalogus. In het scherm staan de oude en nieuwe
  staffel naast elkaar.
- Daarbij één ongemak eerlijk afgehandeld: midocean prijst **per variant**,
  onze catalogus houdt één inkoopprijs **per leveranciersartikel** aan. Kosten
  de kleuren van een artikel verschillend, dan wordt er niets gekozen — het
  komt als fout op die regel te staan mét de bedragen, zodat iemand het kan
  bekijken. Eén prijs verzinnen is precies het soort stille aanname dat pas in
  een marge opduikt.
- Staffels worden bij het toepassen **vervangen**, niet samengevoegd: een
  drempel die de leverancier niet meer levert hoort te verdwijnen. Dat mag,
  anders dan bij producten, omdat een order zijn prijzen bij aanmaak kopieert.
- Script om credentials van een koppeling versleuteld op te slaan
  (`npm run connection:credentials -w @rgh/api`). De waarde komt uit een
  omgevingsvariabele en niet uit een argument, want een argument belandt in de
  shell-geschiedenis en in de procestabel. Na opslaan volgt een terugleesproef,
  zonder de waarde te tonen.
- **Beoordelingsscherm voor imports** (`/imports`). Per voorstel staat er wat
  er verandert, veld voor veld, met de oude en de nieuwe waarde naast elkaar.
  Toepassen of afwijzen kan per regel of in één keer voor de hele import.
  Het scherm toont ook per koppeling welke capabilities er zijn, en streept
  door wat gedocumenteerd is maar niet gebouwd — bestellen dus.
- **Toepassen raakt pas nu de catalogus**, met vier waarborgen: een
  proefimport is niet toe te passen (die legt de brongegevens niet vast); een
  voorstel waarvan het veld sinds de import door iemand anders is gewijzigd
  wordt geweigerd in plaats van dat werk te overschrijven; een variant die uit
  de bron verdwijnt gaat op inactief en nooit weg; en elke toepassing komt in
  het auditlog met de vermelding uit welke import hij kwam.
- Een nieuw product uit een import wordt opgebouwd uit de vastgelegde
  brondata, opnieuw vertaald door dezelfde connector die hem ophaalde. Wat in
  de catalogus komt is daarmee altijd terug te voeren op wat de leverancier
  werkelijk stuurde.

- **De connectorlaag.** Een koppeling haalt op en vertaalt naar één neutrale
  vorm; wegschrijven doet de importpijplijn. Credentials staan versleuteld in
  de database (AES-256-GCM met een eigen salt per rij), niet in de code of in
  `.env` per leverancier — een gewijzigde rij ontsleutelt niet maar faalt.
- **midocean-connector**: catalogus, prijzen en voorraad, getest tegen de
  voorbeeldantwoorden uit hun eigen handleiding. De foutmeldingen uit hun
  Appendix C zijn vertaald naar iets bruikbaars: een 401 kan ook betekenen dat
  de sleutel niet geabonneerd is op dat endpoint, en een 503 op de
  testomgeving is 's avonds normaal en geen storing.
- **Importpijplijn met proefimport.** Standaard verandert een import niets: hij
  haalt op, vergelijkt en toont wat er zou veranderen. Een echte import legt
  alleen de ruwe leveranciersdata vast; de catalogus wijzigt pas na
  beoordeling (ADR-0004). Een artikel dat uit de bron verdwijnt levert een
  voorstel op om het op inactief te zetten — een import verwijdert nooit een
  product (harde regel 12).
- Twee veiligheidsgrenzen in die pijplijn: een koppeling die naar de
  productieomgeving van de leverancier wijst wordt geweigerd op een
  niet-productieomgeving, en een mislukte import wordt vastgelegd met de reden
  in plaats van stil te vallen.
- Productkenmerken die leveranciers aanleveren: materiaal, afmetingen, land van
  herkomst, goederencode en bedrukbaarheid op het product; kleurcode,
  kleurgroep en Pantone-aanduiding op de variant.
- **midocean-koppeling vastgelegd op hun eigen documentatie.** De officiele
  handleiding (v1.12.2) is ontvangen en verwerkt in
  `docs/leveranciers/midocean.md` en ADR-0013. Daarmee is de koppeling voor het
  eerst bouwbaar zonder aannames. Belangrijkste correctie op het onderzoek van
  8 oktober: **SFTP bestaat niet meer**, midocean heeft die dienst in 2025
  uitgezet; alles loopt via REST.
- **`parseSupplierDecimal()`**: bedragen uit leveranciersdata komen als tekst
  met een decimale komma (`"4,22"`). `parseFloat` maakt daar stilzwijgend `4`
  van - geen afrondingsfout maar een factor, die pas in de marge opvalt. Alle
  binnenkomende bedragen lopen nu door één functie die weigert te gokken, ook
  bij duizendtalnotaties.
- **Drukprijsberekening van midocean** in `@rgh/contracts`: vier prijstypes
  (per positie, per kleur, per oppervlak, per oppervlak én kleur), setup per
  kleur of per positie, handling per stuk, staffels, herhaalorders en de witte
  onderlaag bij techniek ST. De vier doorgerekende voorbeelden uit hun
  Appendix F staan als test, dus een afwijking van midocean's eigen uitkomst
  valt hier op en niet op hun factuur. Twee inconsistenties in die appendix
  zijn niet weggepoetst maar vastgelegd en staan op de vragenlijst.
- Bestellen bij midocean is **voorbereid maar niet gebouwd**: de capabilities
  `PLACE_ORDER` en `ORDER_STATUS` staan op de verbinding en zijn uitgezet, met
  een verwijzing naar ADR-0013. Er is bewust geen code die een order naar een
  leverancier kan sturen.

- **Betalingsvoorwaarden.** Een gedeelde lijst (`30 dagen netto`, `einde maand
  plus 30`, `50% vooruit`) waaruit klanten kiezen, met hoogstens één standaard,
  afgedwongen door een partiele unieke index in de database. De
  vervaldatum en de aanbetaling worden berekend in `@rgh/contracts`, in UTC en
  per dag, zodat de overgang naar zomertijd de vervaldag niet verschuift. Een
  voorwaarde die klanten hebben kan niet weg en niet op inactief; de standaard
  kan niet uitgezet worden zonder een andere aan te wijzen.
- **Klantprijsafspraken.** Een afgesproken bedrag per stuk vanaf een aantal,
  met staffel en geldigheidsvenster. Een afspraak gaat vóór op elke prijsregel,
  ongeacht `priority`: een toezegging is geen rekenvoorkeur. Ligt de afspraak
  onder de inkoopprijs, dan wordt de prijs gewoon gebruikt maar draagt de
  uitkomst `belowCost`, zodat verliesgevend verkopen een keuze is en geen
  ongeluk. In het klantscherm staat per afspraak of hij vandaag meedoet, via
  dezelfde functie die de calculatie gebruikt.
- Begin van de productmodule: producten zoeken op artikelnummer of naam, voor
  de productkiezer in het afsprakenformulier. Volledig productbeheer is Fase 2;
  deze service bestaat nu al zodat de klantmodule niet in de producttabel hoeft
  te kijken (harde regel 1).

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

### Gewijzigd
- **De middleware stuurde ook afbeeldingen naar het inlogscherm.** De
  beeldoptimalisatie van Next haalt een bronbestand zelf op, zonder
  sessiecookie, en kreeg dan een omleiding in plaats van een plaatje. Het
  logo verscheen daardoor niet, terwijl de pagina verder klopte. Bestanden uit
  `public` lopen nu buiten de middleware om.
- **De seed koos "het eerste demoproduct" uit een query zonder sortering.** Na
  de echte import veranderde die volgorde, en maakte een tweede seedronde
  dezelfde demo-prijsafspraken op een ander product aan. De demoquery's
  sorteren nu op artikelnummer.
- **Drie fouten in de drukprijsberekening, gevonden door de echte prijslijst
  te vergelijken met de handleiding.** Alle drie zouden ze een verkeerde prijs
  hebben gegeven: de indicator voor een goedkopere vervolgkleur blijkt
  `"true"`/`"false"` te bevatten en niet `"X"`; staffeldrempels dragen een
  duizendtalpunt, zodat `"1.000"` als 1 gelezen werd en de scherpste prijs al
  bij één stuk zou gelden; en er bestaat een vijfde prijstype dat niet in de
  handleiding staat.
- **De calculator zoekt een product in plaats van het uit een lijst te kiezen.**
  Met 2790 artikelen is een keuzelijst onbruikbaar; bovendien toonde die
  alleen de eerste honderd. Nu typ je een artikelnummer of naam. Is er precies
  één artikel met dat nummer, dan wordt dat meteen gekozen — intypen en verder,
  in plaats van zoeken, kiezen, laden.
- De productkiezer is nu één component, gedeeld met het prijsafsprakenscherm.
  Vanaf een productpagina is er een knop **Doorrekenen** die de calculator met
  dat product opent.
- **Lezen uit de productieomgeving van een leverancier mag nu ook buiten
  productie.** De eerdere regel weigerde dat helemaal. Dat bleek te streng: een
  catalogus lezen raakt geen klant, geen betaling en geen factuur — waar harde
  regel 18 over gaat — en midocean geeft alleen een productiesleutel uit
  zolang er geen testsleutel is aangevraagd. Alles wat bij de leverancier iets
  zou kunnen veranderen blijft geweigerd, en daar bestaat bovendien geen
  connector voor.
- **De inkoop van drukwerk telt mee in de marge.** De regelberekening nam
  alleen de inkoopprijs van het artikel mee; de kosten van bedrukken telden
  wel in de verkoop maar niet in de inkoop. Daardoor viel de marge te hoog uit,
  en bij een order met meerdere drukposities liep dat snel op.
- Voorraad van midocean wordt twee keer per dag opgehaald in plaats van elk
  uur: een voorraadstand per uur is voor dit werk niet nodig.
- **Een fout van een leverancier geeft 502 in plaats van 500.** Bij de eerste
  echte poging met een midocean-sleutel verdween onze zorgvuldig geschreven
  uitleg achter "er is een onverwachte fout opgetreden". Een leverancier die
  weigert is geen storing van ons: `ConnectorError` is nu een domeinfout, dus
  de melding komt bij de gebruiker terecht, met de bron en de statuscode van
  de leverancier als details.
- **De importvergelijking draait nu altijd** (ADR-0014, corrigeert ADR-0013).
  Eerst besliste de hash van de leveranciersdata of er überhaupt vergeleken
  werd. Dat mist twee gevallen: een artikel dat pas later aan een eigen product
  gekoppeld wordt, en een wijziging die aan onze kant is gemaakt. In beide
  gevallen verdween het voorstel voorgoed. Nu bepaalt de hash alleen of de
  ruwe payload opnieuw wordt vastgelegd, en betekent "ongewijzigd" in de
  uitslag: er is geen verschil tussen de bron en onze catalogus.
- **Wijzigingsschema's laten weggelaten velden nu echt weg.** `.partial()` in
  Zod maakt een veld optioneel maar laat `.default()` staan: een PATCH met
  alleen een naam zette daardoor ook `endOfMonth`, `sort` en de standaardvlag
  terug op hun beginwaarde. Dat haalde in de test de standaard onder een
  betalingsvoorwaarde vandaan. De wijzigingsschema's staan nu met de hand
  uitgeschreven, met een test die het vastlegt.
- **Een geschonden check-constraint geeft 422 in plaats van 500.** Een einddatum
  vóór de begindatum leverde een serverfout op; nu komt er een melding bij het
  veld, met de databasecontrole als achtervang. De naam van de constraint gaat
  het logboek in, niet het antwoord.
