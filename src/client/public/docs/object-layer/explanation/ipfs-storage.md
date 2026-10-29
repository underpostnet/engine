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

## MFS is optional

No read depends on an MFS path: the gateway and every runtime read address content by CID. Kubo
announces every block it stores (its default reprovider strategy), so nothing provides through MFS
either. MFS is off unless `IPFS_MFS_ENABLED=true`. With MFS off, no listing is created, read or
removed; adding, pinning, reading and unpinning work as before; a diagnostic reports `MFS off`, and
`cyberia catalog check --ipfs` reports no MFS finding. Turn it on where a person browses the IPFS Web
UI "Files" view.

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
each file to Kubo, pins it there and on the Cluster, records it, and, with MFS on, lists it under its
MFS path. A listing is a reference to the CID, never a second copy of the bytes: the copy lands beside
the path and then replaces the entry there, so a failed copy keeps the earlier listing. A rerun writes
the same records and paths. A file the node stores under another CID than the contract names, or an
answer that holds no CID, is refused. An add whose Cluster pin failed says so in its result; the node
keeps the content, and `pinCid` reconciles the Cluster pin.

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
its CID, its path, whether the registry records it, whether Kubo pins it, whether the Cluster pins it
on as many peers as the pin's `replication_factor_min` asks (with the pinned, required and pending
peers), and which CID the path lists while MFS is on. `cyberia catalog check --ipfs` checks every bound definition and reports each
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

## Limits

Every request to Kubo, the Cluster and the gateway runs inside one budget, its body included:
`IPFS_KUBO_TIMEOUT_MS`, `IPFS_CLUSTER_TIMEOUT_MS`, `IPFS_GATEWAY_TIMEOUT_MS` (each
`IPFS_HTTP_TIMEOUT_MS` by default, 10 s). A gateway read accepts at most `IPFS_MAX_READ_BYTES`
(64 MiB) unless its caller names a limit.
