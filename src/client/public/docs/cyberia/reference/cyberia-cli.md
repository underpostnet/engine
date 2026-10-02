# Cyberia CLI

`cyberia` (`bin/cyberia.js`) is the Cyberia-specific extension layer on top of the `underpost` CLI. Use
it for MMO content and extension workflows; use `underpost` for the shared platform, deployment, and
infrastructure surface. Unrecognized commands pass through to `underpost`.

This page is intentionally command-first: keep it aligned with the shipped CLI surface and avoid
repeating architecture prose unless it changes command behavior.

```bash
node bin/cyberia.js <command> [subcommand] [options]
# or, installed globally:
cyberia <command> [subcommand] [options]
```

| Command        | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `ol`           | object-layer content import, atlas/sprite work                      |
| `instance`     | export / import / drop a Cyberia instance and its related documents |
| `client-hints` | per-instance presentation hints (palette, camera, status icons)     |
| `chain`        | Hyperledger Besu network + ERC-1155 `ObjectLayerToken` lifecycle    |
| `release`      | product repositories: build, lock and publish them                  |
| `run-workflow` | named operational scripts (seed defaults, dashboard, status pages)  |

Most data commands resolve the target DB from `DEFAULT_DEPLOY_ID` / `DEFAULT_DEPLOY_HOST` /
`DEFAULT_DEPLOY_PATH` in the `--env-path` file (default `./.env`). Without that file, they come from the
process environment, as in a pod, which receives its environment from a Secret. `--dev` forces the deploy's
`.env.development` (localhost IPFS, etc.); `--mongo-host` overrides the Mongo host.

---

## `cyberia ol` — object layer

Import, rebuild and drop object layers in MongoDB and IPFS; `--client-public` keeps the asset tree in step.

```bash
cyberia ol [item-id] [options]
```

| Option                                                | Description                                                                     |
| ----------------------------------------------------- | ------------------------------------------------------------------------------- |
| `--import`                                            | Import item-id(s), comma-separated: from `--instance`, else from the asset tree |
| `--instance <code>`                                   | Source `--import` from that instance backup of the content artifact             |
| `--import-types [types]`                              | Batch import by type (e.g. `skin,floors`) or `all` from the asset tree          |
| `--to-atlas-sprite-sheet [dim]`                       | Rebuild the render and publish the definitions that name it                     |
| `--sync`                                              | Bring stored layers in line with the profile; derive their renders again        |
| `--upscale <px-factor>`                               | Pixels per cell of the upscaled derived render; alone, rebuilds the render      |
| `--normalize-stats`                                   | Clamp the stats of every layer the action writes to its item type's bounds      |
| `--random-stats`                                      | Regenerate the stats of every layer the action writes at random                 |
| `--min-stat <n>` / `--max-stat <n>`                   | Narrow the range the two flags above may leave (default `-100`/`100`)           |
| `--show-frame [dir_frame]`                            | View one frame (e.g. `08_0`; default `08_0`)                                    |
| `--show-atlas-sprite-sheet`                           | Save and open the primary render of the bound definition                        |
| `--drop` `--confirm <deploy-id>`                      | Bootstrap only: drop existing data before importing (or standalone)             |
| `--release <release-id>`                              | Work on one candidate release database instead of the workspace                 |
| `--client-public`                                     | Keep the asset tree consistent with the action (see below)                      |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                                        |

```bash
# Restore specific items from an instance backup: the backup is the authority for the item
cyberia ol hatchet,sword --instance FOREST --import

# Import specific items from the asset tree
cyberia ol hatchet,sword --client-public --import --env-path ./engine-private/conf/dd-cyberia/.env.development

# Batch import by type, or everything, from the asset tree
cyberia ol --client-public --import-types skin,floors
cyberia ol --client-public --import-types all

# Atlas / inspect
cyberia ol hatchet --to-atlas-sprite-sheet
cyberia ol hatchet --show-frame 08_0

# Rebuild the render. The scope is an item-id, an instance, or everything.
# The upscale factor is part of the render metadata: a new factor publishes a new definition.
cyberia ol hatchet --to-atlas-sprite-sheet --upscale 40
cyberia ol --instance TEST --upscale 20
cyberia ol --to-atlas-sprite-sheet

# Bring stored items in line with the current profile, stats and schema, and derive their
# upscaled render and idle preview again from the primary render
cyberia ol hatchet --sync
cyberia ol --sync --instance FOREST
cyberia ol --sync

# Balance stats on every layer an action writes
cyberia ol --sync --instance FOREST --normalize-stats
cyberia ol hatchet --client-public --import --random-stats --normalize-stats --max-stat 10

# Bootstrap only: drop an item from MongoDB, then import it again from the asset tree
cyberia ol hatchet --drop --confirm dd-cyberia
cyberia ol hatchet --client-public --import

# Bootstrap only: drop an item and its asset folders
cyberia ol hatchet --drop --confirm dd-cyberia --client-public
```

`--drop` runs the same purge as the Object Layer management view's purge action
(`src/api/object-layer/object-layer.purge.js`): the definition, its render frames, its atlas and
render files, its IPFS pin records and MFS paths, and the labels bound to it. A definition
ItemLedger registers is kept and reported. When ItemLedger does not answer, the drop removes
nothing and names the registration-safety policy.

MongoDB holds every frame: the Object Layer editor and every `ol` action write there only.
`--client-public` keeps `src/client/public/cyberia/assets/<type>/<item-id>/` and the host's built
copy consistent with the action:

- `--import` without `--instance`, and `--import-types`, read the asset tree.
- Each item the action writes (an import, `--sync`, `--to-atlas-sprite-sheet`) has its folder
  replaced with its stored frames and `metadata.json`.
- `--drop` removes the folder of each dropped item.

An item id names the definition the Cyberia item catalog binds it to (`CyberiaItemCatalog`,
resolved through `src/projects/cyberia/object-layer-catalog.js`). Definitions are immutable: a
write through `ol` stores changed content as a draft, publishes it at the Object Layer authority,
and rebinds the label only after the authority stored it. When the authority does not answer, the
draft stays, the label keeps its definition and the command fails. See
[One Object Layer writer](../explanation/domain-boundaries.md#one-object-layer-writer).
Every writing flow first runs the idempotent identity migration, which moves a legacy collection
(unique item id, `sha256`, `data.ledger`) to the content identity model and binds every label that
has one published definition; a label with several definitions and no binding must be bound
explicitly (`POST /api/v1/cyberia-item-catalog { itemId, objectLayerCid }`).

`--sync` works on the definitions the catalog binds, in scope: an item-id, an instance, or every
label. For each one it:

1. Composes the definition again under the current Cyberia profile, stat contract and Object
   Layer schema, with `--normalize-stats` or `--random-stats` applied. A definition whose identity
   changes is written and its label rebinds; its render frames and atlas carry over. An unchanged
   definition writes nothing.
2. Derives the upscaled render and the idle preview again from the primary render.
3. With `--client-public`, writes the item's folder in the asset tree.

Every flow that writes (`--import`, `--import-types`, `--sync`, `--to-atlas-sprite-sheet`,
`--drop`) then reaches what draws and serves the written labels:

- It connects to the host's Valkey, so each write invalidates the engine caches it changes. A
  running engine serves the new labels, atlases and map previews at once.
- It draws again the preview of each map that places a written label. A new picture replaces the
  preview File and a replaced File no map names is deleted; an unchanged picture keeps its File,
  so a rerun writes nothing.
- It asks each registered game server to reload its object layers (`incremental`), when the
  runtime serves the content database the write went to. A workspace write behind an active
  release reaches no reader: the runtime serves the release.

Pinned quest and action references keep the definition they name: a rebind never moves them. A
browser keeps the item pictures it loaded until the page reloads.

---

## `cyberia instance` — instance data

Export / import / drop a game instance and its related maps, entities, actions, quests, object
layers and map audio in MongoDB.

```bash
cyberia instance <instance-code> [options]
```

| Option                                                | Description                                                                               |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `--export [path]`                                     | Export to a backup directory; `./cyberia-content/src/content/instances/<code>` by default |
| `--import [path]`                                     | Import from a backup directory (upsert, preserves UUIDs); the artifact backup by default  |
| `--client-public`                                     | With `--import`: also write the frames and metadata of each item to the asset tree        |
| `--conf`                                              | With `--export`/`--import`: only `cyberia-instance.json` + `-conf.json`; leaves the rest  |
| `--drop` `--confirm <deploy-id>`                      | Bootstrap only: drop all documents associated with the instance code                      |
| `--release <release-id>`                              | Import into, or export from, one content release database                                 |
| `--sync-entities`                                     | Sync the conf's entity-type default references and skill config                           |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                                                  |

The command works on the one instance it names. The default export writes into the instance
sources of the `cyberia-content` checkout; the command fails when the content root is a packed
artifact and no path is given.

```bash
cyberia instance FOREST --import
cyberia instance FOREST --import --client-public
cyberia instance FOREST --export
cyberia instance FOREST --import ./backups/FOREST
cyberia instance FOREST --import --release v3-4-0-8b4d643
cyberia instance FOREST --drop --confirm dd-cyberia
```

An export is a projection of the database: it empties the backup and writes it again, so the next
import brings back only what the world still references. Each Object Layer travels as its
definition (`object-layers/`, without host state such as `origin`), its render frames, its atlas
and the atlas Files, each with the fields its schema declares: a field the database still holds
from an older shape stays out of the backup. A backup holds no `ipfs/` directory: the render payloads are the primary render
and its metadata, and the definition's `_data.json` is its canonical bytes, which only the Object
Layer authority pins. The import pins the render again and checks that IPFS assigns the CIDs the
definition names; a mismatch fails that item. It then has the authority pin the canonical bytes
again, and pins every quest and action reference to its definition.

An atlas that is not the render its definition names — a render at another density than its
metadata describes, or bytes that hash to another CID — is not restored. The import rebuilds the
render from the backup's render frames and publishes the definition that names it. The quest and
action references to the backup definition move to the rebuilt one. An item with neither a valid
atlas nor render frames fails.

The restored definition binds its label. No other definition of the label is removed: content
that pins another cid keeps it, so two instances can run two definitions of one label. The import
reads no ItemLedger.

`instance --import`, `ol --instance --import` and `run-workflow import-content` use the same
restore. It keeps the render frames in MongoDB only. With `--client-public`, `instance --import`
and `ol --instance --import` also write the frames and `metadata.json` of each item to
`src/client/public/cyberia/` and `public/<host><path>`. Every write is a no-op when the database already holds it, so the round trip is stable:
export, import and export again write the same bytes. A backup of an older shape (`ledger`,
`sha256`, raw IPFS payloads, an atlas the render contract does not describe, parent references to
render frames and atlases) migrates in one import and one export. One more import and export sets
the field order of the render Files and the timestamps of the content that pins moved; from then
on the bytes stay the same.

A backup carries audio too. `cyberia-map-audio-confs/<map-code>.json` holds each map's bindings —
that configuration belongs to the map, so it travels with the instance and `--drop` removes it with
the map. The assets those bindings name travel as copies in `cyberia-audio/<code>.json` with their
WAV beside them in `files/`, because a `CyberiaAudio` document is global: the import upserts it by
code and leaves other instances' bindings alone, and `--drop` never removes one. A binding whose
asset is missing is kept as written — the code is the whole reference, so importing the asset later
is all it takes to make it play.

A backup also carries the entity-type defaults the instance's conf **references**, under
`cyberia-entity-type-defaults/<_id>.json`. `CyberiaInstanceConf.entityDefaults` holds
`CyberiaEntityTypeDefault` ids, never copies of the documents, and both directions travel by that
id: the export writes exactly the referenced documents, and the import restores them under their
original `_id` so the references keep resolving.

`--sync-entities` builds those references from the world's own content: a default belongs to the
instance when all of its `liveItemIds` appear together on some entity the maps place — the same
subset containment the runtime resolves an entity with. It is additive and idempotent, so a
hand-linked default that no map places (a player or coin default) is kept, and re-running links
nothing new. A match another instance already references is **reported, not adopted**: two worlds
built on the same art hold documents with identical live item ids, so matching alone cannot tell
them apart, and claiming one stays a deliberate act in the Entity engine.

Skills are **derived, never stored**. The `cyberia-skill` collection is deployment-wide and owns
the definitions; an instance runs the ones whose `triggerItemId` is an item id its own content
names. That content is four things and no more: what its maps place, what its entity-type defaults
wire, what its vendor and assembler catalogs trade, and what its quests ask for or pay out. The
canonical `ENTITY_TYPE_DEFAULTS` count alongside the instance's own, so a world referencing no
player default still holds `atlas_pistol_mk2` and keeps its projectile skill rather than being
disarmed.

That last source is why `hatchet` belongs to a world whose maps place no hatchet: a quest objective
or a shop shelf names one, so a player there can come to hold it and fire it. `--sync-entities`
reports the resolved list, the export writes exactly those documents to
`cyberia-skills/`, and the boot payload sends exactly those to the simulation — one rule, so the
three can no longer disagree. Nothing is written to the instance conf, which carries no
`skillConfig` field: a stored list was a second answer to the same question, and it was the one
that went stale.

The Instance engine has the same action as a button, syncing against the map codes currently
selected.

```bash
cyberia instance FOREST --sync-entities --dev
```

A reference cannot outlive its document. Deleting an entity-type default unlinks it from every
conf first, and both `--export` and `--import` compact the instance's references — dropping any
whose document is gone — so a backup never carries a dangling id and restoring one never recreates
it. Saving a default in the Entity engine compacts the collection too. What is exported is
therefore exactly what resolves.

That reference is what scopes a default to a world. Membership used to be inferred by matching item
ids, and two instances built on the same art therefore matched each other: exporting one dragged in
the other's wiring, and importing it overwrote the original by an `(entityType, liveItemIds)`
"natural key". An id names one document, so neither is possible. A backup written before the change
still embeds the documents in its conf; importing it converts them to references against the
documents in that same backup, creating any it cannot find.

An instance that references nothing is complete, not empty: it runs on the canonical
`ENTITY_TYPE_DEFAULTS`, and referenced documents override only the entity types they cover.

Those documents are also where a world's starting inventory comes from, and an entity has exactly
one. It carries the **union** of every id its default names — `liveItemIds`, `deadItemIds`,
`dropItemIds` and the inventory-only `inventoryItemsIds` — deduplicated. Nothing stores which slots
are worn: the three lifecycle lists are discriminators, and the runtime activates the ones the
context calls for, which is why the whole union is seeded (the server activates a slot that is
already there rather than appending one). Spawn state is alive, so the live ids are the active
ones; everything else is carried empty, a coin balance included.

`overrideItemsIdsState` is the one adjustment to that derivation, per id: `active` forces the spawn
state — a skin the equipment rules would otherwise leave inactive — `quantity` sizes a stack,
which is how a drop bundle declares how many tokens it scatters, and `dropChance` (0–1) says how
often the id actually scatters when the entity dies. It never adds an id; the union decides
membership, an override only what a member starts as.

`dropChance` is meaningful only for an id the build carries in `dropItemIds`; on any other row it is
inert, and the resolver reports 1 there so the simulation reads one field and never a missing one.
Saying nothing means 1, which is what every world did before the field existed, and each drop id is
rolled independently — a build can pair a common drop with a rare one and have both decided on their
own. A deliberate 0 survives, because the wire field is explicitly optional: absent and zero are
different answers.

`inventoryItemsIds` is therefore only for what no lifecycle state ever activates. The instance holds
no item list of its own: it names entity-type defaults, and the items follow from them, so there is
exactly one place to read or change a starting kit.

A world that references no document runs on the foundation baseline for every entity type
([Content artifact](../explanation/content-artifact.md#document-families)). To change a baseline row
for one world, author a document in the Entity engine and reference it from that instance.

---

## `cyberia client-hints` — presentation hints

Manage the per-instance `CyberiaClientHints` document (palette, camera, status icons, interpolation).
These are presentation overrides only — never an instance or server identifier.

```bash
cyberia client-hints [instance-code] [options]
```

| Option                                                | Description                                     |
| ----------------------------------------------------- | ----------------------------------------------- |
| `--seed-defaults`                                     | Upsert canonical presentation-hint defaults     |
| `--export [path]`                                     | Export the hints document to JSON               |
| `--import [path]`                                     | Upsert hints from a JSON file                   |
| `--drop`                                              | Remove the hints document for the instance code |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                        |

```bash
cyberia client-hints cyberia-main --seed-defaults
cyberia client-hints cyberia-main --export ./client-hints-cyberia-main.json
```

---

## `cyberia audio` — audio assets and map audio

Imports recorded [`cyberia-audio`](https://github.com/underpostnet/cyberia-audio) assets into MongoDB and binds
them to a map. Every recording is a pair — `<name>.wav` and its `<name>.json` manifest — and the pair is the unit
of import: a WAV with no manifest beside it is skipped. Produce the pair with `cyberia-audio sfx coin` or
`cyberia-audio music combat`.

```bash
cyberia audio [audio-code] [options]
```

| Option                                                | Description                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------- |
| `--import`                                            | Import WAV + manifest pairs; all of them when no code is given       |
| `--records-path <path>`                               | Records directory to import from (default `./cyberia-audio/records`) |
| `--map <map-code>`                                    | Target `cyberia-map` code to read or configure                       |
| `--set-default-music <audio-code>`                    | Default background music for `--map`                                 |
| `--set-event <logic-event-id:audio-code>`             | Bind an asset to a logic event (e.g. `combat`, `shoot`); repeatable  |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                             |

```bash
# Import every recorded asset, or a single one
cyberia audio --import
cyberia audio combat --import

# Configure a map, then read back what it resolved to
cyberia audio --map FOREST --set-default-music exploration \
  --set-event projectile:shoot --set-event coin_drop_or_transaction:coin
cyberia audio --map FOREST
```

An asset is identified by its `code` alone — `cyberia-audio` stores what a sound _is_ (`code`, `fileId`,
`manifest`) and never what it is for. `manifest.bus` is the `src/audio-module/<bus-id>/` directory the module
was authored in — the asset's natural route, recorded as provenance; a map binding decides where it actually
plays. Configuration lands in `cyberia-map-audio-conf`, one document per map code,
holding `defaultMusic`, a single `events` list and volume/loop/crossfade `settings`. Each binding is the same
pattern the skill model uses — a semantic `logicEventId` resolving to an `audioCode`:

```js
{ logicEventId: 'combat', audioCode: 'combat', settings: { bus: 'music', loop: true, crossfadeMs: 800 } }
{ logicEventId: 'hit', audioCode: 'hit' }
```

`bus` is one vocabulary with one spelling — `music` and `sfx`, declared once in
`SharedDefaultsCyberia.AUDIO_BUSES`. The same two ids name the `cyberia-audio/src/audio-module/<bus-id>/`
directory an asset is authored in, the argument `cyberia-audio <bus-id> <id>` dispatches on, the `bus` a
recorded manifest carries, and the route a binding's `settings.bus` selects.

The event vocabulary is centralized the same way: `SharedDefaultsCyberia.AUDIO_LOGIC_IDS` declares the
events a binding may answer and the bus each one naturally routes to, `cyberia-server-defaults` holds the seed's
bank (`DEFAULT_AUDIO_BANK`) and its bindings (`DEFAULT_AUDIO_BINDINGS`, expanded by `buildAudioEventBindings`),
and `cyberia-client/src/audio/audio_events.h` holds the same ids for the emitting side. A binding naming an
unknown event, or an asset the bank does not carry, throws at import rather than playing silence.

The default bank binds `projectile`, `coin_drop_or_transaction`, `drop`, `item-pickup`, `victory`, `level-up`,
`death`, `heal`, `hit`, `portal`, `ui-click` and `footsteps` as one-shots, and `combat`, `boss`, `portal-cooldown` and
`craft` as music. `victory` is a cue rather than a bed: completing a quest is an event, and holding the
bus for it would take the map's music away for the length of a flourish. `hit` follows the server's damage events, so it sounds for any entity in view rather than
only for the player; `level-up` and `death` arrive as server `audio_event` broadcasts, so a level gained or a defeat sounds for every viewer in reach; `ui-click` follows a tap the interface accepted.

`item-pickup` fires where every route into the inventory bar converges — world loot flying in, a quest
reward, a purchase, an assembly output — so one emission covers them all. It is deliberately plainer than
`coin`, which stays the reward gesture reserved for currency.

`craft` is a held bed rather than a cue, the same shape as `portal-cooldown`: it takes over the map's music
for exactly as long as a recipe's assembly bar charges, loops seamlessly while the player waits, and releases
back to the map on completion. Both holds are arbitrated in `audio_context.c`, which is also what makes them
outlive a combat exchange instead of being cut by it — the modal owns the bar and only reports whether one is
running.

Two cues are about the crowd rather than about one event, because sounding them per entity buries the bus.
`heal` is a milestone: regeneration ticks constantly and in small amounts, so it sounds only when an entity's
life crosses back above zero, 25%, 50% or 75%, once per snapshot however many entities crossed. `footsteps`
is a cadence: one gait cycle repeats for as long as anything with feet is walking in view, at one rate for the
whole scene rather than one per walker.

Portal audio follows the authoritative teleport charge, never the map code: `onPortal` holds `portal-cooldown` as
a bed for as long as the charge runs, and completing it fires the `portal` one-shot while the departing map's
bindings are still resident. An intra-map portal moves the player without changing maps, so watching the map code
was silent for exactly that case; stepping off the pad drops the bed without sounding the jump.

Whether a binding behaves as a bed, a one-shot or a transition follows from the logic event that fires it and the
settings it carries, not from a classification stored twice. The code is checked against the imported assets, so
an unimported one is rejected rather than stored as a dangling name. Bindings merge by `logicEventId`: naming an
event replaces that binding and leaves the others in place. `--map` on its own prints the current configuration
and writes nothing.

The seed is the exception, and deliberately so: it states a map's complete binding set, so re-running it
converges. A binding whose logic event the bank no longer declares — a renamed cue, for instance — is dropped and
logged, instead of surviving as a name the client would keep asking the engine to resolve.

`settings.bus` selects `music` or `sfx` on the binding. It does not classify the asset.
A binding stated without settings keeps the settings it has, or takes the natural routing of its event: a music
event loops on the music bus, and a one-shot plays once with no crossfade. Other omitted settings inherit client or
map defaults. Supported overrides include volume, loop, crossfadeMs, pitch, pan, and priority.

Record the bank and seed one instance from the engine repository root:

```bash
cyberia run-workflow seed-audio --records-only
cyberia run-workflow seed-audio --instance my-instance --dev --mongo-host 127.0.0.1
```

The first command records thirteen WAV and manifest pairs and touches no database.
The second also upserts generic File references, CyberiaAudio metadata, and the audio configuration of one
instance's maps: it reads that instance's own `cyberiaMapCodes` and scores every one of them with the same bank,
bindings and default bed. `--instance <instance-code>` is required unless `--records-only` is set. Every map falls
back to the `exploration` bed; what makes a place sound different is the event that fires there. The instance must
exist and declare at least one map, or the run fails without writing anything.

The seed states each map's whole configuration, so re-running converges rather than accumulating: a bed is
reassigned and a binding the bank no longer declares is dropped.

The Studio map editor edits the same configuration. Its Audio section picks one asset per event, with `idle` as the
default music, and saves the complete binding set of the map. **Seed default** writes to one map what the seed writes
to each map of an instance. It does not record or import the bank, so an asset the collection does not hold is refused.
It reuses the existing engine environment resolution. Full seeding requires that deployment configuration and MongoDB.
Use `--records-path` to select the output directory.
An asset's generic File `_id` is derived from its code and the bytes themselves, so re-importing an unchanged
bank rewrites nothing, and a changed render lands on a new `fileId` while the blob it replaced is deleted in the
same step. That is what keeps the client honest: it fetches a WAV as `/api/v1/file/blob/<fileId>` and caches it, so
new bytes under a reused id would go on playing the old sound. `cyberia-audio.fileId` is registered in
`src/api/file/file.ref.json`, which is the list `underpost db clean-fs` treats as the complete set of File
references — a blob no registered field points at is deleted by that sweep. Deleting an asset, through the API or
by restoring an instance over it, deletes its blob with it. Interrupted imports can be rerun safely.

Recording produces nothing for the client to ship: `cyberia-client` bundles no WAV and fetches every asset from
engine-cyberia by code, so an asset is reachable only once it is seeded.

The client resolves `logicEventId → audioCode → fileId → /api/v1/file/blob/:fileId` and caches decoded WAVs.
Missing remote content uses the generated local bank. Unknown effects become silence.
Regenerate the local bank before building the client after changing audio content.

---

## `cyberia chain` — Besu + ObjectLayerToken

Hyperledger Besu IBFT2 network and ERC-1155 `ObjectLayerToken` (CKY) lifecycle.

### Network

```bash
cyberia chain deploy [options]            # deploy IBFT2 network to Kubernetes
cyberia chain generate-manifests [opts]   # generate manifests without deploying (same options)
cyberia chain remove [--namespace besu] [--clean-keys] [--clean-manifests]
```

Key `deploy` options: `--validators <n>` (4) · `--chain-id <id>` (777771) · `--block-period <s>` (5) ·
`--epoch-length <n>` (30000) · `--besu-image <img>` · `--node-port-rpc <port>` (30545) ·
`--node-port-ws <port>` (30546) · `--namespace <ns>` (besu) · `--pull-image` · `--skip-generate` ·
`--skip-wait`.

### Contract

```bash
cyberia chain compile
cyberia chain test
cyberia chain deploy-contract --network besu-k8s   # deploys ObjectLayerToken, mints initial CKY
```

### Keys

```bash
cyberia chain key-gen                                       # new secp256k1 deployer key
cyberia chain set-coinbase --private-key 0xYOUR_KEY
cyberia chain set-coinbase --from-file ./engine-private/eth-networks/besu/<address>.key.json
```

### Tokens

```bash
cyberia chain register --cid bafkrei... --supply 1               # 1 = NFT, >1 = semi-fungible
cyberia chain register --item-id hatchet --from-db --supply 1    # the current Cyberia definition of the item
cyberia chain batch-register --from-db --items '[{"cid":"bafkrei...","supply":1},{"itemId":"wood","supply":500000}]'
cyberia chain bind     --cid bafkrei...                          # index an existing registration, no transaction
cyberia chain index    [--follow 5000] [--confirmations 0]       # project events into ItemLedger (idempotent, checkpointed)
cyberia chain reconcile                                          # correct projected balances against the chain
cyberia chain mint     --token-id 0 --to 0xABCD... --amount 1000000000000000000000
cyberia chain transfer --from 0x... --to 0x... --token-id 0 --amount 1000
cyberia chain burn     --token-id 0 --address 0x... --amount 500
cyberia chain balance  --address 0xABCD... --token-id 0
cyberia chain status   [--network besu-k8s]                     # chain id, block, supply, pause state
cyberia chain pause   [--network besu-k8s]                      # owner-only transfer freeze / resume
cyberia chain unpause [--network besu-k8s]
```

The token id is the canonical content digest as a uint256 (`uint256(contentHash)`), never derived from the item id or from the CID text.
`--from-db` resolves the CID the item catalog binds to the label. Every registration is recorded as an
ItemLedger binding (`chainId + contractAddress + tokenId → olCid`); `chain index` projects the
contract's events into registrations, transfers and balances, `chain reconcile` checks the balances
against the chain.

---

## `cyberia content-release` — versioned content

The data release of `cyberia-content`. A deploy never drops content: it builds a candidate release
into its own database, validates it, and promotes it by pointer.
[Content releases](../explanation/content-releases.md) holds the model;
[Local content development](../how-to/develop-content-locally.md) the daily workflow around it.

| Subcommand                                 | Description                                                                                                                                                                          |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `prepare <release-id> --channel <channel>` | On the host: fetch the revision the deployment lock pins, from the channel's repository, into a read-only workspace (`--store`)                                                      |
| `build <release-id>`                       | Build, ingest (the foundation, the release sagas, then each instance) and validate a release `--from source` (the prepared workspace), `backups` (the local artifact) or `workspace` |
| `validate [release-id]`                    | Run every check again and record the report; with no release named, check the workspace                                                                                              |
| `promote <release-id>`                     | Serve a validated release; running engines rebind and reload the game servers                                                                                                        |
| `rollback`                                 | Serve the release that was active before the current one                                                                                                                             |
| `retire`                                   | Stop serving the active release: the workspace serves again; `rollback` re-promotes it                                                                                               |
| `status`                                   | List the ledger and the active release                                                                                                                                               |
| `prune [--keep n]`                         | Drop old releases: their databases and ledger entries; never a building, validated or active release, or the rollback target                                                         |
| `activate`                                 | Bind this process to the active release                                                                                                                                              |

```bash
cyberia content-release prepare v3-4-5-8b4d643-04f978b0 --channel private
cyberia content-release build v3-4-5-8b4d643-04f978b0 --from source        # in the Release Job
cyberia content-release build local-1 --from backups --instances test --dev
cyberia content-release build local-2 --from workspace --dev
cyberia content-release validate                      # the workspace, before any build
cyberia content-release retire                        # back to the workspace after a local rehearsal
cyberia content-release promote v3-4-5-8b4d643-04f978b0
cyberia content-release rollback
```

`build --from source` runs the repository's own `npm ci`, `npm test` and `npm pack` on a copy of
the workspace, with no Secret in their environment, then checks that the artifact has the locked
digest and revision. A release carries the worlds the deploy serves: one instance per variant of
`conf.instances.json`. `/` serves `amethyst-strata-expansion`, and `/test` serves `test`. A
production runtime promotes only a release built from an exact source revision.

## `cyberia release` — product repositories

Builds the product repositories, pins them in the deployment lock and publishes them. Each
repository and its release profile come from `releaseRepositories` in
`src/projects/cyberia/catalog-cyberia.js`.

| Repository           | Profile             | `release build` writes                                                                                     |
| -------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------- |
| `cyberia-content`    | `data-release`      | `dist/` and `artifacts/cyberia-content-<version>.tgz`, with its own `pack`                                 |
| `cyberia-audio`      | `source-sync`       | nothing                                                                                                    |
| `cyberia-deployment` | `source-sync`       | the `dd-cyberia` conf and package manifest, the runtime images and the manifests                           |
| `cyberia-server`     | `container-release` | status pages, instance manifests, the dashboard, deploy scripts, `README.md`, Dockerfiles, the CD workflow |
| `cyberia-client`     | `container-release` | status pages, instance manifests, deploy scripts, `README.md`, Dockerfiles, the CD workflow                |

| Subcommand                        | Description                                                                                                                                                                                                                                                  |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `list [--profile <p>] [--locked]` | Print `<name> <repository> <profile>`; `--locked` prints only the repositories the lock pins, with the revision as a fourth field                                                                                                                            |
| `build [names...]`                | Set the [release instances](../how-to/run-the-docker-stack-locally.md#release-instances) in `conf.instances.json`, then build the named repositories (`--dev`, `--node-name`). With no names: the runtime contract, every repository, then the secret scan   |
| `lock`                            | Pin the committed revision of every repository but the deployment, and the content artifact, in `underpost.lock.json` of the deployment                                                                                                                      |
| `verify`                          | Exit non-zero unless the installed content artifact is the one the lock pins                                                                                                                                                                                 |
| `publish [names...]`              | Push the named checkouts (default: all of them) to the public repository, or with `--private` to the private mirror, and track it as origin; the deployment goes last. `--dry-run` tracks each target as origin and lists the commits it lacks, with no push |
| `clean [names...]`                | Discard every change not committed in the checkouts a build writes: the game and deployment checkouts. Commits stay                                                                                                                                          |

```bash
cyberia release build --commit                        # the contract, every repository, the secret scan
cyberia release lock --commit                         # pin what the build committed
cyberia release publish --private                     # to the private mirrors
cyberia release publish cyberia-server                 # one checkout, to its public repository
cyberia release -f publish cyberia-server --private     # force push: it can rewrite the history
cyberia release list --locked                         # <name> <repository> <profile> <revision>
cyberia release build cyberia-server cyberia-client   # what a deploy node builds
cyberia release verify                                # the content check of the image build
```

`-f`, before or after the subcommand, forces the operation; only `publish` reads it, and pushes with
`-f`. `--commit` commits what a build or a lock writes. `lock` refuses a checkout with changes that are
not committed, and a content artifact built at another revision than its checkout. The deployment
holds the lock and pins no revision of its own: a deploy takes it at its branch tip, and every
other repository at the revision it pins. `publish` pushes the deployment only after every
other checkout it publishes. The lock format is the platform
[source lock](../../nexodev/explanation/source-releases.md#the-source-lock).

## `cyberia catalog` — item bindings

```
cyberia catalog reconcile --dev
```

Asks the Object Layer authority about every binding of the item catalog and unbinds a label whose
definition it no longer offers: archived, a draft, or unknown. Idempotent; an authority that does
not answer fails the run and changes nothing. The same reconciliation is served over REST
(`POST /api/v1/cyberia-item-catalog/reconcile`, moderator).

## `cyberia content` — content artifact

The artifact of the content root (`CYBERIA_CONTENT_ROOT`, the `cyberia-content` checkout by default)
is the only content source. These commands show its identity, audit serialized content against it,
and import it. See [Content artifact](../explanation/content-artifact.md). Content is
authored, generated, validated, built and packed in the `cyberia-content` repository, with its own
CLI. A command that needs no content never resolves the content root.

```bash
cyberia content status
cyberia content audit --dev
cyberia content audit --backup ./backups/FOREST,./backups/TEST
cyberia content import --dev --dry-run
cyberia content import --dev
cyberia content import --saga amethyst-strata-expansion --dev
```

| Subcommand | Description                                                                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `status`   | Print the artifact identity                                                                                                                                    |
| `audit`    | Classify every label the database (or `--backup <dirs>`) names or stores, and plan each artifact label                                                         |
| `import`   | Insert every absent document of the foundation families; `--saga <code>` imports one saga and its instance; `--release <id>` writes into that release database |

`import` writes Object Layer definitions and their catalog bindings, entity-type defaults, skills,
maps, quests, dialogues and actions, in that order. An Object Layer item is planned by identity
against the definition its label is bound to: absent, in sync, or differs. A label or a document
that differs is reported and kept; `--rebind` moves it to the artifact, and a rebound label gets a
new definition beside the earlier one. Render, quest and action sources, and placed maps stay as
Studio set them. `--dry-run` plans only.

## `cyberia cache` — platform cache

```
cyberia cache clear --dev
```

Removes every cached value of this host in this environment from Valkey. MongoDB is untouched.
See [the development cache](../how-to/develop-content-locally.md#cache).

## `cyberia run-workflow` — operational scripts

Named scripts from the `scripts/` directory for seeding and build maintenance.

| Subcommand               | Description                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `import-content`         | Import the release content of the artifact: its foundation, the release sagas, then the release instance backups; `--clean --confirm <deploy-id>` drops instead |
| `validate-domains`       | Check API ownership, content partitions, views and components (`--env production`)                                                                              |
| `drop-db`                | Bootstrap only: drop the content collections; needs `--confirm <deploy-id>`                                                                                     |
| `build-server-dashboard` | Build the static cyberia-server metrics/status dashboard (`--dev`, `--output-path`)                                                                             |
| `dev-env [images...]`    | Reset the Docker stack, build its images from `--source local` or `clone`, then run it; `--test`, `--reset`, `--no-build`                                       |
| `docker:<action>`        | The compose action on the Cyberia stack: `generate`, `up`, `down`, `restart`, `logs`, `status`, `reset` and more                                                |

`import-content --clean` runs `drop-db`, then `ol --drop`. Both steps run even if one fails.
If either step fails, the command exits with code 1 and lists each failed command to rerun.

```bash
cyberia run-workflow import-content --clean --dev --confirm dd-cyberia
cyberia run-workflow import-content --dev
cyberia run-workflow build-server-dashboard
cyberia run-workflow dev-env --source clone --channel private
```

`dev-env` is described in [Run the Cyberia Docker stack locally](../how-to/run-the-docker-stack-locally.md).

---

## Bringing up the full stack locally

```bash
node bin run cluster --deploy-id dd-cyberia --dev
```

One command, no extra flags. It resets and rebuilds the node, deploys MongoDB / IPFS / Valkey, imports each database from its git backup, installs the Gateway API control plane, and deploys `dd-cyberia` behind it.

What `--dev` implies, rather than requiring you to pass it:

- **Gateway API + Envoy Gateway**, with **HTTP/3 (QUIC) on by default** beside HTTP/2 and HTTP/1.1.
- **Self-signed, locally trusted TLS** for every hostname in `conf.server.json`, plus the matching `/etc/hosts` entries — so a local Chromium reaches `https://www.cyberiaonline.com` through the real data plane.
- **The gateway static tier seeded** with the portal's `/404`, `/offline` and `/maintenance` documents before the routes are applied, then refreshed from the running container once it is Ready. See [Architecture → Edge tier](../explanation/architecture.md).

The run ends with a gateway status report: listener and route conditions, the workloads behind them, and an HTTPS probe of every route hostname.

### With the MMO services

`--instance-id` brings up custom instances from `engine-private/conf/dd-cyberia/conf.instances.json` in the same run:

```bash
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server --dev
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server,mmo-client --dev
```

Each id runs only where `dd-cyberia` declares it, and only once the portal workload has rolled out — `cyberia-server` dials the engine's gRPC ClusterIP for its world configuration at boot, so the content authority has to be serving first. `mmo-server` names the whole variant family (`amethyst-strata-expansion`, `test`); `mmo-server-test` names one variant.

`server.cyberiaonline.com` and `client.cyberiaonline.com` are issued the same self-signed certificates as the portal hosts and written into the same `/etc/hosts` pass, so the three services are reachable over TLS from a local browser without further setup. In production the same flag issues cert-manager certificates instead.

To place the static documents again without redeploying — after rebuilding the portal client, for instance:

```bash
node bin deploy dd-cyberia development --sync-static --gateway-api --kubeadm
```

---

## Operational rules

- Preserve public CLI entrypoints and command names unless a change is intentionally breaking.
- Reuse existing helpers for config loading, env resolution, path normalization, and deploy selection.
- Prefer one source of truth for generated manifests, deploy IDs, runtime choice, and asset metadata.
- Treat generated artifacts (atlases, manifests, dashboard HTML) as outputs only; never hand-edit them.
- `engine-private/` is a private external dependency; never assume its contents exist locally.
