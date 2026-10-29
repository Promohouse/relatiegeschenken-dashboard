# Koppelmogelijkheden per leverancier

Onderzocht op 2026-10-08, op basis van openbare bronnen. **Niets hiervan is
geverifieerd tegen echte documentatie of credentials.**

> **midocean is inmiddels wel geverifieerd.** Op 2026-10-28 kwam de officiele
> handleiding binnen; de feiten staan in [midocean.md](midocean.md) en het
> besluit in [ADR-0013](../architecture/0013-midocean-rest-koppeling.md).
> Let op: de regel hieronder over SFTP voor midocean **klopt niet meer**.
> midocean heeft die dienst uitgefaseerd en in 2025 uitgezet; de koppeling is
> REST. Dat is precies waarom dit document als ongeverifieerd gemarkeerd staat.

> **ANDA is inmiddels ook geverifieerd.** Op 2026-10-29 kwamen de feed- en
> Order API-handleidingen binnen; de feiten staan in [anda.md](anda.md) en het
> besluit in [ADR-0018](../architecture/0018-anda-via-de-xml-feeds.md).
> De regel hieronder klopt in grote lijnen, maar "REST API + XML-feeds" is
> misleidend: de REST API is uitsluitend een **Order** API en bevat geen
> catalogus, prijzen of voorraad. Alle gegevens komen uit de XML-feeds.

> **PF Concept is eveneens geverifieerd.** Op 2026-10-29 kwamen de
> datafeed-handleiding v3.6.7, de Gateway-handleiding v2.2.2 en de
> gebruiksvoorwaarden binnen; de feiten staan in [pf-concept.md](pf-concept.md)
> en het besluit in
> [ADR-0019](../architecture/0019-pf-concept-via-de-datafeeds.md).
> Ook hier geldt: de "Gateway" is een **order**dienst, geen gegevensbron. Voor iedere leverancier
geldt: eerst de officiele integratiehandleiding opvragen, dan bouwen. Geen
endpoints of veldnamen aannemen op basis van dit document.

## Overzicht

| Leverancier | Catalogus | Voorraad | Order plaatsen | Toegang |
|---|---|---|---|---|
| PF Concept ✅ | Product-, Price-, Print data-, Print price- en Attribute-feed in XML **of JSON**, dagelijks tot wekelijks (geverifieerd) | Stock-feed, 2× per dag; activering vraagt goedkeuring country manager | Gateway (REST/JSON), **wordt niet gebruikt** (harde regel 13) | ondertekend aanvraagformulier; unieke code in de bestandsnaam, contractueel vertrouwelijk |
| Anda ✅ | XML-feeds: product, prijs, categorie, labeling info, labeling price, unieke prijzen (geverifieerd) | inventory feed, elke 30 min beschikbaar | Order API, **wordt niet gebruikt** (harde regel 13) | geheime URL per feed + IP-whitelisting, via de accountmanager |
| midocean | customer API's voor productinfo; SFTP XML (`Prodinfo_*.xml`) | via API | order management + print configuration API | alleen geregistreerde klant, via hun portaal |
| Clipper (Interall) | FTP met productdata en foto's, Excel/XML; losse productfeed op aanvraag | onbekend | onbekend | accountmanager |
| Toppoint | niets openbaar gevonden | onbekend | onbekend | navragen bij Toppoint |

## Implementatievolgorde

1. **Generieke bestandsimport** (CSV/Excel/XML) - werkt zonder credentials op
   de prijslijsten die nu al binnenkomen, en blijft de oplossing voor Clipper
   en Toppoint zolang die geen API hebben.
2. **PF Concept** - best gedocumenteerd, duidelijke scheiding per feedtype.
   **Bevestigd**, en technisch de makkelijkste van de drie: `model > item` is
   onze product/variant-opzet, de inkoopstaffel is onze staffel, en de
   drukprijs is een opzoektabel in plaats van een formule. Zie
   [pf-concept.md](pf-concept.md).
3. ~~**Anda** - REST plus losse feeds, eigen Order API.~~
   **Bijgesteld.** ANDA is XML-feeds; de REST API gaat alleen over bestellen
   en gebruiken we niet. Zie [anda.md](anda.md).
4. ~~**midocean** - SFTP XML, vraagt eerst toegang via hun portaal.~~
   **Achterhaald.** midocean is REST en staat nu vooraan, omdat de
   documentatie er als eerste is. Zie [midocean.md](midocean.md).
5. **Clipper**, **Toppoint** - zodra duidelijk is wat zij kunnen leveren.

## PSI

Belangrijke nuance: de PSI Product Finder-API en de import/export in de PSI
backend zijn **leverancierskant**, bedoeld om producten te publiceren onder een
eigen PSI-nummer. Een bulk-export voor distributeurs is niet vastgesteld. Er
bestaat een tweede API-host (`api-cf.psiproductfinder.de`) die tijdens het
onderzoek niet bereikbaar was (HTTP 504); die sluit de mogelijkheid niet uit.

**Actie:** bij PSI navragen of het abonnement recht geeft op een
distributeur-dataexport. Zo ja, dan is dat een serieus alternatief.

## Promidata (niet gekozen, wel gedocumenteerd)

Levert dezelfde vijf leveranciers plus 150 andere in een gestandaardiseerd
formaat, dagelijks bijgewerkt, inclusief volledige decoratie- en prijslogica
(zeefdruk, tampondruk, digitaal, laser) met instelkosten, variabele kosten en
staffels. Start 197 euro/maand tot 10 leveranciers, Pro 297 euro/maand
onbeperkt, 950 euro eenmalig. Technisch formaat staat niet openbaar.

Niet gekozen (zie ADR-0004). Blijft achter de hand als extra connector.

## Op te vragen per leverancier

- Integratiehandleiding en veldspecificatie
- Credentials voor test- en productieomgeving
- Welke capabilities: catalogus, media, prijzen, voorraad, order plaatsen,
  orderstatus, track & trace
- Updatefrequentie en of er een wijzigings- of delta-feed is
- Rate limits en wat er gebeurt bij overschrijding
- Hoe decoratietechnieken, kleuren en maten gecodeerd zijn, met codelijst

## Bronnen

- https://www.midocean.com/export/us/eur/content/page.customer.api
- https://andapresent.com/row/en/pages/api-services
- https://www.pfconcept.com/en_nl/sales-marketing-support
- https://www.clipperinterall.nl/content/klantenservice/product-data-foto-s
- https://new.toppoint.com/en-us
- https://psiproductfinder.de/en/helpcenter/supplier
- https://api.psiproductfinder.de/v2/docs
- https://www.promidata.com/en/promotional-data
- https://www.promidata.com/nl/suppliers-nl/
