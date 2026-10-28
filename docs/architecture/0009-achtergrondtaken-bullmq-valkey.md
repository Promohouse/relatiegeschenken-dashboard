# ADR-0009 - Achtergrondtaken: BullMQ op Valkey

- Datum: 2026-10-28
- Status: geaccepteerd
- Vervangt de keuze voor pg-boss uit ADR-0002

## Context

ADR-0002 koos pg-boss omdat er lokaal geen Docker en geen Redis was. De
masterprompt schrijft Redis en BullMQ voor, en met Kubernetes in beeld is een
aparte cache-dienst geen bezwaar meer.

Licenties en kosten, nagekeken op 2026-10-28:

- **BullMQ** is MIT en kosteloos, zonder functiebeperkingen. BullMQ Pro
  (groups, batches, observables) is betaald; die functies gebruiken wij niet.
- **Redis** is sinds versie 8 drievoudig gelicentieerd, waaronder AGPLv3.
  Zelf hosten voor intern gebruik is kosteloos toegestaan.
- **Valkey** is een BSD-3-Clause fork onder de Linux Foundation, drop-in
  compatibel, zonder licentiediscussie.
- **bull-board** als wachtrij-dashboard is MIT en kosteloos.

## Besluit

**BullMQ op Valkey.** Valkey omdat BSD-3 geen enkele licentievraag oproept en
de compatibiliteit volledig is: de lokaal geinstalleerde Valkey 9.1.3 meldt
zich als `redis_version 7.2.4`, waar BullMQ op werkt.

**De transactional outbox blijft in PostgreSQL.** Dit staat los van de
wachtrijkeuze en is niet onderhandelbaar: een domeingebeurtenis moet in
dezelfde databasetransactie worden weggeschreven als de statuswijziging die
hem veroorzaakt. Een externe wachtrij kan dat per definitie niet. BullMQ
verwerkt wat de outbox-worker publiceert; hij is niet de bron van waarheid.

### Isolatie op de ontwikkelmachine

Valkey draait op poort 6379 en kan net als PostgreSQL met andere projecten
gedeeld worden. Daarom:

- een eigen keyprefix `rgh:` op alle wachtrijen;
- een eigen databasenummer (`VALKEY_DB`), standaard 3 voor ontwikkeling en 4
  voor tests;
- nooit `FLUSHALL` of `FLUSHDB` zonder controle op dat databasenummer.

In productie krijgt het platform een eigen instantie.

## Gevolgen

- Eén extra dienst in het Kubernetes-ontwerp en in de lokale omgeving.
- Beter inzicht in wachtrijen, planning en dead-letter dan met pg-boss, en dat
  is precies wat de workflow-engine nodig heeft.
- pg-boss verdwijnt uit het ontwerp voordat het geimplementeerd was; er is geen
  code die eruit moet.
