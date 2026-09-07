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

| Command        | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `ol`           | object-layer content import, procedural generation, atlas/sprite work |
| `instance`     | export / import / drop a Cyberia instance and its related documents   |
| `client-hints` | per-instance presentation hints (palette, camera, status icons)       |
| `chain`        | Hyperledger Besu network + ERC-1155 `ObjectLayerToken` lifecycle      |
| `run-workflow` | named operational scripts (seed defaults, build manifests/dashboard)  |

Most data commands resolve the target DB from `DEFAULT_DEPLOY_ID` / `DEFAULT_DEPLOY_HOST` /
`DEFAULT_DEPLOY_PATH` in the `--env-path` file (default `./.env`). `--dev` forces the deploy's
`.env.development` (localhost IPFS, etc.); `--mongo-host` overrides the Mongo host.

---

## `cyberia ol` — object layer

Import PNG assets, generate procedural layers, build atlas sprite sheets, push to IPFS + MongoDB.

```bash
cyberia ol [item-id] [options]
```

| Option                                                                               | Description                                                              |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `--import`                                                                           | Import specific item-id(s), comma-separated, from the asset directory    |
| `--import-types [types]`                                                             | Batch import by type (e.g. `skin,floors`) or `all`                       |
| `--generate`                                                                         | Generate procedural layers from a semantic item-id (e.g. `floor-desert`) |
| `--count <n>` / `--density <0..1>`                                                   | Shape count multiplier (default `3`) / density (default `0.5`)           |
| `--seed <seed>`                                                                      | Deterministic seed for `--generate` (e.g. `fx-42`)                       |
| `--frame-index <n>` / `--frame-count <n>`                                            | Start frame (default `0`) / frame count (default `1`)                    |
| `--to-atlas-sprite-sheet [dim]`                                                      | Build a consolidated atlas PNG for the item                              |
| `--show-frame [dir_frame]`                                                           | View one frame (e.g. `08_0`; default `08_0`)                             |
| `--show-atlas-sprite-sheet`                                                          | Display the atlas PNG for the item                                       |
| `--drop`                                                                             | Drop existing data before importing (or standalone)                      |
| `--client-public` / `--git-clean`                                                    | With `--drop`: also remove static asset folders / run clean              |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` · `--storage-file-path <path>` | env / DB / dev / filter overrides                                        |

```bash
# Import specific items
cyberia ol hatchet,sword --import --env-path ./engine-private/conf/dd-cyberia/.env.development

# Batch import by type, or everything
cyberia ol --import-types skin,floors
cyberia ol --import-types all

# Procedural generation
cyberia ol floor-desert --generate --seed fx-42
cyberia ol floor-grass  --generate --frame-count 4 --count 5 --density 0.7

# Atlas / inspect
cyberia ol hatchet --to-atlas-sprite-sheet
cyberia ol hatchet --show-frame 08_0

# Drop + re-import a single item, including static folders
cyberia ol hatchet --drop --client-public --import
```

---

## `cyberia instance` — instance data

Export / import / drop a game instance and its related maps, entities, actions, quests, object
layers and map audio in MongoDB.

```bash
cyberia instance [instance-code] [options]
```

| Option                                                | Description                                                             |
| ----------------------------------------------------- | ----------------------------------------------------------------------- |
| `--export [path]`                                     | Export instance and related documents to a backup directory             |
| `--import [path]`                                     | Import from a backup directory (upsert, preserves UUIDs)                |
| `--conf`                                              | With `--export`/`--import`: only `cyberia-instance.json` + `-conf.json` |
| `--drop`                                              | Drop all documents associated with the instance code                    |
| `--sync-entities`                                     | Sync the conf's entity-type default references and skill config          |
| `--export-current-fallbackworld`                      | Capture the in-memory procedural fallback world, then export it         |
| `--keep-fallback-codes`                               | Capture using the raw `fallback-map-*` / canonical action-quest codes   |
| `--fallback-url <url>`                                | Capture the world a running engine serves instead of regenerating it    |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                                |

```bash
cyberia instance FOREST --export ./backups/FOREST
cyberia instance FOREST --import ./backups/FOREST
cyberia instance FOREST --drop
```

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
state — a skin the equipment rules would otherwise leave inactive — and `quantity` sizes a stack,
which is how a drop bundle declares how many tokens it scatters. It never adds an id; the union
decides membership, an override only what a member starts as.

`inventoryItemsIds` is therefore only for what no lifecycle state ever activates. The instance holds
no item list of its own: it names entity-type defaults, and the items follow from them, so there is
exactly one place to read or change a starting kit.

To point a world at the seeded collection, name it:

```bash
cyberia run-workflow seed-entities --instance FOREST --dev
```

`seed-entities` upserts `ENTITY_TYPE_DEFAULTS` into the collection; `--instance` then makes that
instance's conf reference exactly those documents, replacing whatever it referenced before, so
re-running converges rather than accumulating.

### Capturing the procedural fallback world

The fallback world is never persisted: every engine process rebuilds it from the code defaults at
boot and serves it whenever a requested instance is absent. `--export-current-fallbackworld` freezes
that in-memory world into MongoDB under a real instance code — maps and portal topology, the
instance conf, and the content collections the fallback path serves from code rather than the DB
(skills, entity-type defaults, dialogues, actions, quests) — and then exports it like any other
instance. It writes each captured map's audio configuration too, under the captured map code,
binding only the codes an imported `CyberiaAudio` actually carries and reporting the rest: the
client asks for audio by map code, so a namespaced capture would otherwise play nothing.

```bash
# Freeze the current fallback world as PROC-1 and back it up
cyberia instance PROC-1 --export-current-fallbackworld --dev

# Restore it later as an ordinary persisted instance
cyberia instance PROC-1 --import --dev
```

Map, action and quest codes are namespaced under the instance code (`fallback-map-0` →
`PROC-1-map-0`) so successive captures never overwrite each other; `--keep-fallback-codes` writes
the canonical codes verbatim instead. Sprites are the one thing a capture cannot synthesise: when a
referenced item id has no `ObjectLayer` document the command aborts and names the ids to import with
`cyberia ol <ids> --import`. Staged fallback default items live only in the serving engine process,
so pass `--fallback-url http://localhost:4001` to capture a live world rather than regenerating it.

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

| Option                                                | Description                                                            |
| ----------------------------------------------------- | ------------------------------------------------------------------------ |
| `--import`                                            | Import WAV + manifest pairs; all of them when no code is given         |
| `--records-path <path>`                               | Records directory to import from (default `./cyberia-audio/records`)   |
| `--map <map-code>`                                    | Target `cyberia-map` code to read or configure                         |
| `--set-default-music <audio-code>`                    | Default background music for `--map`                                   |
| `--set-event <logic-event-id:audio-code>`             | Bind an asset to a logic event (e.g. `combat`, `shoot`); repeatable    |
| `--env-path <path>` · `--mongo-host <host>` · `--dev` | env / DB / dev overrides                                               |

```bash
# Import every recorded asset, or a single one
cyberia audio --import
cyberia audio combat --import

# Configure a map, then read back what it resolved to
cyberia audio --map FOREST --set-default-music exploration \
  --set-event projectile:shoot --set-event coin_drop_or_transaction:coin
cyberia audio --map FOREST
```

An asset is identified by its `code` alone — `cyberia-audio` stores what a sound *is* (`code`, `fileId`,
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

The fallback bank binds `projectile`, `coin_drop_or_transaction`, `drop`, `heal`, `hit`, `portal`, `ui-click`
and `footsteps` as one-shots, and `combat`, `boss`, `victory` and `portal-cooldown` as music. `hit` follows the
server's damage events, so it sounds for any entity in view rather than only for the player; `ui-click` follows a
tap the interface accepted.

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

The fallback seed is the exception, and deliberately so: it states a map's complete binding set, so re-running it
converges. A binding whose logic event the bank no longer declares — a renamed cue, for instance — is dropped and
logged, instead of surviving as a name the client would keep asking the engine to resolve.

`settings.bus` selects `music` or `sfx` on the binding. It does not classify the asset.
Omitted settings inherit client or map defaults. Supported overrides include volume, loop, crossfadeMs, pitch, pan, and priority.
Set music event routing through the map configuration API or the fallback seed workflow.
Changing only an event's audio code preserves its existing settings.

Record and seed the complete fallback bank from the engine repository root:

```bash
cyberia run-workflow seed-audio --records-only
cyberia run-workflow seed-audio --dev --mongo-host 127.0.0.1
cyberia run-workflow seed-audio --instance my-instance --dev --mongo-host 127.0.0.1
```

The first command records thirteen WAV and manifest pairs and touches no database.
The second also upserts generic File references, CyberiaAudio metadata, and audio configuration for the fallback maps.
The third configures one instance's maps instead: `--instance <instance-code>` reads that instance's own
`cyberiaMapCodes` and scores every one of them with the same bank, bindings and default bed the fallback world
uses, so a world built on that topology sounds the way the fallback world does. Every map falls back to the
`exploration` bed; what makes a place sound different is the event that fires there. The instance must exist and
declare at least one map, or the run fails without writing anything.

Every form states each map's whole configuration, so re-running converges rather than accumulating: a bed is
reassigned and a binding the bank no longer declares is dropped.
It reuses the existing engine environment resolution. Full seeding requires that deployment configuration and MongoDB.
Use `--records-path` to select the output directory.
An asset's generic File `_id` is derived from its code and the bytes themselves, so re-importing an unchanged
bank rewrites nothing, and a changed render lands on a new `fileId` while the blob it replaced is deleted in the
same step. That is what keeps the client honest: it fetches a WAV as `/api/file/blob/<fileId>` and caches it, so
new bytes under a reused id would go on playing the old sound. `cyberia-audio.fileId` is registered in
`src/api/file/file.ref.json`, which is the list `underpost db clean-fs` treats as the complete set of File
references — a blob no registered field points at is deleted by that sweep. Deleting an asset, through the API or
by restoring an instance over it, deletes its blob with it. Interrupted imports can be rerun safely.

Recording produces nothing for the client to ship: `cyberia-client` bundles no WAV and fetches every asset from
engine-cyberia by code, so an asset is reachable only once it is seeded.

The client resolves `logicEventId → audioCode → fileId → /api/file/blob/:fileId` and caches decoded WAVs.
Fallback maps use exploration, combat, boss, and exploration music in order.
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
cyberia chain register <item-id> --from-db --supply 1            # 1 = NFT, >1 = semi-fungible
cyberia chain batch-register --from-db --items '[{"itemId":"wood","supply":500000}]'
cyberia chain mint     --token-id 0 --to 0xABCD... --amount 1000000000000000000000
cyberia chain transfer --from 0x... --to 0x... --token-id 0 --amount 1000
cyberia chain burn     --token-id 0 --address 0x... --amount 500
cyberia chain balance  --address 0xABCD... --token-id 0
cyberia chain status   [--network besu-k8s]                     # chain id, block, supply, pause state
cyberia chain pause   [--network besu-k8s]                      # owner-only transfer freeze / resume
cyberia chain unpause [--network besu-k8s]
```

`--from-db` resolves the canonical IPFS CID from MongoDB (recommended over manual `--metadata-cid`).

---

## `cyberia run-workflow` — operational scripts

Named scripts from the `scripts/` directory for seeding and build maintenance.

| Subcommand                   | Description                                                                            |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `import-default-items`       | Import default object layers, skills, dialogues, actions/quests, client-hints to Mongo |
| `seed-skills`                | Upsert `DefaultSkillConfig` into the `cyberia-skill` collection (full records)         |
| `seed-dialogues`             | Upsert `DefaultCyberiaDialogues` into the `cyberia-dialogue` collection                |
| `generate-semantic-examples` | Generate one procedural example per registered semantic prefix                         |
| `build-manifest`             | Build K8s Deployment + Service manifests for mmo-client / mmo-server                   |
| `build-server-dashboard`     | Build the static cyberia-server metrics/status dashboard (`--dev`, `--output-path`)    |

```bash
cyberia run-workflow import-default-items --env-path ./engine-private/conf/dd-cyberia/.env.development
cyberia run-workflow seed-skills
cyberia run-workflow generate-semantic-examples
cyberia run-workflow build-manifest
cyberia run-workflow build-server-dashboard
```

---

## Bringing up the full stack locally

```bash
node bin run cluster --deploy-id dd-cyberia --dev
```

One command, no extra flags. It resets and rebuilds the node, deploys MongoDB / IPFS / Valkey, imports each database from its git backup, installs the Gateway API control plane, and deploys `dd-cyberia` behind it.

What `--dev` implies, rather than requiring you to pass it:

- **Gateway API + Envoy Gateway**, with **HTTP/3 (QUIC) on by default** beside HTTP/2 and HTTP/1.1.
- **Self-signed, locally trusted TLS** for every hostname in `conf.server.json`, plus the matching `/etc/hosts` entries — so a local Chromium reaches `https://www.cyberiaonline.com` through the real data plane.
- **The gateway static tier seeded** with the portal's `/404`, `/offline` and `/maintenance` documents before the routes are applied, then refreshed from the running container once it is Ready. See [Architecture → Edge tier](./ARCHITECTURE.md).

The run ends with a gateway status report: listener and route conditions, the workloads behind them, and an HTTPS probe of every route hostname.

### With the MMO services

`--instance-id` brings up custom instances from `engine-private/conf/dd-cyberia/conf.instances.json` in the same run:

```bash
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server --dev
node bin run cluster --deploy-id dd-cyberia --instance-id mmo-server,mmo-client --dev
```

Each id runs only where `dd-cyberia` declares it, and only once the portal workload has rolled out — `cyberia-server` dials the engine's gRPC ClusterIP for its world configuration at boot, so the content authority has to be serving first. `mmo-server` names the whole variant family (`amethyst-strata-expansion`, `FOREST`, `TEST`); `mmo-server-forest` names one variant.

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
