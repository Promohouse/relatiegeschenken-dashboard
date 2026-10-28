# ADR-0012 - Authenticatie met better-auth, autorisatie zelf

- Datum: 2026-10-28
- Status: geaccepteerd
- Vult ADR-0003 in: die koos het *soort* oplossing, dit het pakket

## Onderzoek

ADR-0003 koos "een actief onderhouden TypeScript-bibliotheek" zonder het
pakket te noemen, met de afspraak dat eerst geverifieerd zou worden. Dat is op
2026-10-28 gedaan:

| | |
|---|---|
| **Lucia** | begin 2025 beëindigd. De maker concludeerde dat het adaptermodel te star was en maakte er een leermiddel van. Valt af. |
| **Auth.js / NextAuth** | alleen nog beveiligingspatches; het project is inmiddels onderdeel van Better Auth. Bovendien Next.js-gericht, en onze backend is NestJS. Valt af. |
| **SuperTokens, Logto, Keycloak** | werken, maar vragen een eigen dienst ernaast. Te zwaar voor vijf interne gebruikers; Keycloak was in ADR-0003 al afgewezen. |
| **better-auth 1.7.14** | TypeScript-first, zelf gehost op de eigen database, tweefactor met TOTP als ingebouwde plugin. Uitgebracht op 2026-10-26, dus actief onderhouden. Noemt Prisma 7 expliciet als ondersteunde peer. **Gekozen.** |

Net als bij Prisma is gecontroleerd of `latest` daadwerkelijk stabiel is: dat
is zo (1.8.0 staat apart onder `beta`).

## Besluit

**better-auth doet identiteit. Autorisatie blijft van ons.**

Wachtwoorden, sessies en tweefactor komen uit de bibliotheek. Rollen en
permissies als `module:actie` staan in onze eigen tabellen, want die zijn
domeinspecifiek en moeten configureerbaar zijn zonder code-release.

### Eén gebruikerstabel

De Prisma-adapter van better-auth adresseert het Prisma-**model**, niet een
vaste tabelnaam. Daardoor gebruikt hij ons bestaande `User`-model
rechtstreeks. Er komt dus geen tweede gebruikersadministratie bij die
synchroon gehouden moet worden - precies het soort constructie waar later
gegevens in uit elkaar lopen.

Wat dat kostte:

- drie velden erbij op `users`: `emailVerified`, `image`, `twoFactorEnabled`;
- `mfaEnabled` eruit. Twee vlaggen voor hetzelfde zou betekenen dat ze kunnen
  gaan afwijken; `twoFactorEnabled` wordt door de plugin beheerd;
- `advanced.database.generateId` op `randomUUID`, want `users.id` is een
  UUID-kolom en de standaard-id van better-auth past daar niet in;
- vier eigen tabellen: `auth_sessions`, `auth_accounts`,
  `auth_verifications`, `auth_two_factors`. De wachtwoordhash staat bij de
  inloggegevens, niet bij de gebruiker.

De vorm daarvan is niet verzonnen maar opgehaald met `better-auth generate`,
en daarna nogmaals gedraaid om te bevestigen dat de bibliotheek tevreden is.

### Geen community-wrapper

`@thallesp/nestjs-better-auth` is geprobeerd en weer verwijderd. better-auth
levert zelf `toNodeHandler` en `fromNodeHeaders` voor Node, en we schrijven de
guards toch zelf omdat de autorisatie van ons is. Eén afhankelijkheid minder
die mee moet met twee upstreamversies.

Gevolg voor het opstarten: de applicatie wordt gemaakt met
`bodyParser: false`, want better-auth leest de ruwe body. `configureApp` zet
de parser er daarna alsnog voor onze eigen routes.

### Twee guards, in volgorde

1. **SessionGuard** stelt vast wie er aanklopt, weigert een gedeactiveerd
   account, en vult gebruiker en klant in de verzoekcontext.
2. **PermissionsGuard** controleert de rechten.

**Sluit dicht bij twijfel:** een route zonder `@Public()` én zonder
`@RequirePermission()` wordt geweigerd, met een melding die zegt wat eraan
ontbreekt. Beveiliging vergeten moet opvallen, niet doorglippen.

### Klantisolatie is de standaard, niet de uitzondering

`PrismaService.db` geeft tijdens een portaalsessie een client terug die elke
query begrenst op de eigen klant. Een module die er niet aan denkt, lekt dus
niet. Werk buiten een verzoek om - workers, imports - heeft geen klant in de
context en krijgt de gewone client.

De kern zit in één detail: **`findUnique` wordt omgezet naar `findFirst`.**
Prisma accepteert bij een zoekopdracht op unieke sleutel geen extra
voorwaarden, dus zou het filter daar genegeerd worden. Dat is precies het gat
waardoor een aangepast id in de URL wél gegevens van een andere klant zou
opleveren.

`PrismaService.unscoped` is de uitweg voor wie hem bewust nodig heeft. Dat
staat er met die naam zodat het bij het nalezen van code opvalt.

## Gevolgen en beperkingen

- Wachtwoordherstel per e-mail werkt pas met Microsoft 365 (Fase 7). Tot die
  tijd gooit het een leesbare fout in plaats van te doen alsof het gelukt is.
- De tweefactor-plugin staat aan, maar er is nog geen scherm om hem in te
  schakelen.
- De seed maakt nog geen testaccounts met wachtwoord aan; inloggen op DEV kan
  pas als dat erbij komt.
- Een model dat klantgegevens draagt moet in de lijst in `customer-scope.ts`
  komen. Ontbreekt het daar, dan is dat een lek. Bij elk nieuw model hoort die
  afweging.
