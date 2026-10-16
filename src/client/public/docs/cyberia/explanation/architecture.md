# Cyberia — Architecture

Cyberia is the real-time MMO extension that runs on Underpost Platform. This document describes the three Cyberia processes, their boundaries, the data flow between them, and the canonical model for tick, snapshot, prediction, reconciliation, interpolation, and replication.

Underpost Platform provides the toolchain, deployment surface, PWA delivery, and base infrastructure. The three Cyberia processes operate on top of it.

---

## Process model

```
┌──────────────────────────────────────────────────────────────────────────┐
│  UNDERPOST PLATFORM (infra · toolchain · deploy · PWA/Workbox)           │
│                                                                          │
│  ┌─────────────────────┐                                                 │
│  │ Persistent backend  │   ← Cyberia content authority + asset backend   │
│  │ ──────────────────  │                                                 │
│  │  engine-cyberia     │     Node.js                                     │
│  │  MongoDB            │                                                 │
│  │  IPFS / Cloudinary  │                                                 │
│  │  ObjectLayerToken   │     Hyperledger Besu (off-line dependency)      │
│  └─────────┬───────────┘                                                 │
│            │ gRPC · REST boot fallback (world load, hot reload)          │
│            ▼                                                             │
│  ┌─────────────────────┐                                                 │
│  │ Authoritative       │   ← Cyberia simulation authority                │
│  │ simulation runtime  │                                                 │
│  │ ──────────────────  │                                                 │
│  │  cyberia-server     │     Go                                          │
│  └─────────┬───────────┘                                                 │
│            │ WebSocket (JSON AOI snapshots, client event batches)        │
│            ▼                                                             │
│  ┌─────────────────────┐                                                 │
│  │ Presentation        │   ← Cyberia render + prediction client          │
│  │ runtime             │                                                 │
│  │ ──────────────────  │                                                 │
│  │  cyberia-client     │     C / WebAssembly (Raylib · Emscripten)       │
│  └─────────────────────┘                                                 │
│            │                                                             │
│            │ REST (atlas frames, asset metadata, client hints,           │
│            │       instance-map static presence + capability activity)   │
│            └──→ engine-cyberia                                           │
└──────────────────────────────────────────────────────────────────────────┘
```

Three processes, strict role separation. The ecosystem is fully operational only when all three are running and healthy at the same time.

---

## Domain boundaries

Cyberia is one participating runtime on the platform. The content it runs on comes from two domains it does not own:

| Domain                                      | Role                                                                                                                                        | Cyberia's relation                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **objectlayer.org** — Object Layer protocol | Canonical schema, canonicalization, content identity (`olCid`). See [the protocol model](../../object-layer/explanation/protocol-model.md). | Cyberia consumes canonical content and applies its own content profile (`CyberiaObjectLayerProfile`) to `data.stats`. It never redefines an Object Layer's identity. |
| **itemledger.com** — ItemLedger             | CID → ERC-1155 token binding, supply, ownership, provenance. See [the ItemLedger overview](../../item-ledger/overview/index.md).            | Cyberia inventory, ownership UI and trade resolve through ItemLedger. ItemLedger computes no Cyberia behavior.                                                       |
| **cryptokoyn.net** — CKY                    | Fungible currency, staking, governance.                                                                                                     | Cyberia coin economy settles in CKY.                                                                                                                                 |
| **cyberiaonline.com** — Cyberia             | Runtime, worlds, maps, instances, entities, actions, quests, lore, item catalog, Cyberia profile, authoring tools.                          | This document.                                                                                                                                                       |

Identity model, frozen:

- `itemId` (`data.item.id`) is a semantic label. Many definitions may share it. Cyberia world content (entities, entity defaults, skills, quests, actions, inventory) names items by label; the `CyberiaItemCatalog` collection binds each label to one `olCid`, and `src/projects/cyberia/catalog/object-layer-catalog.js` is the one path that resolves it. No label resolves without a binding.
- `olCid` is the canonical identity of a definition, computed from its content before any pin or registration.
- `tokenId` is ItemLedger's ERC-1155 representation, derived from `olCid`.
- Ownership is chain state, read through ItemLedger, never stored in the Object Layer.

Lifecycle across the boundary:

- Removing an item from Cyberia unbinds its label and removes this host's copy. The canonical
  definition stays at the Object Layer authority under its cid.
- The authority archives a definition (`PUT /api/v1/object-layer/lifecycle/:cid`); it is never
  destroyed. Cyberia reconciles its bindings against the authority over the same REST contract it
  reads content with (`cyberia catalog reconcile`): a label bound to an
  archived or unknown definition is unbound. Idempotent, explicit, never implicit.
- Every Cyberia write is authorized on the object: the creator of an instance or a map, or an
  admin, changes or removes it; the owner is set from the session and never from the body. The
  game server writes player progress with `CYBERIA_SERVER_API_KEY`; a browser never does.

---

## Role definitions

### engine-cyberia (Node.js) — content authority

The content-authoring backend and persistence layer for Cyberia. Owns persisted data and exposes it through two transports: gRPC (consumed by `cyberia-server` at boot and during hot reload) and REST (consumed by `cyberia-client` for asset distribution and optional presentation overrides).

What it owns:

- Content generation, validation, and persistence.
- Maps, portals, object layers, atlas/sprite-sheet metadata.
- World configuration: AOI radius, economy rules, skill rules, equipment rules, entity gameplay defaults.
- Persisted character/quest/dialogue/action data.
- Player records: profiles, session leases, launch tickets, friendships and quest progress
  ([accounts and persistent players](accounts-and-persistence.md)). It stores the state the game
  server commits and computes no gameplay outcome.
- gRPC `CyberiaDataService` for world load and content streaming, and `CyberiaPlayerService` for
  launch tickets, sessions, state commits and friendships.
- REST boot fallback (`/api/v1/cyberia-instance/boot/*`): the same world-load / hot-reload payloads as the gRPC service, served over REST for deploys where the engine gRPC server is not enabled.
- REST APIs for assets and the optional client-hints overrides.
- Instance Map REST (`/api/v1/cyberia-instance/instance-map/:code/static`): static map topology, authored presence POIs with their quest and action codes, and capability membership. The client derives per-player activity from its own quest store. Never live positions or simulation stats.
- Static content distribution + Cloudinary-backed asset flow.
- Editor and CLI integration for content workflows.

What it does NOT own:

- Real-time simulation. It is not a gameplay runtime.
- Per-tick state advancement.
- Client presentation policy (palette, camera, dev overlay, icon visuals).
- World mutation during gameplay.

### cyberia-server (Go) — authoritative simulation runtime

The tick-based authoritative simulation. Owns world state and the gameplay rules that mutate it.

What it owns:

- Authoritative world state.
- The live state of every player: its `PlayerID` and display name, inventory, coins, XP, quests,
  personal storage and NPC vaults, and its party and chat
  ([player identity](player-identity-and-profile.md), [chat and parties](social.md)). A guest's
  state ends with the connection. An account player's durable state loads from its profile and
  commits back to the engine.
- The tick: a `uint32` advanced once per simulation step at a fixed `tickRate`.
- Simulation phases — the only allowed mutators of world state.
- AOI replication: per-player interest filtering and snapshot emission.
- Input command processing: typed input commands drained from per-player queues each tick.
- Snapshot generation and delivery via WebSocket.

What it does NOT own:

- Persistence. Content comes at boot and at hot reload from engine-cyberia. Player state goes back
  only through `CyberiaPlayerService`; the server never touches MongoDB.
- Client presentation. The server holds no palette, no camera knobs, no dev-overlay flag, no status-icon visuals.

### cyberia-client (C / WebAssembly) — presentation runtime

The render and interactive runtime. Compiled to WASM via Emscripten and served as a Progressive Web App through the Underpost Platform delivery pipeline.

What it owns:

- Rendering and UI.
- Input capture: raw OS events → typed input commands with monotonic sequence numbers.
- Prediction of the local player.
- Reconciliation against authoritative snapshots.
- Interpolation of remote entities.
- Presentation defaults (palette, status-icon visuals, camera knobs, interpolation window, dev-overlay flag) — loaded at startup from the client-hints REST endpoint.
- Optional client-hints fetch for per-instance presentation overrides.

What it does NOT own:

- World simulation.
- Economy outcomes, combat resolution, skill dispatch decisions.
- Any state another client depends on for correctness.

---

## Runtime operating model

The three processes are supervised independently. Each service owns its own monitor and reconnector. The game is playable only when all three are healthy at the same time.

| State      | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `healthy`  | all three Cyberia services are up and connected                      |
| `degraded` | at least one service is reconnecting or unavailable                  |
| `standby`  | gameplay is paused because the full three-service set is not healthy |

Dependency between services is handled by supervision and reconnect loops:

- `cyberia-server` dials `engine-cyberia` gRPC at boot; on dial or load failure it retries over the REST boot fallback (`--data-server-url`, `/api/v1/cyberia-instance/boot/*`) and exits only when both transports fail rather than fabricate a world. On reconnect, it reloads world configuration.
- `cyberia-client` reconnects to `cyberia-server` over WebSocket and re-fetches content from `engine-cyberia` over REST independently.
- If any one of the three services goes unhealthy, the game moves to standby until all three recover.

Underpost Platform deploy orchestration ensures the backend layer is ready before the simulation layer is started, and the simulation layer is ready before the presentation layer connects. This ordering is an infrastructure concern, not a documentation model: the processes themselves are supervised and reconnect without requiring a manual restart chain.

---

## Edge tier

Every `cyberiaonline.com` hostname is served through one Envoy Gateway data plane over HTTP/1.1, HTTP/2 and HTTP/3 (QUIC), with TLS terminated per hostname by SNI. In development the certificates are self-signed and locally trusted, and the hostnames are mapped in `/etc/hosts`, so a browser reaches the real routing stack rather than a dev proxy.

Status pages never reach the engine at all, and the engine knows nothing about them. All three runtimes are agnostic: they return a standard HTTP status code or become unreachable. `underpost-gateway` — one shared Nginx workload in the gateway tier — proxies the site paths and intercepts those statuses, serving the declared document with the original URI and the original status code.

| Condition                   | Declared by                             | Answered from                                            |
| --------------------------- | --------------------------------------- | -------------------------------------------------------- |
| `404` on any unmatched path | a `CyberiaPortal` view with path `/404` | `www.cyberiaonline.com/root/status-pages/404/index.html` |
| `502` / `503` / `504`       | the view flagged `maintenanceDefault`   | `www.cyberiaonline.com/root/maintenance/index.html`      |
| `/offline`, `/maintenance`  | `offlineDefault` / `maintenanceDefault` | the matching context directory                           |

A request to an unknown path reaches the portal, which answers a bare 404; the gateway swaps in the page. The address bar keeps the path the player typed, and the response is a true 404 — no redirect, no client-side script, and nothing for `engine-cyberia`, `cyberia-server` or `cyberia-client` to implement. API sub-paths bypass the interception, so a JSON 404 stays JSON.

Per-instance hosts follow the same layout under their own sub-path — `client.cyberiaonline.com/FOREST/status-pages/404/index.html` — from the `customStatusPages` entries in `conf.instances.json`. Both configuration files live in `engine-private/`, which is a private repository: expect the layout to be referenced without assuming the files are present locally.

---

## Tick model

The server counts ticks; the client counts frames (its own completed fixed steps). Every client event carries its frame. Every snapshot carries the client frame it stands for.

| Concept           | Value           | Notes                                                                                                   |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| **tick**          | `uint32`        | Monotonic simulation step counter on `cyberia-server`. Resets only on world rebuild.                    |
| **tick rate**     | `30` Hz         | Simulation frequency, fixed at compile time on both sides. One snapshot per player goes out every tick. |
| **tick duration** | `1 / tick_rate` | The dt used by every simulation phase.                                                                  |
| **frame**         | `uint32`        | Completed client fixed steps in one session. Not a server tick.                                         |

The server dates each tick in client frames from the newest consumed event: an event pushed in frame F and applied in tick T makes tick T stand for frame F + 1.

---

## Simulation phases

Inside one simulation tick, `cyberia-server` runs the following phases in fixed order. These are the only functions that mutate authoritative world state:

1. `PhaseInput` — drain each player's `InputQueue`; dispatch typed input commands to gameplay handlers.
2. `PhaseLifecycle` — respawn timers, despawn expirations.
3. `PhaseSkills` — skill projectile collisions.
4. `PhaseAI` — bot behaviour decisions.
5. `PhaseMovement` — integrate positions using `tickDuration`.
6. `PhaseLoot` — drop token collection.
7. `PhasePortals` — portal entry and teleport.
8. `phaseReplication` — per player: compute AOI, encode snapshot, dispatch. Runs after every map has stepped.

Phases never read presentation data. They consume world configuration loaded at boot (gameplay rules) and the input queue.

---

## Client render frame

The render frame runs at vsync. Inside one render frame, `cyberia-client` performs:

1. Reconcile against the newest snapshot: replace the own state, drop the events up to `inputConsumedThrough`, replay the rest from the snapshot `frame` to the current frame.
2. Capture raw input → push client events (`kind`, `frame`, `sequence`, payload).
3. Fixed-timestep simulation: while accumulator ≥ `tickDuration`, advance one frame. Then send the new events once.
4. View: draw the own player between the last two fixed steps; interpolate remote entities.
5. Render. Read view models; never mutate world state.

Render frame rate is independent of simulation tick rate. The fixed-timestep accumulator ensures the predicted simulation advances at the authoritative `tickRate` regardless of FPS.

---

## Wire protocol — AOI snapshot

Every WebSocket message is a JSON envelope `{ "type", "payload" }` in a binary frame. The `snapshot` payload carries the AOI `entities`, the `self` block and two cursor fields:

| Field                  | Meaning                                                                   |
| ---------------------- | ------------------------------------------------------------------------- |
| `frame`                | the client frame this state stands for; 0 before the first consumed event |
| `inputConsumedThrough` | highest client event sequence a tick has applied for this player          |

Other message types (`init_data`, `combat_text`, `audio_event`, ...) are not part of the per-tick replication stream.

---

## Input command pipeline

The client sends its new events once per frame as one `events` message. The simulation tick is the only consumer.

```
"events" message  →  receiveMessage  →  one typed InputCommand{kind, frame, sequence, payload} per event
                                              ↓
                                              Session.InputQueue (per-player, bounded)
                                              ↓
                       phaseInput (under world mutex, once per simulation tick)
                                              ↓
                       phase_input_handlers.go — typed dispatch per InputKind
                                              ↓
                       authoritative world state
```

`InputCommand.Sequence` is monotonic per client. Every snapshot carries `inputConsumedThrough`, the highest sequence a tick has applied. The client keeps each event until that cursor passes it, and replays it on top of each new state. The server drops a command at or below the cursor, so each event applies once.

**Movement re-plans once per player per tick, and nothing else throttles it.** Handlers record the tap's destination; `phaseInput` runs one A\* per player after the queue is drained. Taps that land in the same tick describe the same instant, so only the newest is planned. That coalescing is the only bound on pathfinder cost.

Skills are not coalesced: they fire on every accepted tap, so the uplink carries every tap and the inbound rate limiter (`DefaultMessageRate`, 30/s) is what bounds the stream.

The client predicts every tap immediately and never waits on a cadence. `self.actionCooldownMs` is the skill-trigger period only; key steering paces its _refresh_ by it, while a change of heading emits at once.

---

## Presentation metadata ownership

Presentation is client-owned. The authoritative server holds no presentation state.

| Concern                                          | Owner                 | Mechanism                                                                                                           |
| ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Palette (named ColorRGBA entries)                | engine-cyberia (REST) | served by `GET /api/v1/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE`. Source schema: `SharedDefaultsCyberia.js`. |
| Status-icon visuals (icon stems + border colors) | engine-cyberia (REST) | same                                                                                                                |
| Per-entity-type fallback color keys              | engine-cyberia (REST) | same                                                                                                                |
| Camera defaults (smoothing, zoom)                | engine-cyberia (REST) | same                                                                                                                |
| Cell-pixel size, default object dims             | engine-cyberia (REST) | same                                                                                                                |
| Interpolation window                             | engine-cyberia (REST) | same                                                                                                                |
| Dev-overlay flag                                 | engine-cyberia (REST) | same                                                                                                                |
| World configuration (gameplay rules)             | engine-cyberia (gRPC) | `CyberiaInstanceConf` — no presentation; only simulation                                                            |

The cyberia-client carries **no** compile-time palette. `content/presentation_runtime.{c,h}` fetches the full presentation surface on startup; until the fetch settles the runtime returns a tiny inline neutral-grey bootstrap so the splash screen has something to draw. The simulation is unaffected by the fetch outcome.

`cyberia-server` never reads any presentation field. The only "representational" data on the simulation wire is the **active item IDs** carried inside each AOI snapshot. Everything else visual is the client's job, fed by the hints REST endpoint.

---

## Canonical vocabulary

Every Cyberia document uses the same terms. Aliases are not permitted.

| Term                      | Definition                                                                                                                                                                                                                                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tick**                  | Monotonic simulation step counter.                                                                                                                                                                                                                                         |
| **tick rate**             | Simulation Hz on `cyberia-server`.                                                                                                                                                                                                                                         |
| **snapshot**              | AOI-filtered world view at one tick for one player.                                                                                                                                                                                                                        |
| **prediction**            | Optimistic local apply of input commands to the predicted self entity.                                                                                                                                                                                                     |
| **reconciliation**        | Replace the own state with the newest snapshot, then replay the unconsumed client events from the snapshot `frame` to the current frame, with the same motion function and `dt` as the live step.                                                                          |
| **move coalescing**       | One movement re-plan per player per tick, from the newest tap of that tick. The only bound on pathfinder cost.                                                                                                                                                             |
| **display smoothing**     | Per-render-frame lerp of the own player between the last two fixed steps. View-only; it never writes simulation state.                                                                                                                                                     |
| **interpolation**         | Render-time smoothing of remote entities, sampled from snapshot history.                                                                                                                                                                                                   |
| **authoritative server**  | `cyberia-server`. Sole authority on world state.                                                                                                                                                                                                                           |
| **content authority**     | `engine-cyberia`. Sole authority on persisted content and world configuration.                                                                                                                                                                                             |
| **client hints**          | Optional presentation overrides served by engine-cyberia.                                                                                                                                                                                                                  |
| **world configuration**   | Gameplay parameters loaded at server boot from engine-cyberia.                                                                                                                                                                                                             |
| **presentation metadata** | Render-only data. Client-owned.                                                                                                                                                                                                                                            |
| **input command**         | Typed client→server frame with kind, clientTick, sequence, payload.                                                                                                                                                                                                        |
| **AOI**                   | Area of interest — the spatial filter that defines which entities a given player receives.                                                                                                                                                                                 |
| **Instance Map**          | Client strategic overlay of packed map tiles and authored presence POIs. The static REST response supplies topology, presence, and capability membership; the dynamic response supplies per-player capability activity. Live player presence and stats remain client-side. |
| **replication**           | Production and delivery of snapshots from server to clients.                                                                                                                                                                                                               |
| **simulation phase**      | A named step inside one simulation tick.                                                                                                                                                                                                                                   |
| **healthy**               | All three Cyberia services up and connected; game is playable.                                                                                                                                                                                                             |
| **standby**               | Game paused because at least one of the three services is not healthy.                                                                                                                                                                                                     |

Forbidden usages:

- "fps" on `cyberia-server` (use **tick rate**).
- "frame-based" simulation language on the server.
- "game_state" as a god object on the client.
- Render metadata in `cyberia-server` state.
- "engine" without qualifier when the project name is intended. Use **engine-cyberia** for the Cyberia content backend; use **Underpost Platform** for the umbrella product.

---

## Instance topology

A `CyberiaInstance` (persisted in MongoDB, served by engine-cyberia) is a directed graph:

- **Vertices** — `CyberiaMap` documents (grid-based maps).
- **Edges** — `PortalEdge` records connecting source cell → target map/cell.

Portal modes:

| Mode           | Behaviour                                       |
| -------------- | ----------------------------------------------- |
| `inter-portal` | Teleport to a specific cell on a target map     |
| `inter-random` | Teleport to a random valid cell on a target map |
| `intra-portal` | Teleport within the same map to a specific cell |
| `intra-random` | Teleport within the same map to a random cell   |

Topology modes: `linear`, `hub-spoke`, `open`, `grid`.

---

## Entity types

| Type           | Behavior              | Description                |
| -------------- | --------------------- | -------------------------- |
| `player`       | interactive           | Local player (self)        |
| `other_player` | interactive           | Remote players inside AOI  |
| `bot`          | `hostile` / `passive` | AI-controlled entities     |
| `skill`        | `skill`               | Runtime-spawned projectile |
