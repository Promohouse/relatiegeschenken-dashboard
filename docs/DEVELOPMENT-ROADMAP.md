# DEVELOPMENT-ROADMAP

Kleine, uitvoerbare taken met acceptatiecriteria. Per taak geldt de werkwijze
uit CLAUDE.md: zeggen wat er gebouwd wordt, implementeren, tests, draaien,
typecheck en migraties controleren, resultaat en beperkingen melden, committen.

Een fase wordt pas afgesloten na controle en akkoord van de opdrachtgever.

Legenda: ✅ gereed · ◻ te doen · ⏸ wacht op informatie of besluit

---

## Fase 0 — Architectuur en infrastructuur

| | Taak | Acceptatiecriterium |
|---|---|---|
| ✅ | Repository, monorepo, conventies, CLAUDE.md | tests en typecheck draaien |
| ✅ | Eigen databaserol, databases, veiligheidsslot | guard weigert een vreemde database |
| ✅ | Kernschema, migraties, seed, 76 tests | `npm test` groen |
| ✅ | Projectdocumenten | dit document en de zeven andere |
| ✅ | **Offertemodel splitsen** (D-01) | gereed: vijf tabellen, vier triggers, 18 tests die aantonen dat een vastgezette versie niet te wijzigen is en dat één akkoord nooit twee orders oplevert |
| ✅ | `external_references` toevoegen | gereed: twee unieke sleutels, idempotente upsert, 7 tests |
| ✅ | `shipments` en `shipment_items` | gereed: deelzendingen, meerdere adressen, tracking, pakbon; afleidlogica in contracts; 8 tests plus 13 op de logica |
| ✅ | `print_positions` als entiteit | gereed: verplichte verwijzing vanuit bedrukopties, oorspronkelijke leveranciersbenaming bewaard, vastgezette offerteversies ongemoeid |
| ✅ | API-fundament NestJS (3a) | gereed: omgevingsvalidatie met veiligheidsslot, domeinfouten en één foutvorm, Prisma-service, healthcheck, OpenAPI uit Zod op `/docs`; 28 tests |
| ✅ | API-fundament (3b) | gereed: verzoekcontext, auditlogging, nummeruitgifte en prijsengine achter services; 190 tests |
| ✅ | Nummerreeksen en prijsengine achter services | gereed: uitgifte onder rij-lock, teller instelbaar maar nooit omlaag; prijsengine kiest staffel en regel en weigert een prijs zonder regel |
| ✅ | Authenticatie en MFA (ADR-0012) | gereed: better-auth op onze eigen users-tabel, registreren, inloggen, sessiecookie, tweefactor-plugin. Wachtwoordherstel per e-mail wacht op Fase 7 |
| ✅ | Rechten-guard | gereed: sluit dicht bij een route zonder declaratie; getest op 401, 403 en het verschil dat een rol maakt |
| ✅ | Klantscope-extensie | gereed en veilig als standaard: een vreemd id levert niets op, ook niet via findUnique; 10 tests |
| ◻ | Jobqueue: BullMQ op Valkey (ADR-0009) | een taak met retry en dead-letter, zichtbaar en herstartbaar; Valkey draait lokaal. **De planner draait op Europe/Amsterdam**: de ingestelde tijden zijn Nederlandse tijd, en op UTC zou 06:00 in de winter 07:00 worden en in de zomer 08:00 |
| ◻ | Storage-adapter | upload, download, controlewaarde, versie; lokale schijf werkend |
| ⏸ | Docker Compose lokaal | wacht op Docker op de machine |
| ⏸ | Kubernetes, Helm, CI/CD, monitoring | wacht op de hostingantwoorden in DEPLOYMENT.md §2 |

## Fase 1 — CRM en gebruikers

| | Taak | Acceptatiecriterium |
|---|---|---|
| ✅ | End-to-end-tests op inloggen, klanten en gebruikers | 31 Playwright-tests in een echte browser: inloggen, verkeerd wachtwoord, doorsturen en terugkeren, zoeken, filteren, sorteren, uitloggen, en klanten aanmaken, wijzigen en deactiveren |
| ✅ | Basislayout, zijbalk, inlogscherm | gereed: vaste zijbalk die onderscheid maakt tussen gebouwd en in aanbouw, inlogscherm, demowaarschuwing, uitloggen |
| ✅ | Klanten-API | zoeken op naam, nummer, e-mail, btw-nummer en contactpersoon; filteren, sorteren, pagineren; aanmaken met uitgegeven klantnummer; wijzigen met auditverschil; op inactief zetten in plaats van verwijderen |
| ✅ | Klantenoverzicht (scherm) | gereed: zoeken, filteren op actief, sorteren per kolom, pagineren. Werkt zonder JavaScript, want het zijn gewone links en een formulier |
| ✅ | Klantdetail | gegevens, contactpersonen en adressen; afspraken, orders en documenten volgen met die modules |
| ✅ | Contactpersonen beheren | toevoegen, wijzigen, op inactief zetten; hoogstens één hoofdcontact per klant |
| ✅ | Adressen beheren | toevoegen, wijzigen, verwijderen als het adres nergens gebruikt wordt; één standaardadres per soort; Nederlandse postcodes genormaliseerd |
| ✅ | Klanten aanmaken en wijzigen | formulier met foutmeldingen bij het veld zelf, op inactief zetten met bevestiging, knoppen alleen zichtbaar met het juiste recht |
| ✅ | Betalingsvoorwaarden en klantprijzen | gereed: betalingsvoorwaarden als gedeelde lijst met hoogstens één standaard, vervaldatum en aanbetaling berekend in `@rgh/contracts`; klantprijsafspraken met staffel die vóór elke prijsregel gaan, aangetoond tegen de echte database |
| ✅ | Gebruikersbeheer | aanmaken met beginwachtwoord en rollen, wijzigen, op inactief zetten; zelfregistratie geblokkeerd; niemand kan zichzelf of iedereen buitensluiten |
| ✅ | Rollen bewerken | rechten per module en actie aanpasbaar in een raster, met "alles aan/uit" per module; systeemrollen wel aanpasbaar, niet verwijderbaar; een rol die iemand heeft kan niet weg |
| ◻ | Klantgebruikers met klantrollen | alleen een goedkeurder kan goedkeuren; test op de andere rollen |

## Fase 2 — Productbeheer

| | Taak | Acceptatiecriterium |
|---|---|---|
| ◻ | `artwork_assets` | klantlogo's en ontwerpen, herbruikbaar bij herhaalorders |
| ✅ | Productoverzicht en -detail | gereed: zoeken op artikelnummer, naam, merk, variantnummer en leveranciersartikelnummer; filteren op status en leverancier; detail met varianten, inkoopstaffels en bedrukopties. Media volgt met de storage-adapter |
| ◻ | Handmatige invoer | een product volledig aanmaken zonder import |
| ◻ | **CSV/XLSX-import** met diff-review | proefimport toont wijzigingen vóór toepassen; ontbrekende producten worden gemarkeerd, **niet verwijderd** |
| ✅ | Connectorlaag en midocean-koppeling | gereed: versleutelde credentials, connector-register, midocean REST (catalogus, prijzen, voorraad), proefimport die niets wegschrijft, verschillen in `staged_changes`, ontbrekende artikelen als voorstel tot inactief. Toepassen volgt |
| ✅ | Voorraadimport | gereed: standen per variant, twee keer per dag, rechtstreeks weggeschreven zonder beoordeling (ADR-0015); op het productscherm met het tijdstip en de eerstvolgende levering erbij |
| ✅ | Prijsimport (inkoopprijzen en staffels) | gereed: prijzen per variant gekoppeld aan het artikel via de vastgelegde catalogus; verschillende prijzen binnen één artikel worden gemeld en niet gekozen; staffels worden vervangen, niet gestapeld |
| ✅ | Voorgestelde wijzigingen beoordelen en toepassen | gereed: scherm met het verschil per veld, per voorstel toepassen of afwijzen en alles-in-één-keer; een voorstel dat achterhaald is wordt geweigerd; een verdwenen variant gaat op inactief, nooit weg |
| ◻ | Mapping-UI | veld-, categorie-, kleur- en techniekmapping per bron instelbaar |
| ◻ | Veldeigendom | een handmatig gewijzigd veld wordt door geen import overschreven; test |
| ◻ | Leveranciersbeheer | artikelreferenties, inkoopprijzen, levertijden, documenten |
| ⏸ | Leverancier-API-connectoren | wacht op documentatie en credentials per leverancier |

## Fase 3 — Offertes

| | Taak | Acceptatiecriterium |
|---|---|---|
| ✅ | Offertecalculator | gereed: inkoopstaffel, prijsregel of klantafspraak, bedrukking per positie met eigen marge, korting, instelkosten en btw-regime; een handmatige prijs herberekent de werkelijke marge en de berekende prijs blijft zichtbaar. Transport en overige kosten volgen met de offerte zelf |
| ◻ | Offerteversies | een verzonden versie is onveranderlijk; een wijziging maakt een nieuwe versie |
| ◻ | PDF-offerte | logo, bedrijfsgegevens, productafbeeldingen, specificaties, prijzen, levervoorwaarden, akkoordmogelijkheid |
| ◻ | Digitaal akkoord in het portaal | alleen een bevoegde goedkeurder; tweemaal klikken levert één order |
| ◻ | Offertestatussen | concept t/m verlopen, met automatische verloopdatum |

## Fase 4 — Workflow-engine

| | Taak | Acceptatiecriterium |
|---|---|---|
| ◻ | Statusmodellen en definities | de vijf dimensies uit WORKFLOWS.md in de database |
| ◻ | Overgangsmotor met voorwaarden en autorisatie | een status is alleen via de service te wijzigen; test die een directe wijziging elders uitsluit |
| ◻ | Transactional outbox | statuswijziging en gebeurtenis in één transactie; test met een falende publicatie |
| ◻ | Idempotentie en optimistic locking | dubbele gebeurtenis levert één verwerking; twee gelijktijdige goedkeuringen leveren één winnaar |
| ◻ | Retries, dead-letter, lusbescherming | vastgelopen taken zichtbaar en herstartbaar; een zichzelf triggerende overgang wordt geweigerd |
| ◻ | Parallelle orderregels | regel A loopt door terwijl regel B wacht; afgeleide orderstatus en blokkade-aanduiding kloppen |
| ◻ | Afwijkingen | alle gevallen uit WORKFLOWS.md §7, inclusief het vervallen van een goedkeuring bij een materiële wijziging |
| ◻ | Automatiseringsregels | trigger, voorwaarden, acties, sjabloon, wachttijd, per order uitschakelbaar, uitvoeringshistorie |
| ◻ | Herstelproef | worker halverwege gedood, workflow hervat zonder dubbele acties |

## Fase 5 — Ordermanagement

| | Taak | Acceptatiecriterium |
|---|---|---|
| ◻ | Ordersoverzicht | filters per statusdimensie, zoeken, persoonlijke werkoverzichten |
| ◻ | Orderdetailpagina met tabbladen | overzicht, regels, klant, offerte, drukproeven, leveranciers, leveringen, documenten, e-mails, taken, tijdlijn, facturen, betalingen, historie |
| ◻ | Procesweergave | huidige fase, wat af is, wat moet, wie verantwoordelijk is, volgende automatische stap, blokkades |
| ◻ | `order_revisions` | een wijziging na acceptatie is herleidbaar en maakt de juiste goedkeuringen ongeldig |
| ◻ | Dashboard | alle tegels uit de opdracht, doorklikbaar naar de order |
| ◻ | Globale zoekfunctie | klanten, orders, offertes, producten, facturen in één zoekveld |

## Fase 6 — Drukproeven en klantenportaal

| | Taak | Acceptatiecriterium |
|---|---|---|
| ◻ | Drukproef uploaden en versioneren | meerdere versies per orderregel |
| ◻ | Publiceren en klant informeren | automatische overgang naar wachten op akkoord |
| ◻ | Goedkeuring door de klant | bevoegdheidscontrole, exacte bestandsversie, controlewaarde, tijdstip en gebruiker vastgelegd, akkoord onveranderbaar, orderregel automatisch vrijgegeven |
| ◻ | Afkeuring | reden bewaard, status correctie vereist, taak aangemaakt, verantwoordelijke geïnformeerd |
| ◻ | Klantportaal | dashboard, offertes, orders, drukproeven, documenten, facturen, gebruikersbeheer |
| ◻ | Herhaalorders | producten, varianten, posities, artwork en specificaties overgenomen; prijzen, beschikbaarheid en levertijden opnieuw gecontroleerd; bij materiële wijziging nieuwe drukproefgoedkeuring verplicht |

## Fase 7 — Communicatie

| | Taak | Acceptatiecriterium |
|---|---|---|
| ⏸ | Graph-integratie ontwerpen | wacht op antwoord: welke mailboxen, welke permissies |
| ◻ | Uitgaande e-mail via de outbox | geen e-mail buiten een transactie; DEV verzendt uitsluitend naar de testmailbox |
| ◻ | Inkomende e-mail en threads | antwoord aan de juiste order gekoppeld, bijlagen opgeslagen, onbekende berichten handmatig toewijsbaar |
| ◻ | Deduplicatie | dubbele berichtmelding levert één verwerking; test |
| ◻ | Sjablonen en herinneringen | instelbaar, met uitvoeringshistorie |

## Fase 8 — Leveringen en financiën

| | Taak | Acceptatiecriterium |
|---|---|---|
| ✅ | `shipments` en `shipment_items` | gereed in Fase 0 |
| ✅ | Leverstatus | gereed en getest: een deellevering sluit niets af, geannuleerde regels houden een order niet open |
| ⏸ | SnelStart-integratieproef | eerst verifiëren welke API's en abonnementsmogelijkheden er werkelijk zijn |
| ◻ | Verkoopfacturatie | conceptfactuur, regels controleren, factuuradres aanpassen vóór registratie, btw, definitief registreren; geen dubbele facturen, geen stille overschrijving |
| ◻ | Mollie | betaallinks, statussen, mislukt, verlopen, deelbetalingen, terugbetalingen, verrekening van vooruitbetalingen; webhook verifiëren en status ophalen |
| ◻ | **Uitgaven en crediteuren** | zie de aparte tabel hieronder |
| ◻ | Werkelijke marges | gecalculeerd en werkelijk apart; margestatus voorlopig, gedeeltelijk of definitief; geen dubbeltelling |
| ◻ | Rapportages | omzet, marge, orders, per klant en product, openstaande offertes, conversie, vertraagde orders, leveranciersprestaties, debiteuren, crediteuren; export naar CSV en XLSX |

### Uitgaven en crediteuren (verplicht voor livegang)

| | Taak | Acceptatiecriterium |
|---|---|---|
| ◻ | Datamodel uitbreiden | de twaalf entiteiten uit DATABASE.md |
| ◻ | Handmatige upload | PDF of afbeelding, origineel veilig opgeslagen |
| ◻ | Ontvangst per mailbox | inkomende factuurmail gedetecteerd, bijlagen verwerkt, dubbele verwerking voorkomen op mailidentificatie, controlewaarde en factuurkenmerk |
| ◻ | Extractie achter een poort | ruwe extractie, herkende velden met betrouwbaarheid per veld en handmatige correcties apart bewaard; rekenkundige controle op subtotaal, btw en totaal |
| ◻ | Koppeling aan verkooporders | voorstel met bevestiging door een medewerker; één op één, één op meerdere, meerdere op één, regel verdeeld over regels, algemene kosten, creditfacturen |
| ◻ | Factuurcontrole | detailpagina met preview, bedragen, regels, gekoppelde orders, verwacht versus werkelijk, kostenverschil, afwijkingen zichtbaar |
| ◻ | Automatische controles | dubbel, afwijkend IBAN, onbekende leverancier, onbekend ordernummer, afwijkende aantallen of prijzen, ontbrekende gegevens, onverwachte btw, overschrijding van de verwachte inkoop |
| ◻ | Goedkeuringsworkflow | statussen uit WORKFLOWS.md §10; goedkeuring altijd expliciet door een bevoegd persoon; regels instelbaar op bedrag, afwijking en leverancier |
| ◻ | SnelStart-inkoopsynchronisatie | idempotent met externe referentie; een synchronisatiefout levert nooit een duplicaat |
| ◻ | Financiële dashboards | filters en vergelijkingen uit de aanvulling; onderscheid tussen operationele en boekhoudkundige rapportage, met vastgelegde periodedefinities |

## Fase 9 — Migratie en livegang

| | Taak | Acceptatiecriterium |
|---|---|---|
| ◻ | Teamleader-import | veldmapping, validatie, duplicaatdetectie, proefimport, importverslag, herhaalbaar, foutenoverzicht |
| ◻ | Externe referenties bewaren | elk gemigreerd record verwijst naar zijn Teamleader-herkomst |
| ◻ | Migratie start niets | gemigreerde orders versturen geen e-mail en starten geen betaling; test |
| ◻ | End-to-end-tests | de volledige route van aanvraag tot afgeronde order |
| ◻ | Securitycontrole | klantisolatie, autorisatie, documenttoegang |
| ◻ | Back-up- en hersteltest | database én documenten samen teruggezet in een schone omgeving |
| ◻ | Gebruikersacceptatie | de medewerkers voeren hun eigen werk uit op DEV |
| ◻ | Productiedeployment | handmatig goedgekeurd, met de digest die op DEV draaide |

## Fase 10 — Uitbreidingen

| | Taak |
|---|---|
| ◻ | Webshop-API: versiebeheerd, OpenAPI, paginering, authenticatie, rate limiting, idempotency; geen directe databasetoegang |
| ◻ | Leverancier-API-connectoren per leverancier |
| ◻ | Geavanceerde rapportages |
| ◻ | Automatische leveranciersbestellingen, als dat dan gewenst is |
