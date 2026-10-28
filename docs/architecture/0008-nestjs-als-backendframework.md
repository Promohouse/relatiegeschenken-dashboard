# ADR-0008 - NestJS als backendframework

- Datum: 2026-10-28
- Status: geaccepteerd

## Context

De masterprompt noemt als voorkeursstack TypeScript, Next.js, React, Tailwind
en shadcn/ui, maar geen backendframework. NestJS stond al in de repository
sinds ADR-0001. Omdat het niet genoemd is, is de keuze expliciet bevestigd
door de opdrachtgever.

## Besluit

NestJS blijft de backend, als aparte applicatie naast de Next.js-frontend.

Reden: de opdracht eist domeinmodules met duidelijke grenzen, autorisatie op
de backend, geen bedrijfslogica in React-componenten, en OpenAPI. NestJS levert
modules, dependency injection, guards, interceptors en OpenAPI-generatie uit
één bron. Daarmee zijn modulegrenzen en autorisatie **structuur** in plaats van
discipline - bij twintig voorziene modules is dat verschil bepalend.

## Gevolgen

- Twee deployables (`web` en `api`) in plaats van één. Dat past in het
  Kubernetes-ontwerp en laat workers onafhankelijk schalen.
- De frontend praat via HTTP met de api; types komen uit OpenAPI naar
  `packages/contracts`, nooit handmatig natypen.
- Achtergrondtaken gebruiken dezelfde domeinservices als de HTTP-laag.

## Alternatief

Next.js route handlers met een eigen servicelaag. Afgewezen: werkt, maar
modulegrenzen, guards en OpenAPI moet je dan zelf inrichten en handhaven.
