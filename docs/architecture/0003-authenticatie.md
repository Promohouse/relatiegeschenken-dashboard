# ADR-0003 - Authenticatie via een onderhouden TypeScript-bibliotheek

- Datum: 2026-10-08
- Status: geaccepteerd, implementatiekeuze nog te verifieren

## Context

Nodig: rollen, fijnmazige rechten per module en actie, MFA, en op termijn
klantgebruikers met toegang tot uitsluitend hun eigen gegevens. Vijf interne
gebruikers nu, honderden klantgebruikers later.

## Besluit

Authenticatie via een actief onderhouden TypeScript-bibliotheek, draaiend in
de api op de eigen PostgreSQL. Geen aparte identity-dienst.

Autorisatie bouwen we zelf, want die is domeinspecifiek: permissies als
`module:actie` (`orders:goedkeuren`, `producten:exporteren`), opgeslagen in de
database en toekenbaar aan rollen, zodat rechten configureerbaar zijn zonder
code. Een guard dwingt ze af op iedere route; de effectieve permissies worden
per request bepaald. Klantscope wordt daarnaast afgedwongen door een
Prisma-extensie die een `customerId`-filter verplicht maakt voor
portaalsessies.

De concrete bibliotheek wordt vastgesteld na verificatie van de actuele
NestJS-integratie, MFA-ondersteuning en onderhoudsstatus. Die verificatie
gebeurt vóór implementatie en wordt in deze ADR aangevuld.

## Gevolgen

- Sessiebeheer, wachtwoordherstel en MFA-edge-cases liggen bij een partij die
  dat onderhoudt; wij houden de domeinlogica.
- Autorisatie is maatwerk en moet dus zelf getest worden, met nadruk op tests
  die controleren dat toegang **geweigerd** wordt.

## Alternatieven

- **Keycloak.** Afgewezen: vereist Docker en een extra te beheren dienst; te
  zwaar voor vijf interne gebruikers.
- **Volledig zelf bouwen op Passport + argon2id + TOTP.** Afgewezen: maximale
  controle, maar sessie- en MFA-beveiliging zelf onderhouden is risico zonder
  opbrengst.
