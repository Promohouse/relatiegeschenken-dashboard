# SECURITY — Relatiegeschenken Hub

Uitgangspunt: minimale rechten, en autorisatie altijd op de backend. De
interface verbergt alleen; de guard beslist.

## 1. Authenticatie

**Zelfregistratie staat uit.** better-auth publiceert een registratieroute;
die is geblokkeerd vóór zijn handler. Dit is een intern systeem: accounts
ontstaan alleen doordat iemand met het recht `users:create` ze aanmaakt. De
gebruikersmodule roept dezelfde functie rechtstreeks aan en gaat dus niet
langs die afsluiting.

**Niemand kan het systeem op slot zetten.** Je kunt jezelf niet op inactief
zetten, en een wijziging waarna geen enkele actieve gebruiker meer het recht
`users:update` heeft wordt geweigerd en teruggerold.

**Medewerkers** — e-mail en wachtwoord met verplichte MFA (TOTP). Sessies in
een httpOnly-cookie, `Secure`, `SameSite=Lax`, met een vaste levensduur en
intrekbaarheid per sessie. Wachtwoordhashing met een echte wachtwoordfunctie
(argon2id), nooit een snelle hash.

**Klantgebruikers** — eigen inlog in het portaal, dezelfde
sessie-infrastructuur, MFA optioneel maar afdwingbaar per klantorganisatie.

**API-sleutels** voor partnerkanalen — alleen de SHA-256-hash wordt bewaard,
vergelijking in constante tijd, met scopes, vervaldatum en intrekking. Een
sleutel is na aanmaken niet meer op te vragen. SHA-256 mag hier omdat de
sleutel zelf 32 bytes uit een cryptografische bron is; voor wachtwoorden geldt
dat niet.

De bibliotheekkeuze staat nog open, zie ADR-0003 en DECISIONS.md D-04.

## 2. Autorisatie

Permissies als `module:actie` (`orders:goedkeuren`, `uitgaven:goedkeuren`,
`rapportages:bekijken`) in de database, toegekend aan rollen. Configureerbaar
zonder code-release. Een gebruiker kan meerdere rollen hebben; de effectieve
permissies worden per request bepaald.

Interne rollen: beheerder, verkoop, orderbeheer, inkoop, administratie,
klantbeheerder.

Klantrollen, met een scherpe scheiding:

| Klantrol | Mag |
|---|---|
| Klantbeheerder | eigen gebruikers beheren binnen toegestane rechten |
| Besteller | aanvragen en herhaalorders plaatsen |
| Goedkeurder | offertes en drukproeven goedkeuren |
| Financieel contact | facturen bekijken en betalen |

**Alleen een goedkeurder mag akkoord geven.** Een financiële gebruiker kan
facturen zien maar keurt geen offertes of drukproeven goed. Dat wordt op de
backend gecontroleerd, bij iedere goedkeuringsovergang.

Voor financiële handelingen gelden aparte permissies: inkoopfacturen
goedkeuren, boekhoudkundige gegevens corrigeren, synchronisatie naar SnelStart
starten, betalingsgegevens wijzigen, rapportages bekijken. Inhoudelijke en
financiële goedkeuring zijn verschillende permissies en worden apart
vastgelegd met gebruiker, tijdstip, factuurversie en auditregistratie.

## 3. Klantisolatie

Een klant mag nooit gegevens van een andere klant zien, ook niet door een URL
of een id aan te passen. Drie lagen, want één is te weinig:

1. **Prisma-extensie** die voor een portaalsessie elke query begrenst op de
   eigen klant — **gebouwd en getest**. `PrismaService.db` geeft tijdens een
   portaalsessie automatisch de begrensde client, dus een module die er niet
   aan denkt lekt niet. `findUnique` wordt omgezet naar `findFirst`, want
   anders zou het filter bij een zoekopdracht op id genegeerd worden: precies
   het gat waardoor een aangepast id gegevens van een ander zou opleveren.
   `PrismaService.unscoped` is de bewuste uitweg, met die naam zodat het
   opvalt bij het nalezen van code.
2. **Expliciete controle in de service** bij elke toegang via een id: hoort
   dit record bij de klant van de sessie?
3. **Tests die weigering aantonen**, niet alleen succes. Voor elk
   portaal-eindpunt een test die met een vreemd id een 404 verwacht.

Documenten zijn een apart risico: leveranciersdocumenten, inkoopprijzen en
interne opmerkingen mogen nooit zichtbaar worden voor klanten. Daarom staat
`visibility` op het document (`INTERNAL` of `CUSTOMER`) en wordt die bij
iedere download opnieuw gecontroleerd, niet alleen bij het tonen van de lijst.

## 4. Documenten en objectopslag

Private objectopslag, geen publieke buckets. Downloads via de applicatie, met
kortlevende, aan de sessie gebonden URL's. Bestandstypen worden gevalideerd op
inhoud, niet op extensie. Uploads krijgen een controlewaarde, en die
controlewaarde is bij een drukproefgoedkeuring onderdeel van het bewijs: het
akkoord verwijst naar een exacte bestandsversie die daarna onveranderbaar is.

Bijlagen uit e-mail en inkoopfacturen komen van buiten en worden als
onbetrouwbaar behandeld: scannen op type en grootte, opslaan buiten de
webroot, nooit uitvoeren, en nooit renderen in een context waar scripts kunnen
draaien.

## 5. Externe inhoud is data, nooit instructie

Tekst in een factuur-PDF, een e-mailbericht, een leveranciersfeed of een
webhook is **invoer**. Als daar iets staat dat op een opdracht lijkt — "boek
dit direct", "keur goed", "stuur betaling naar dit IBAN" — wordt dat genegeerd
en gelogd als afwijking. Dit geldt met name voor de documentextractie met
OCR of document-AI.

Concreet: een afwijkend IBAN op een factuur van een bekende leverancier is een
signaal dat handmatige controle vereist, nooit een reden om de
leveranciersgegevens bij te werken.

## 6. Invoer, snelheid en misbruik

Validatie met Zod op de grens, met één schema voor front- en backend.
Rate limiting op inlog, wachtwoordherstel, portaal-eindpunten, de publieke
webshop-API en webhooks. Webhooks worden op signatuur gecontroleerd en de
status wordt waar mogelijk actief bij de bron opgehaald in plaats van
vertrouwd. Dubbele webhooks worden idempotent verwerkt.

Geen definitieve financiële boeking op basis van uitsluitend een onbevestigde
webhook.

## 7. Secrets

Geen credentials in code of in de repository. Leveranciers- en
integratiecredentials staan versleuteld in de database
(`supplier_connections.credentials`), met de sleutel uit de omgeving.
Omgevingssecrets komen uit de secretvoorziening van het cluster. De lokale
`.env` staat in `.gitignore` en bevat alleen ontwikkelwaarden.

Gedeelde of publiek rondslingerende leveranciersinloggegevens worden niet
gebruikt; we vragen eigen toegang aan.

## 8. Scheiding DEV en productie

DEV mag nooit echte klanten mailen, echte betalingen starten of definitieve
facturen maken. Dat wordt niet met discipline geregeld maar met techniek:

- aparte databases, Redis-instanties, opslag en secrets;
- een uitgaande-mailpoort die in DEV naar een testmailbox schrijft en weigert
  naar externe adressen te verzenden;
- Mollie uitsluitend in testmodus, met testsleutels;
- SnelStart via een mock of de testomgeving, en een harde schakelaar die live
  boekingen in DEV onmogelijk maakt;
- demodata gemarkeerd met `isDemo` en een zichtbare waarschuwingsbalk.

Productie wijzigt alleen na expliciete toestemming. Releases zijn handmatig
goedgekeurd.

## 9. Auditlogging

Op iedere betekenisvolle handeling: entiteit, id, actie, gebruiker, tijdstip,
de gewijzigde velden als van-naar, IP en user-agent. Append-only.

Expliciet ook: inloggen en mislukte inlogpogingen, rolwijzigingen,
goedkeuringen en afkeuringen, geforceerde workflowovergangen, exports,
downloads van klantdocumenten, wijzigingen aan betalingsgegevens, en elke
synchronisatie met een extern systeem.

## 10. Back-up en herstel

Dagelijkse back-up van database en objectopslag, met een bewaartermijn en
versleuteling in rust. Point-in-time-herstel voor de database waar de host dat
ondersteunt.

Een back-up die nooit is teruggezet is geen back-up: een **herstelproef** is
onderdeel van Fase 9 en wordt daarna periodiek herhaald. Herstel van de
database en herstel van documenten worden samen getest, want een order zonder
zijn drukproeven is onbruikbaar.

## 11. AVG

Persoonsgegevens beperken we tot contactgegevens die nodig zijn voor de
uitvoering van orders. Geen bijzondere persoonsgegevens. Een bewaartermijn per
gegevenscategorie wordt vastgelegd, met een procedure voor inzage, correctie
en verwijdering — waarbij een verwijderverzoek niet de administratieve
bewaarplicht van facturen doorbreekt. Dat onderscheid moet in het model
zichtbaar zijn: een contactpersoon kan geanonimiseerd worden zonder de
onderliggende order- en factuurhistorie te vernietigen.

## 12. Nog te beslissen

- Definitieve auth-bibliotheek (ADR-0003, D-04).
- Of klant-MFA verplicht wordt per klantorganisatie of globaal.
- Bewaartermijnen per gegevenscategorie.
- Of de publieke webshop-API een eigen gateway krijgt of binnen dezelfde
  applicatie met eigen rate limiting en scopes blijft.
