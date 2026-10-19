# Map registry

The map registry names the instance that owns each map code of a catalog. A catalog is one content
database: the workspace or one release. The maps and the instances of the catalog are the canonical
source, and the registry is their projection. The registry holds no geometry, no entity, no preview
and no portal.

---

## Ownership

| Fact                                                      | Owner                                                     |
| --------------------------------------------------------- | --------------------------------------------------------- |
| A map: its grid, entities, previews and world origin      | `CyberiaMap`, in the catalog database                     |
| The maps of a world, their layout cells and their portals | `CyberiaInstance.cyberiaMapCodes`, `mapLayout`, `portals` |
| The owner of a map code                                   | The registry, projected from the instances                |
| The servers that run a world now                          | The [server registry](server-registry.md)                 |

The unique index of `CyberiaMap.code` keeps a map code unique in its catalog. The catalogs are
separate, so a release candidate and the active release can hold the same code. A Cyberia host
serves one catalog at a time, so a code has one owner for each catalog. A map that no instance lists
has no row. Each map belongs to an instance: the registry has no other type of owner.

## Rows

The registry keeps one row for each map code that an instance lists. The rows are in the runtime
database, keyed by `catalog`, the name of the content database, and `mapCode`.

| Field          | Meaning                                                              |
| -------------- | -------------------------------------------------------------------- |
| `instanceCode` | The owner, or the last owner of a deprecated code                    |
| `instanceId`   | The owner document, in the catalog database                          |
| `status`       | `active`, `unlisted` or `deprecated`                                 |
| `checksum`     | sha256 of the catalog, the code, the owner code, owner id and status |
| `version`      | The revision of the row: each change of owner or status adds one     |

The map and its instance give the status. The status is `active` while both are `published`. It is
`deprecated` when either is `archived`, or when no instance lists the code. In all other cases, a
draft included, it is `unlisted`. A navigation resolves `active` and `unlisted`. A deprecated row
stays as the history of the code. A new owner of the code takes the row (`reassigned`). The registry
is not a readiness signal: the server registry tells if a world runs.

The registry keeps no portal time. A portal is part of its instance, and the `revision` of the
instance changes with it.

## Writes

Each catalog write of the API runs in one transaction with the registry: create, save and delete of
a map or an instance. Both land, or neither does. A write must not add a defect:

- an invalid or repeated map code, or an invalid world origin
- an instance that lists a missing map, or lists one map twice
- a map that two instances list
- two maps of one world that overlap

A defect that the catalog held before the write is reported and blocks nothing. A code that two
instances claim keeps its stored owner: the registry never takes an arbitrary new owner.

The CLI writes reconcile the registry of their catalog after they write: `cyberia content import`,
and `cyberia instance <code> --import` or `--drop`. A promotion reconciles the registry of the
release in the transaction that activates it. The validation of a release fails on each defect, so
a release that the registry refuses never becomes active.

## Reconciliation

`node bin/cyberia map-registry` compares the rows with the maps and instances of the served catalog.
It prints the changes and the defects, and exits with 1 on a defect. `--apply` writes the changes in
one transaction, and `--release <id>` takes the catalog of one release. An admin does the same with
`POST /api/v1/cyberia-global-map-code-registry/reconcile`, and `{ "apply": true }` writes.

| Change       | When                                              |
| ------------ | ------------------------------------------------- |
| `registered` | An instance lists a code that has no row          |
| `repaired`   | The checksum of a row does not agree with its row |
| `reassigned` | A different instance owns the code now            |
| `updated`    | The status changed                                |
| `deprecated` | No instance lists the code                        |

A run reads at most 4,096 maps, instances and rows, and refuses a larger catalog. A run without a
change writes nothing, so each version and timestamp stays. Each write names the version that it
read. When a row changed meanwhile, the transaction fails and MongoDB runs it again, so two runs at
the same time give one result. A run occurs on a catalog write, on a promotion, or when an operator
starts it. No game server reconciles.

## Reads

`GET /api/v1/cyberia-global-map-code-registry/:mapCode` resolves a code of the served catalog to its
owner: `mapCode`, `instanceCode`, `instanceName`, `status` and `version`. It answers 404 for a code
without a row or with a deprecated row. It answers 409 when the checksum refutes the row, or when the
owner no longer lists the map. Moderators list the rows of the served catalog at
`GET /api/v1/cyberia-global-map-code-registry`.

With an instance code, the `GetMapData` RPC serves the map only when the registry names that
instance as its owner. A portal leads to a map of its own instance. The game server drops a portal
to a map that it does not load, and the Instance Map and the minimap draw no such portal.

## Indexes

The schema has one index, `{ catalog, mapCode }`, unique. `node bin/cyberia map-registry --indexes`
lists the indexes of the collection and the obsolete ones: those without a catalog key, from an
older schema. `--indexes --apply` builds the schema index and drops the obsolete ones. It refuses
while a row has no catalog. Remove those rows; a reconciliation of each catalog builds its rows again.

## Tests

| Test                                            | What it proves                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `test/cyberia/unit/map-registry.test.js`        | Statuses, checksum inputs, defects, each type of change, a claimed code keeps its owner   |
| `test/cyberia/integration/map-registry.test.js` | Transactions, refused defects, versions, repair, separate catalogs, the index migration   |
| `test/cyberia/unit/instance-data.test.js`       | `GetMapData` serves a map only for the owner that the registry names                      |
| `test/cyberia/unit/content-release.test.js`     | A release that lists a missing map fails validation                                       |
| `test/cyberia/unit/graph-layout.test.js`        | A world origin of two integer cells, and the centre of a placed map in the static payload |
