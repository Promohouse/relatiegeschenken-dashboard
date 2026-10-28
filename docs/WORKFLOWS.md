# WORKFLOWS — de centrale workflow-engine

Dit is de kernfunctie van het platform. Na iedere afgeronde stap, bevestiging
of goedkeuring zet het systeem de order zelf door. Medewerkers hoeven na een
actie geen status meer bij te werken.

## 1. Uitgangspunten

1. **Eén engine.** Statussen worden uitsluitend door de workflow-service
   gezet. Geen controller, geen scherm, geen los endpoint, geen directe
   database-update.
2. **Statussen per orderregel.** De order heeft geen eigen procesfase; die
   wordt afgeleid uit zijn regels.
3. **Configureerbaar, niet hardgecodeerd.** Overgangen staan in
   `workflow_definitions`, `workflow_states` en `workflow_transitions`, zodat
   een proceswijziging geen code-release vraagt.
4. **Automatisch doorzetten is niet hetzelfde als automatisch handelen.** De
   engine mag een taak klaarzetten, een status wijzigen en een e-mail in de
   wachtrij zetten. Hij plaatst geen bestelling bij een leverancier, boekt
   niets definitief in SnelStart en simuleert nooit een klantgoedkeuring.
5. **Geen stap zonder spoor.** Iedere overgang levert een
   `workflow_events`-rij en een leesbare `order_events`-rij.

## 2. Vijf statusdimensies

Eén statusveld kan dit proces niet dragen: een regel kan tegelijk goedgekeurd
op drukproef, besteld bij de leverancier en deels geleverd zijn.

| Dimensie | Niveau | Waarden |
|---|---|---|
| **Commercieel** | offerte | `CONCEPT`, `KLAAR_VOOR_VERZENDING`, `VERZONDEN`, `WACHT_OP_KLANT`, `WIJZIGING_GEVRAAGD`, `GEACCEPTEERD`, `AFGEWEZEN`, `VERLOPEN` |
| **Hoofdstatus** | order | `CONCEPT`, `ACTIEF`, `AFGEROND`, `GEANNULEERD` — afgeleid |
| **Drukproef** | orderregel | `NIET_NODIG`, `AANGEVRAAGD`, `ONTVANGEN`, `NAAR_KLANT`, `WACHT_OP_AKKOORD`, `GOEDGEKEURD`, `CORRECTIE_VEREIST` |
| **Inkoop** | orderregel | `NIET_VRIJGEGEVEN`, `KLAAR_OM_TE_BESTELLEN`, `EXTERN_BESTELD`, `WACHT_OP_BEVESTIGING`, `BEVESTIGD`, `IN_PRODUCTIE`, `GEREED`, `VERTRAAGD`, `GEANNULEERD` |
| **Logistiek** | orderregel | `GEEN`, `VERWACHT`, `VERZENDING_VOORBEREID`, `VERZONDEN`, `DEELS_GELEVERD`, `GELEVERD` |
| **Financieel** | order | `NIET_FACTUREERBAAR`, `VOORUITBETALING_GEVRAAGD`, `VOORUITBETALING_ONTVANGEN`, `GEREED_VOOR_FACTURATIE`, `CONCEPTFACTUUR`, `GEFACTUREERD`, `DEELS_BETAALD`, `BETAALD`, `ACHTERSTALLIG`, `GECREDITEERD` |

De financiële dimensie loopt **parallel**, niet aan het eind: een
vooruitbetaling kan gevraagd worden voordat er een drukproef is.

## 3. Afgeleide orderstatus

De order toont wat er werkelijk aan de hand is, niet de laagste of hoogste
status van een willekeurige regel:

```
geen regels                                  -> CONCEPT
alle regels GEANNULEERD                      -> GEANNULEERD
alle regels GELEVERD en financieel BETAALD   -> AFGEROND
anders                                       -> ACTIEF
```

Daarnaast bepaalt de engine per order een **blokkade-aanduiding** voor het
dashboard en de orderkaart: de reden waarom de order niet verdergaat.
Bijvoorbeeld "2 van 4 regels wachten op klantakkoord drukproef" of "regel 3:
leverancier vertraagd". Dit is een berekende weergave, geen opgeslagen status.

## 4. Anatomie van een overgang

Iedere overgang bestaat uit dezelfde negen onderdelen. Zonder dit stramien
krijg je verspreide, half-gecontroleerde statuswijzigingen.

| Onderdeel | Betekenis |
|---|---|
| **Trigger** | de gebeurtenis: klantakkoord, upload, registratie, webhook, tijdsverloop |
| **Voorwaarden** | bewaakte condities; faalt er één, dan geen overgang en een leesbare reden |
| **Autorisatie** | wie dit mag: medewerkerrol, bevoegde klantgebruiker, systeem |
| **Acties** | wat er gebeurt binnen dezelfde databasetransactie |
| **Nieuwe status** | per dimensie, op het juiste niveau |
| **Automatische taken** | wat er voor wie klaargezet wordt |
| **E-mails** | via de outbox, nooit rechtstreeks |
| **Auditregistratie** | wie, wat, wanneer, van welke waarde naar welke |
| **Foutafhandeling** | wat er gebeurt als een actie faalt: terugrollen, opnieuw proberen, of naar de dead-letter-wachtrij |

Overgangen worden geclassificeerd, want dat bepaalt of de engine zelf mag
handelen:

- **automatisch** — de engine voert uit;
- **medewerkeractie vereist** — de engine zet een taak klaar en wacht;
- **klantakkoord vereist** — de engine wacht op een bevoegde klantgebruiker;
- **financiële controle vereist** — de engine wacht op een bevoegde
  goedkeurder.

## 5. Standaardroute

Een route, geen rigide keten: regels lopen parallel en facturatie kan eerder.

```
nieuwe aanvraag
  └─ offerte opstellen ........................ medewerker
     └─ offerte versturen ...................... medewerker
        └─ wacht op klantakkoord
           ├─ afgewezen ......................... einde, reden vastgelegd
           ├─ wijziging gevraagd ............... nieuwe offerteversie
           └─ GEACCEPTEERD ..................... klant, bevoegd
              └─ order aanmaken ................ AUTOMATISCH
                 └─ ordergegevens controleren ... medewerker
                    └─ per orderregel:
                       drukproef aanvragen of bestaande bedrukking bevestigen
                        └─ drukproef uploaden ... medewerker
                           └─ publiceren + naar klant .... AUTOMATISCH
                              └─ wacht op akkoord
                                 ├─ afgekeurd ... taak, nieuwe versie
                                 └─ GOEDGEKEURD ...... klant, bevoegd
                                    └─ regel vrijgeven voor bestellen .. AUTOMATISCH
                                       └─ extern bestellen ... medewerker, BUITEN systeem
                                          └─ registreren als geplaatst .. medewerker
                                             └─ wacht op leveranciersbevestiging .. AUTOMATISCH
                                                └─ bevestiging geregistreerd .. medewerker
                                                   └─ productie / leverbewaking .. AUTOMATISCH
                                                      └─ verzonden / (deels) geleverd
                 └─ parallel: facturatie en betaling
                    └─ order administratief afgerond .. AUTOMATISCH
```

## 6. Parallelle orderregels

Artikel A mag doorlopen terwijl artikel B op een nieuwe drukproef wacht.
Uitzondering: wanneer een expliciete orderregel of commerciële afspraak
gezamenlijke verwerking vereist — dat wordt vastgelegd als een
`gezamenlijk_verwerken`-vlag op de order, met de reden erbij, en de engine
houdt dan alle regels tegen tot de laatste klaar is.

Voorbeeld van een geldige toestand binnen één order:

| Regel | Drukproef | Inkoop | Logistiek |
|---|---|---|---|
| A | `GOEDGEKEURD` | `EXTERN_BESTELD` | `VERWACHT` |
| B | `CORRECTIE_VEREIST` | `NIET_VRIJGEGEVEN` | `GEEN` |
| C | `NIET_NODIG` | `BEVESTIGD` | `DEELS_GELEVERD` |

De orderstatus is `ACTIEF`, de blokkade-aanduiding noemt regel B.

## 7. Afwijkingen

Alle gevallen uit de opdracht zijn eersteklas overgangen, geen uitzonderingen
die in de interface opgelost worden: drukproef afgekeurd, nieuwe
drukproefversie, klant wijzigt aantallen, product niet beschikbaar,
leverancier vertraagd, leverancier annuleert, order gedeeltelijk geannuleerd,
leverdatum gewijzigd, deellevering, verkeerd afleveradres, betaling mislukt,
vooruitbetaling ontbreekt, factuurcorrectie, retour of klacht, herhaalorder,
handmatige interventie.

**Regel die hier bovenuit gaat:** maakt een wijziging een bestaande
goedkeuring ongeldig, dan vervalt die goedkeuring en vraagt het systeem
opnieuw om akkoord. Een gewijzigd aantal, een ander product of een andere
bedrukking maakt de drukproefgoedkeuring ongeldig. Dat wordt expliciet
vastgelegd per overgang — niet beoordeeld door wie op het moment zelf toevallig
in het scherm zit.

Handmatige interventie is toegestaan en wordt altijd als zodanig gelogd: wie,
wanneer, welke overgang geforceerd, met welke reden. Een geforceerde overgang
slaat voorwaarden over maar nooit de autorisatiecontrole.

## 8. Techniek

**Transactional outbox.** Statuswijziging en gebeurtenis gaan in dezelfde
databasetransactie. Een worker leest `outbox_events` en publiceert. Daarmee
bestaat de toestand "status gewijzigd maar e-mail nooit verstuurd" niet, en
"e-mail verstuurd terwijl de transactie terugrolde" ook niet.

**Idempotentie.** Iedere gebeurtenis heeft een sleutel. Tweemaal op akkoord
klikken, een dubbele Mollie-webhook, een dubbele Graph-melding of een
herstarte worker leidt tot één verwerking. Bij offerteacceptatie is de sleutel
de offerteversie plus de beslissing, zodat er nooit twee orders uit één
akkoord ontstaan.

**Optimistic locking.** Orders, orderregels en inkoopfacturen krijgen een
versieteller. Twee gelijktijdige goedkeuringen leveren één winnaar en voor de
ander een duidelijke melding.

**Retries, backoff, dead-letter.** Mislukte taken gaan niet verloren en
herhalen niet eeuwig. De dead-letter-wachtrij is een scherm, geen logbestand:
vastgelopen taken moeten zichtbaar en herstartbaar zijn.

**Eventversies.** `workflow_events` heeft een schemaversie, zodat de
verwerking van oude gebeurtenissen na een wijziging blijft werken.

**Lusbescherming.** Een overgang die binnen dezelfde verwerkingsketen
zichzelf opnieuw triggert wordt geweigerd en gelogd. De engine houdt per keten
een teller bij en stopt bij een ingestelde diepte.

**Herstelbaarheid.** Na een storing moet de engine zijn werk kunnen hervatten
op basis van de outbox en de gebeurtenissenstroom, zonder dubbele acties. Dat
wordt getest met een worker die halverwege wordt gedood.

## 9. Automatiseringsregels

Naast de vaste overgangen zijn er instelbare regels, met trigger, voorwaarden,
acties, e-mailsjabloon, wachttijd, uitschakelbaar per order, handmatig
opnieuw uitvoerbaar, met foutmeldingen en uitvoeringshistorie.

Typische regels: nieuwe offerteaanvraag, offerte geaccepteerd, drukproef
nodig, drukproef afgekeurd of goedgekeurd, leveranciersbestelling plaatsen,
leveranciersbevestiging ontbreekt na N dagen, leverdatum nadert, levering
vertraagd, factuur klaarzetten, betaling ontvangen, factuur vervallen.

Een automatiseringsregel mag een goedkeuring nooit vervangen.

## 10. Workflow voor inkoopfacturen

Dezelfde engine, eigen definitie.

```
ONTVANGEN (upload of mailbox)
  └─ WORDT_UITGELEZEN ......................... AUTOMATISCH
     └─ validaties: rekenkundig, dubbel, IBAN, leverancier, order
        ├─ CONTROLE_VEREIST .................. bij lage zekerheid of afwijking
        ├─ KOPPELING_VEREIST ................. order onbekend of onzeker
        └─ KLAAR_VOOR_GOEDKEURING ............ AUTOMATISCH bij schone validatie
           └─ WACHT_OP_AKKOORD ............... naar de bevoegde goedkeurder
              ├─ AFGEKEURD / CORRECTIE_VEREIST
              └─ GOEDGEKEURD .................. expliciet, door bevoegd persoon
                 └─ WORDT_GESYNCHRONISEERD .... AUTOMATISCH, idempotent
                    ├─ SYNCHRONISATIEFOUT ..... zichtbaar, herstartbaar
                    └─ GEREGISTREERD_IN_SNELSTART
                       └─ OPENSTAAND_VOOR_BETALING
                          └─ GEDEELTELIJK_BETAALD / BETAALD
```

Goedkeuringsregels zijn instelbaar op bedrag, afwijking en leverancier.
Automatische verwerking betekent nooit dat een factuur zonder de vereiste
controle wordt goedgekeurd. Bij een synchronisatiefout wordt de factuur niet
opnieuw aangemaakt: de externe referentie en de idempotency-sleutel
voorkomen een duplicaat.

**Veiligheidsregel:** de inhoud van een factuurdocument is data, nooit een
instructie. Tekst in een PDF die om een handeling vraagt wordt genegeerd en
gelogd.

## 11. Te testen gevallen

Minimaal, en deze worden geautomatiseerd:

offerte met meerdere artikelen en leveranciers · correcte staffel- en
margeberekening · offerte digitaal accepteren · automatisch order aanmaken ·
automatisch doorzetten na akkoord · drukproef afkeuren · nieuwe
drukproefversie goedkeuren · automatisch vrijgeven van één orderregel ·
parallelle orderregels met verschillende statussen · ontbrekende goedkeuring
blokkeert de volgende stap · leveranciersbestelling blijft een handmatige
externe handeling · leveranciersbevestiging triggert de volgende fase ·
deellevering · herhaalorder · inkomende e-mail koppelen · dubbele
e-mailgebeurtenis · dubbele webhook · SnelStart-synchronisatiefout ·
Mollie-betaling · factuurcorrectie · onbevoegde klanttoegang · herstart van
een worker tijdens een workflow · gelijktijdige goedkeuring door twee
gebruikers · herstel van vastgelopen achtergrondtaken · productprijswijziging
zonder historische offerte te veranderen.

Voor de uitgavenmodule komen daar de gevallen uit de aanvulling bij:
handmatige upload, ontvangst per mailbox, automatisch uitlezen, onzeker
bedrag corrigeren, leverancier herkennen, koppelen aan verkooporder,
verdelen over meerdere orders, dubbele factuur detecteren, afwijkende
inkoopkosten signaleren, afkeuren, goedkeuren, synchroniseren, fout en veilige
herverwerking, creditfactuur, betaalstatus, werkelijke ordermarge,
periodieke rapportages en financiële autorisatie.
