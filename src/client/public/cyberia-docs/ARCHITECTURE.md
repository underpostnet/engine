# Cyberia — Architecture

Cyberia is the real-time MMO extension that runs on Underpost Platform. This document describes the three Cyberia processes, their boundaries, the data flow between them, and the canonical model for tick, snapshot, prediction, reconciliation, interpolation, and replication.

For the umbrella product and the platform-level scope (bare metal, K8s, CI/CD, PWA, Workbox, Cloudinary, CLI), see [Underpost Platform](UNDERPOST-PLATFORM.md).

---

## Process model

```
┌─────────────────────────────────────────────────────────────────────────┐
│  UNDERPOST PLATFORM (infra · toolchain · deploy · PWA/Workbox)         │
│                                                                         │
│  ┌─────────────────────┐                                                │
│  │ Persistent backend  │   ← Cyberia content authority + asset backend  │
│  │ ──────────────────  │                                                │
│  │  engine-cyberia     │     Node.js                                    │
│  │  MongoDB            │                                                │
│  │  IPFS / Cloudinary  │                                                │
│  │  ObjectLayerToken   │     Hyperledger Besu (off-line dependency)     │
│  └─────────┬───────────┘                                                │
│            │ gRPC (world load, hot reload)                              │
│            ▼                                                            │
│  ┌─────────────────────┐                                                │
│  │ Authoritative       │   ← Cyberia simulation authority               │
│  │ simulation runtime  │                                                │
│  │ ──────────────────  │                                                │
│  │  cyberia-server     │     Go                                         │
│  └─────────┬───────────┘                                                │
│            │ WebSocket (binary AOI, typed input commands)               │
│            ▼                                                            │
│  ┌─────────────────────┐                                                │
│  │ Presentation        │   ← Cyberia render + prediction client         │
│  │ runtime             │                                                │
│  │ ──────────────────  │                                                │
│  │  cyberia-client     │     C / WebAssembly (Raylib · Emscripten)      │
│  └─────────────────────┘                                                │
│            │                                                            │
│            │ REST (atlas, asset metadata, optional client-hints)        │
│            └──→ engine-cyberia                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

Three processes, strict role separation, sequential startup. See [Startup order](#startup-order).

---

## Role definitions

### engine-cyberia (Node.js) — content authority

The content-authoring backend and persistence layer for Cyberia. Owns persisted data and exposes it through two transports: gRPC (consumed by `cyberia-server` at boot and during hot reload) and REST (consumed by `cyberia-client` for asset distribution and optional presentation overrides).

What it owns:

- Content generation, validation, and persistence.
- Maps, portals, object layers, atlas/sprite-sheet metadata.
- World configuration: AOI radius, economy rules, skill rules, equipment rules, entity gameplay defaults.
- Persisted character/quest/dialogue/action data.
- gRPC `CyberiaDataService` for world load and content streaming.
- REST APIs for assets and the optional client-hints overrides.
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
- The tick: a `uint32` advanced once per simulation step at a fixed `tickRate`.
- Simulation phases — the only allowed mutators of world state.
- AOI replication: per-player interest filtering and snapshot emission.
- Input command processing: typed input commands drained from per-player queues each tick.
- Snapshot generation and delivery via WebSocket.

What it does NOT own:

- Persistence (loaded once at boot from engine-cyberia).
- Client presentation. The server holds no palette, no camera knobs, no dev-overlay flag, no status-icon visuals.

### cyberia-client (C / WebAssembly) — presentation runtime

The render and interactive runtime. Compiled to WASM via Emscripten and served as a Progressive Web App through the Underpost Platform delivery pipeline.

What it owns:

- Rendering and UI.
- Input capture: raw OS events → typed input commands with monotonic sequence numbers.
- Prediction of the local player.
- Reconciliation against authoritative snapshots.
- Interpolation of remote entities.
- Compile-time presentation defaults (palette, status-icon visuals, camera knobs, interpolation window, dev-overlay flag).
- Optional client-hints fetch for per-instance presentation overrides.

What it does NOT own:

- World simulation.
- Economy outcomes, combat resolution, skill dispatch decisions.
- Any state another client depends on for correctness.

---

## Startup order

Startup is strictly sequential. Do not describe or attempt to orchestrate these in parallel.

```
1. Persistent backend / sidecar data layer
   ├─ databases (MongoDB; optional MariaDB)
   ├─ engine-cyberia (content + gRPC + REST)
   ├─ static asset backend (Cloudinary path, IPFS where applicable)
   └─ secrets and config

2. cyberia-server (authoritative simulation)
   ├─ dials engine-cyberia gRPC
   ├─ loads world + instance configuration (economy/skill/equipment rules + entity gameplay defaults)
   ├─ initializes simulation tick + AOI replication
   └─ opens WebSocket + REST health/metrics

3. cyberia-client (presentation runtime)
   ├─ load tiny inline bootstrap (neutral grey only — splash render)
   ├─ GET /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE  (required for real palette)
   ├─ connects to cyberia-server via WebSocket
   └─ enters render frame + prediction loop
```

Why sequential:

- `cyberia-server` exits on gRPC dial failure. It never guesses a world.
- `cyberia-client` has no useful work until `cyberia-server` is accepting WebSocket connections.

Underpost Platform deploy orchestration enforces this ordering.

---

## Tick model

The tick is the universal coordinate of the simulation. Every server→client snapshot and every client→server input command carries a tick value.

| Concept                  | Value                                 | Notes                                                                                                                       |
| ------------------------ | ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **tick**                 | `uint32`                              | Monotonic simulation step counter on `cyberia-server`. Resets only on world rebuild.                                        |
| **tick rate**            | Hz (default `30`)                     | Simulation frequency. Authoritative; comes from world configuration. The string "fps" is never used to describe the server. |
| **snapshot rate**        | Hz (default `20`)                     | AOI replication frequency. Decoupled from tick rate so bandwidth scales independently of simulation fidelity.               |
| **tick duration**        | `1 / tick_rate`                       | The dt used by every simulation phase.                                                                                      |
| **client tick estimate** | derived                               | Client estimate of the server's current tick, used to stamp outgoing input commands.                                        |
| **render tick**          | `server_tick_estimate − INTERP_TICKS` | The tick the interpolation module samples remote entities at.                                                               |

Three clocks, one tick number: simulation tick (server), snapshot tick (server replication), render frame (client). The tick number is the only synchronization point.

---

## Simulation phases

Inside one simulation tick, `cyberia-server` runs the following phases in fixed order. These are the only functions that mutate authoritative world state:

1. `phaseInput` — drain each player's `InputQueue`; dispatch typed input commands to gameplay handlers.
2. `phaseLifecycle` — respawn timers, despawn expirations.
3. `phaseSkills` — skill projectile collisions.
4. `phaseAI` — bot behaviour decisions.
5. `phaseMovement` — integrate positions using `tickDuration`.
6. `phasePortals` — portal entry and teleport.

A separate ticker runs replication independently of the simulation:

- `phaseReplication` — per player: compute AOI, encode snapshot, dispatch. Runs at `snapshotRate`.

Phases never read presentation data. They consume world configuration loaded at boot (gameplay rules) and the input queue.

---

## Client render frame

The render frame runs at vsync. Inside one render frame, `cyberia-client` performs:

1. Poll any pending optional client-hints fetch.
2. Capture raw input → build typed input command (`kind`, `clientTick`, `sequence`, payload) → apply to prediction → send on the wire.
3. Reconcile against the latest snapshot: drop input commands ≤ `lastAckedSequence`, rewind self to authoritative position, replay unacked commands.
4. Fixed-timestep simulation: while accumulator ≥ `tickDuration`, advance prediction one tick.
5. Interpolation: compute remote-entity view positions at `renderTick`.
6. Render. Read view models; never mutate world state.

Render frame rate is independent of simulation tick rate. The fixed-timestep accumulator ensures the predicted simulation advances at the authoritative `tickRate` regardless of FPS.

---

## Wire protocol — AOI snapshot header

Snapshots travel as binary WebSocket frames. The header carries the simulation tick and the per-player acknowledged input sequence.

```
Header (binary, little-endian, 11 bytes for AOI snapshots):
  [0]       u8   msgType     0x01 = aoi_update, 0x03 = full_aoi
  [1..4]    u32  tick        — simulation tick at which the snapshot was produced
  [5..8]    u32  lastAcked   — highest InputCommand.Sequence applied for this player
  [9..10]   u16  entityCount — entity blocks that follow
```

Other message types (init data, FCT) use their own headers and are not part of the per-tick replication stream.

---

## Input command pipeline

Client input flows through a typed pipeline. There is no JSON intermediate on the binary path. The simulation tick is the only consumer.

```
WS frame (binary)  →  decode  →  typed InputCommand{kind, clientTick, sequence, payload}
                                              ↓
                                              dispatchInputCommand
                                              ↓
                                              PlayerState.InputQueue (per-player, bounded)
                                              ↓
                       phaseInput (under world mutex, once per simulation tick)
                                              ↓
                       phase_input_handlers.go — typed dispatch per InputKind
                                              ↓
                       authoritative world state
```

`InputCommand.Sequence` is monotonic per client. The server tracks the highest applied sequence per player; `phaseReplication` writes it into every snapshot header. The client drops acknowledged input commands from its prediction replay buffer using this value.

---

## Presentation metadata ownership

Presentation is client-owned. The authoritative server holds no presentation state.

| Concern                                          | Owner                 | Mechanism                                                                 |
| ------------------------------------------------ | --------------------- | ------------------------------------------------------------------------- |
| Palette (named ColorRGBA entries)                | engine-cyberia (REST) | served by `GET /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE`. Source schema: `SharedDefaultsCyberia.js`. |
| Status-icon visuals (icon stems + border colors) | engine-cyberia (REST) | same                                                                      |
| Per-entity-type fallback color keys              | engine-cyberia (REST) | same                                                                      |
| Camera defaults (smoothing, zoom)                | engine-cyberia (REST) | same                                                                      |
| Cell-pixel size, default object dims              | engine-cyberia (REST) | same                                                                      |
| Interpolation window                             | engine-cyberia (REST) | same                                                                      |
| Dev-overlay flag                                 | engine-cyberia (REST) | same                                                                      |
| World configuration (gameplay rules)             | engine-cyberia (gRPC) | `CyberiaInstanceConf` — no presentation; only simulation                  |

The cyberia-client carries **no** compile-time palette. `domain/presentation_runtime.{c,h}` fetches the full presentation surface on startup; until the fetch settles the runtime returns a tiny inline neutral-grey bootstrap so the splash screen has something to draw. The simulation is unaffected by the fetch outcome.

`cyberia-server` never reads any presentation field. The only "representational" data on the simulation wire is the **active item IDs** carried inside each AOI snapshot. Everything else visual is the client's job, fed by the hints REST endpoint.

---

## Canonical vocabulary

Every Cyberia and Underpost Platform document uses the same terms. Aliases are not permitted.

| Term                      | Definition                                                                                                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tick**                  | Monotonic simulation step counter.                                                                                                                                          |
| **tick rate**             | Simulation Hz on `cyberia-server`.                                                                                                                                          |
| **snapshot**              | AOI-filtered world view at one tick for one player.                                                                                                                         |
| **prediction**            | Optimistic local apply of input commands to the predicted self entity.                                                                                                      |
| **reconciliation**        | Drop acknowledged inputs, rewind self to authoritative position, replay unacked inputs.                                                                                     |
| **display smoothing**     | Per-render-frame exponential lerp from the discrete predicted self position to a continuous on-screen position. Decouples the visible main player from sim-tick boundaries. |
| **interpolation**         | Render-time smoothing of remote entities, sampled from snapshot history.                                                                                                    |
| **authoritative server**  | `cyberia-server`. Sole authority on world state.                                                                                                                            |
| **content authority**     | `engine-cyberia`. Sole authority on persisted content and world configuration.                                                                                              |
| **client hints**          | Optional presentation overrides served by engine-cyberia.                                                                                                                   |
| **world configuration**   | Gameplay parameters loaded once at server boot from engine-cyberia.                                                                                                         |
| **presentation metadata** | Render-only data. Client-owned.                                                                                                                                             |
| **input command**         | Typed client→server frame with kind, clientTick, sequence, payload.                                                                                                         |
| **AOI**                   | Area of interest — the spatial filter that defines which entities a given player receives.                                                                                  |
| **replication**           | Production and delivery of snapshots from server to clients.                                                                                                                |
| **simulation phase**      | A named step inside one simulation tick.                                                                                                                                    |

Forbidden usages:

- "fps" on `cyberia-server` (use **tick rate**).
- "frame-based" simulation language on the server.
- "game_state" as a god object on the client.
- Render metadata in `cyberia-server` state.
- "parallel startup" — startup is **sequential**.
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

| Type           | Behavior              | Description                 |
| -------------- | --------------------- | --------------------------- |
| `player`       | interactive           | Local player (self)         |
| `other_player` | interactive           | Remote players inside AOI   |
| `bot`          | `hostile` / `passive` | AI-controlled entities      |
| `skill`        | `skill`               | Runtime-spawned projectile  |
| `coin`         | `coin`                | Runtime-spawned collectible |
| `floor`        | static                | Terrain tile                |
| `obstacle`     | static                | Collision tile              |
| `portal`       | static                | Zone transition trigger     |
| `foreground`   | static                | Foreground decoration       |
| `resource`     | extractable           | Exploitable world object    |

### Entity Status Indicator

The simulation assigns a `status` u8 per entity each replication tick. The numeric IDs are part of the protocol; the visual mapping (icon stem + border color) is fetched by the client from `GET /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE` and resolved through `domain/presentation_runtime`.

| `id` | Name                 | Description                      |
| ---- | -------------------- | -------------------------------- |
| 0    | `none`               | Skill/coin bots, world objects   |
| 1    | `passive`            | Non-aggressive bot               |
| 2    | `hostile`            | Aggressive bot                   |
| 3    | `frozen`             | Player in FrozenInteractionState |
| 4    | `player`             | Normal alive player              |
| 5    | `dead`               | Dead / respawning entity         |
| 6    | `resource`           | Static exploitable resource      |
| 7    | `resource-extracted` | Depleted resource (respawning)   |
| 8    | `action-provider`    | NPC with available actions       |

---

## FrozenInteractionState

When a player opens a modal (dialogue, inventory, shop, craft), the simulation places them in **FrozenInteractionState**:

- Cannot deal or receive damage.
- Cannot send or receive movement events.
- The rest of the world continues normally.
- Managed exclusively by `FreezePlayer` / `ThawPlayer` in the simulation. Entry/exit is driven by typed input commands (`InputKindFreezeStart` / `InputKindFreezeEnd`).
