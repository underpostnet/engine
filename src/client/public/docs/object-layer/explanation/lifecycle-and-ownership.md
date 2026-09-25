# Lifecycle and ownership

How a definition is stored, who may act on it, how it is archived, and what a purge removes.

## Persistence

The `ObjectLayer` collection (`src/api/object-layer/object-layer.model.js`) stores one
immutable document per definition:

- `cid` and `contentHash` are computed on creation and are unique; a save that would change
  the content is refused.
- `data.item.id` is indexed for discovery and is not unique.
- `published` records whether a node serves the canonical bytes; it is storage state, outside
  the identity.
- `createdBy` is the principal that stored the copy: a user id of the host, or `service:<domain>`
  for a definition another domain published with the service key. It is set once, on creation,
  from the session, never from the request body.
- `archivedAt` is the lifecycle. An archived definition stays stored under its cid and is
  offered to no one; it is never destroyed. The Object Layer authority owns the lifecycle of
  published content; a consumer archives only its drafts.
- `upsertByIdentity(payload)` resolves identical content to the stored document and offers it
  again if it was archived; new content creates one. `findByCid(cid)` resolves a definition.
  `GET /object-layer/search-item-ids` searches labels.
- `migrateIdentity({ profile })` moves a legacy collection (unique `data.item.id`, `sha256`,
  `data.ledger`) to this model: it stamps the profile, recomputes the identity, removes the
  ledger and drops the legacy indexes. It is idempotent and runs before every CLI write flow.

## Authorization

Reads are public. A write names its actor from the session (`req.auth.user`), never from the
body: the owner of a copy is the principal that stored it, an admin overrides, and everyone
else is refused with `403` before anything is written. Route guards (`moderatorGuard`,
`adminGuard`) say who may call; `assertOwnerOrAdmin` in `src/server/security/auth.js` says who
may act on one resource.

## Purge

A purge is the operator's removal: it takes the definition and everything stored under it on one
host — the document, its render frames, its atlas and every render File the atlas owns, the IPFS
pin records, the pinned content and its MFS paths, and what the host's Studio keeps for it (the
labels bound to the definition, and its frames in the asset tree). Nothing restores it.

Definitions share content: two of one label can name one render. A purge keeps the render pins
and the labels a remaining definition still names. The render frames and the atlas of a
definition are its own, so they go with it; a render File another atlas still holds stays.

`src/api/object-layer/object-layer.purge.js` is the one implementation: the admin route, the
Object Layer management view's purge action, `cyberia ol --drop` and `cyberia instance --drop`
all call it. It is rerunnable, and it reports what it removed.

A definition ItemLedger registers is never purged: a token type names content that must stay
resolvable. The purge reports it as kept and the route refuses.

Each host purges what it stores, and no purge reaches another host: a consumer that cached the
definition unbinds it on its next reconciliation (`cyberia catalog reconcile`).

## Cache

Every host caches what it serves in Valkey through the platform cache
(`src/server/storage/cache.js`), never as its source of truth. A list or a definition by key is
kept for the registry policy (5 min) and invalidated by every write to the host's `ObjectLayer`
collection: publication, a cache copy, a lifecycle change, a delete, a catalog binding. What is
derived from a render (metadata, upscaled render, idle preview, animation) is addressed by the
canonical render CID and kept for good. The render File an item label resolves to follows the
registry policy, and a write to the host's atlases invalidates it too. Every JSON answer and every
label render carries `Cache-Control: public|private, no-cache` with an ETag, so a browser
revalidates and receives `304` for what it holds.
