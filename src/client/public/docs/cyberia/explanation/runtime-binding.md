# Runtime binding

An item id names a Cyberia item. A CID names one immutable Object Layer definition. The item
catalog decides which definition the runtime runs for each item. This explains how a binding
changes, how a snapshot freezes it, and how the engine keeps one authority.

## Identities

| Name                 | What it is                                                     | Changes                    |
| -------------------- | -------------------------------------------------------------- | -------------------------- |
| `itemId`             | The stable logical identity of an item (`coin`, `skin.worker`) | Never                      |
| `objectLayerCid`     | The content identity of one definition                         | Never: a change is new CID |
| `CyberiaItemCatalog` | `itemId → objectLayerCid`: the definition the runtime runs     | Only through a bind        |

One item runs one definition at a time. Over its life an item can run several CIDs, and several
items can run one CID.

## One authority

Ordinary content names items by item id only: quests, actions, entity-type defaults, sagas and
maps. None of them selects a CID. The world load resolves each item id through the catalog,
`src/projects/cyberia/instance-data.js`, so the game server, the client and every tool run the same
definition.

```text
quest, action, entity default, map
        ↓ itemId
CyberiaItemCatalog
        ↓ objectLayerCid
Object Layer definition
```

## Revisions and binds

A Studio save, a procedural candidate, a content import and a render rebuild each publish a
definition. Publishing never moves an item. A bind moves it:
`bindItem` in `src/projects/cyberia/catalog/object-layer-catalog.js` is the one write of a binding.

A bind names the definition the caller saw the item run, `expectedCid` (empty for an unbound
item). The catalog updates only while the item still runs it, so of two moderators who saw the same
definition, the second bind answers 409 and changes nothing. A bind of the definition the item
runs already changes nothing. The definition must be stored and published, and not archived.

Each bind appends to the history of the item in the same write: the new and the previous CID,
what bound it (`studio`, `procedural`, `content`, `snapshot`, `revise`, `seed`), who, and when.

| Path                    | Publishes             | Binds                                                       |
| ----------------------- | --------------------- | ----------------------------------------------------------- |
| Studio save             | A new revision        | Never. **Bind as Runtime Version** in the Studio or catalog |
| Procedural candidate    | A draft revision      | Never. A promotion binds                                    |
| Procedural promotion    | The approved revision | In one transaction with the candidate status and the audit  |
| Content import          | The artifact item     | An absent item, or with `--rebind` a differing one          |
| Snapshot restore        | The snapshot item     | Always: the snapshot is authoritative for what it restores  |
| `cyberia ol` operations | The written item      | The item the operator wrote                                 |

After a bind, the engine asks every registered game server to reload its object layers. A
promotion publishes first: a definition is immutable, so a bind that a later step refuses leaves
nothing to undo.

## What a world runs

A content database holds one catalog, so one binding per item serves every world of the release.
No world binds an item on its own. Four layers decide what a player gets for an item:

| Layer     | Source                                                 | Decides                                     |
| --------- | ------------------------------------------------------ | ------------------------------------------- |
| Canonical | The Object Layer authority, by CID                     | What a definition is, for good              |
| Release   | The catalog of the served release                      | Which definition each item runs now         |
| World     | The warm set of the world, and what placement resolves | Which definitions the game server holds     |
| Stack     | The `olCid` a stack was granted with                   | What the player owns; a bind never moves it |

A stack is usable in a world only when its `olCid` is the definition the world runs for its item.
Otherwise it stays held, untouched, until a world runs its definition. Clients draw every
definition by its CID, so a held stack, or one no served release holds, still shows as itself. See
[Content a player brings](game-server.md#content-a-player-brings).

The skill of an item is the `CyberiaSkill` document of its label in the served release. A release
holds one skill document per label (`triggerItemId` is unique) and one binding per label, so the
label names one definition and one skill there. A stack runs that skill only where it runs its
definition. The warm content of a world wins: its skill of a label is the one that runs, and a skill
resolved for a player only adds a label the world does not warm. `logicEventIds` lists exactly the
distinct handlers of `skills[]`, in order; release validation (`skills`) and the engine refuse a
document where they disagree, or where a handler is no skill logic.

## Snapshots

A complete instance snapshot (`instances/<code>/` of the content artifact, with `object-layers/`)
is frozen runtime state. `object-layers/<itemId>.json` is the definition the item ran when the
snapshot was exported: that file set is the binding state of the snapshot.

- `cyberia instance <code> --export` writes, for each item the instance names, the definition the
  catalog binds it to now. Quests and actions travel with item ids only.
- `cyberia instance <code> --import` restores each definition exactly and binds the item to it,
  whatever the item ran before. This is an explicit restore, not runtime wiring.

A quest or an action inside a snapshot may still carry `objectLayerCid`, as frozen state. The
content repository accepts such a pin only when it equals the binding of the snapshot itself. The
import drops it: ordinary documents name items by item id.

## Releases

A release starts from an empty database and imports its content: the foundation, the release
sagas, then the release instances. Each snapshot sets the bindings of what it holds. The previous
database is never an input. To keep a binding a moderator made while a release ran, export the
instance before the next release:

```text
runtime: coin → CID-B  →  instance --export  →  snapshot: coin → CID-B  →  release  →  coin → CID-B
```

Without an export, the next release runs what its snapshot holds, and the binding made live goes.

## Consistency

| Check                           | What it finds                                                                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cyberia catalog check`         | Each world, as the game server receives it: items unbound, bound to a definition this host does not store, to a draft or an archived one, without an atlas, and legacy pins |
| `catalog check --ipfs`          | How each bound definition is stored, by category: binding, content, MFS and pin                                                                                             |
| `content-release` `legacy-pins` | A quest or an action that still pins a definition                                                                                                                           |
| `cyberia catalog repair`        | The items that legacy pins make ambiguous, with every document; `--apply` removes the pins                                                                                  |

Documents stored before the catalog was the one authority can still hold `objectLayerCid` fields.
The world load ignores them, and the repair reports them and removes them. See
[Manage runtime bindings](../how-to/manage-runtime-bindings.md).
