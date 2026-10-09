# IPFS storage

How a host stores definitions on IPFS: by CID, never by item id. `src/api/object-layer/object-layer.ipfs.js`
holds every operation below.

## Four concerns

| Concern          | What it is                                         | Where it lives                         |
| ---------------- | -------------------------------------------------- | -------------------------------------- |
| Content identity | The CID of each file                               | The definition and its render contract |
| Registry         | One record per CID this host pinned: type and size | The `Ipfs` collection                  |
| Pin              | Whether the node and the Cluster keep the content  | Kubo and IPFS Cluster                  |
| MFS path         | A name a person browses the content by             | Kubo MFS, derived from the CID         |

None of them is the source of truth of another. A path never names an item, and no record stores
a path: a path follows from the CID.

## Layout

Each definition is listed under its own CID:

```text
/object-layer/cid/<objectLayerCid>/
    object-layer.json   canonical bytes of the definition   (its own CID)
    atlas.png           primary render                      (data.render.cid)
    atlas.json          layout of the primary render        (data.render.metadataCid)
```

The directory is one immutable revision. A new revision gets a directory of its own; the earlier
one stays. A CID that several items run is stored once.

## Writes

`publishObjectLayerBundle` stores the files of one stored definition that this host holds: it adds
each file to Kubo, pins it there and on the Cluster, records it, and copies it into its MFS path.
A copy is a reference to the CID, never a second copy of the bytes. A rerun writes the same records
and paths. A file the node stores under another CID than the contract names is refused.

- The Object Layer authority pins the canonical bytes, `object-layer.json`, when it publishes.
- A host pins the render it stores, once the definition that names it is stored: every
  publication and every draft, procedural candidates among them.

Storing never binds an item. Which CID an item runs is the item catalog's alone.

## Removal

A purge removes the directory of each definition it removes, and unpins what no remaining
definition of the host names. A content release shares the node with every other release, so a
purge there removes its own records only.

`cyberia content-release prune` collects by reachability: a render CID stays pinned while any kept
store, the workspace or a kept release, holds a definition that names it. A directory loses its
render files once no kept store holds its definition. The canonical bytes are the authority's:
they stay. An item id that stops running a CID is never a reason to unpin it.

## Diagnostics and consistency

`GET /api/v1/cyberia-item-catalog/:itemId/diagnostics?cid=` answers, for each file of a definition,
its CID, its path, whether the registry records it, whether Kubo and the Cluster pin it, and which
CID the path lists. `cyberia catalog check --ipfs` checks every bound definition and reports each
finding in its own category: binding, content, MFS or pin.

## Migration

Older hosts listed content under `/object-layer/<itemId>/` and kept a record per path.

```bash
node bin/cyberia ipfs migrate --dev          # report only
node bin/cyberia ipfs migrate --apply --dev
```

The migration keeps one record per CID, lists every stored definition under its CID from the
definition and the atlas the host stores, never from a file name, and removes every listing by
item id. It is idempotent.
