<p align="center">
  <img src="https://www.cyberiaonline.com/assets/splash/apple-touch-icon-precomposed.png" alt="CYBERIA online"/>
</p>

<div align="center">

<h1>cyberia server</h1>

</div>

**Path:** `cyberia-server/` · **Language:** Go · **Role:** authoritative simulation runtime for Cyberia

`cyberia-server` is the authoritative simulation runtime for the Cyberia MMO extension on Underpost Platform. It owns world state, advances a fixed-rate tick, drains typed input commands from connected clients, and dispatches AOI-filtered snapshots on a separately-paced replication tick.

It is **not** the content authority. World content is loaded once at boot from `engine-cyberia` over gRPC. It is **not** the render-policy authority. Presentation is owned by `cyberia-client`.

---

## Operating model

Three independent processes, non-overlapping roles. The ecosystem is playable only when all three are running and healthy at the same time.

```
engine-cyberia (Node.js)                cyberia-server (Go)              cyberia-client (C/WASM)
─────────────────────────               ──────────────────               ──────────────────────
content authority                       authoritative simulation         presentation runtime
persisted maps + rules                  tick + AOI + snapshots           render + prediction

      │  gRPC  GetFullInstance               │  WebSocket binary
      │────────────────────────────────────► │  AOI snapshots + init
      │  (world configuration:               │  ▲
      │   AOI radius, economy,               │  │ typed input commands
      │   skill, equipment,                  │  │
      │   entity gameplay defaults)          │  │
      │                                      │  │
      ▼                                      ▼  ▼
   (boot + hot reload)                   tick loop + replication
```

- Each service is supervised independently and owns its own monitor and reconnector.
- `cyberia-server` dials `engine-cyberia` gRPC at boot and exits on dial failure rather than fabricate a world.
- On reconnect, world configuration is reloaded via `GetFullInstance(instanceCode)`.
- If any one of the three services is unhealthy, the game moves to standby until all three recover.

The server speaks two protocols:

- **gRPC, inbound, at boot and hot reload:** consumes world configuration from `engine-cyberia`.
- **WebSocket binary, ongoing:** delivers AOI snapshots to clients, accepts typed input commands.

There is no per-tick traffic between `cyberia-server` and `engine-cyberia`, and no presentation authority in the Go runtime.

---

## Tick model

The tick is the universal coordinate of the simulation.

| Concept           | Default         | Notes                                                                                                   |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| **tick**          | `uint32`        | Monotonic, advanced once per simulation step. Resets only on world rebuild.                             |
| **tick rate**     | `30` Hz         | Simulation Hz. Loaded from world configuration. **The string `fps` is not used to describe this rate.** |
| **snapshot rate** | `20` Hz         | AOI replication Hz. Decoupled from tick rate so bandwidth scales independently of simulation fidelity.  |
| **tick duration** | `1 / tick_rate` | The dt used by every simulation phase.                                                                  |
| **current tick**  | `uint32`        | The simulation step about to run (or just produced). Stamped into every outgoing snapshot.              |

Two independent tickers:

| Ticker      | Rate              | Responsibility                                               |
| ----------- | ----------------- | ------------------------------------------------------------ |
| simulation  | `tickRate` Hz     | advance world by exactly one tick; run phases in fixed order |
| replication | `snapshotRate` Hz | per-player AOI filter + encode + dispatch                    |

Movement integration is `dt`-based: `step = speed * tickDuration.Seconds()`. Frame-count integration is not used anywhere on the server.

---

## Simulation phases

Inside one simulation tick, the phases run in a fixed order. Phases are the **only** functions allowed to mutate world state.

1. **`phaseInput`** — drain each player's `InputQueue`; dispatch typed input commands to gameplay handlers.
2. **`phaseLifecycle`** — respawn timers, despawn expirations.
3. **`phaseSkills`** — skill projectile collisions.
4. **`phaseAI`** — bot behaviour decisions.
5. **`phaseMovement`** — integrate positions using `tickDuration`.
6. **`phasePortals`** — portal entry and teleport.

Separately, on the replication ticker:

7. **`phaseReplication`** — per player: compute AOI rectangle, build snapshot, dispatch via the player's WebSocket write channel.

Phases never read presentation data. Phases consume world configuration (gameplay rules) and the per-player input queue.

---

## Input command pipeline

Client input is typed end-to-end. There is no JSON intermediate on the binary path. The simulation tick is the only consumer of input commands.

```
WS frame (binary)  →  decode  →  typed InputCommand{kind, clientTick, sequence, payload}
                                              │
                                              ▼
                                              dispatchInputCommand
                                              │
                                              ▼
                                              PlayerState.InputQueue (per-player, bounded ring)
                                              │
                                              ▼
                         phaseInput (under world mutex, once per simulation tick)
                                              │
                                              ▼
                         phase_input_handlers.go — typed dispatch per InputKind
                                              │
                                              ▼
                         authoritative world state
```

| Property                          | Detail                                                                                                                                             |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| One queue per player              | drained exactly once per simulation tick                                                                                                           |
| One typed handler per `InputKind` | each handler runs under the world mutex held by `phaseInput`                                                                                       |
| One source of truth               | `phase_input_handlers.go` is the only file that translates an input command into world state                                                       |
| Sequence numbering                | `InputCommand.Sequence` is monotonic per client; the server tracks the highest applied sequence per player in `PlayerState.LastAckedInputSequence` |

A second uplink path, `handleJSONUplink`, parses text-framed JSON uplinks into the same typed `InputCommand` and routes them through the same per-tick queue. No synchronous game-state mutation runs on the WebSocket read goroutine.

### Input kinds

| Kind             | Wire byte | Effect                                                                          |
| ---------------- | --------- | ------------------------------------------------------------------------------- |
| `PlayerAction`   | `0x11`    | TAP — movement intent + skill trigger                                           |
| `ItemActivation` | `0x12`    | Equip/unequip an ObjectLayer item; validated against equipment rules            |
| `FreezeStart`    | `0x13`    | Enter FrozenInteractionState (blocks movement/damage; rest of world unaffected) |
| `FreezeEnd`      | `0x14`    | Exit FrozenInteractionState                                                     |
| `Chat`           | `0x15`    | Pure relay; no game-state mutation                                              |
| `GetItemsIDs`    | `0x16`    | Skill-item-id lookup; produces a response frame                                 |
| `Handshake`      | `0x10`    | Connection establishment; no gameplay effect                                    |

---

## AOI replication

The AOI system filters world state per-player so each client receives only what its character can perceive.

Per player:

- AOI is a rectangle centered on the player position with size determined by `aoiRadius` from world configuration.
- On each replication tick, the server iterates the player's map, includes any entity whose bounding rectangle overlaps the AOI, and emits a snapshot.

### Snapshot header (binary, little-endian)

```
[0]      u8   msgType     0x01 = aoi_update, 0x03 = full_aoi
[1..4]   u32  tick        simulation tick at which the snapshot was produced
[5..8]   u32  lastAcked   highest InputCommand.Sequence applied for this player
[9..10]  u16  entityCount entity blocks that follow
```

The `tick` and `lastAcked` fields are how the client reconciles its predicted self with authoritative state. The client drops input commands with `sequence ≤ lastAcked` from its replay buffer, then rewinds and replays the rest.

Other message types (init data, FCT) carry their own headers and are not part of the per-tick replication stream.

---

## World configuration

World configuration is loaded once at boot from engine-cyberia via gRPC `GetFullInstance(instanceCode)`. The simulation consumes the following from it:

| Field                                                                | Used for                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `cellSize`                                                           | grid math                                                                         |
| `tickRate`                                                           | simulation Hz                                                                     |
| `aoiRadius`                                                          | per-player AOI rectangle size                                                     |
| `entityBaseSpeed`, `entityBaseMaxLife`, `entityBaseActionCooldownMs` | base stats                                                                        |
| `economyRules`                                                       | Fountain & Sink coin economy                                                      |
| `skillRules`                                                         | projectile / doppelganger spawn rates and lifetimes                               |
| `equipmentRules`                                                     | item activation constraints (one-per-type, requireSkin, activeItemTypes)          |
| `entityDefaults[*]`                                                  | per-entity-type gameplay defaults: live/dead/drop item IDs, default object layers |

World configuration is gameplay-only. Presentation fields (palette, status-icon visuals, camera knobs, dev-overlay flag, interpolation window, screen factors) are not part of this contract. Presentation metadata ownership is described in the next section.

Hot reload of ObjectLayers is supported via periodic `GetObjectLayerManifest` calls; world topology and gameplay rules are reloaded only on server restart.

---

## Presentation metadata ownership

`cyberia-server` holds **no** presentation state. There is no field on the server for:

- palette
- status-icon iconId or border color
- camera smoothing or camera zoom
- dev-overlay flag
- screen-factor overrides
- interpolation window

These live in the client runtime's compile-time defaults. Per-instance presentation overrides are served by engine-cyberia at `GET /api/cyberia-client-hints/:instanceCode` and consumed directly by the client. The Go process never calls that endpoint.

### `sim_palette.go`

A small internal RGBA table inside `sim_palette.go` exists solely to fill the optional per-entity color bytes on the AOI wire for portals, skill projectiles, and freshly spawned players. The table is:

- compile-time constant
- not loaded from any contract (gRPC, REST, proto, env)
- read only at world-build and one-shot spawn paths
- never consulted during any per-tick simulation phase

The client treats those wire bytes as a hint and resolves the actual fallback color from its own palette by entity type.

---

## Source layout

Paths are relative to `cyberia-server/`. Gameplay logic lives under `src/`; the gRPC client and world builder under `src/grpcclient/`; the chi-based REST router under `api/`.

| File                                                                                              | Responsibility                                                                                          |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `main.go`                                                                                         | Entry point — loads `.env`, dials engine-cyberia gRPC, mounts WS and `/api` router, starts listener     |
| `src/tick.go`                                                                                     | `Tick`, `InputSequence` types and tick rate constants                                                   |
| `src/server.go`                                                                                   | `GameServer` struct, simulation+replication tickers, `ApplyInstanceConfig`, world mutator orchestration |
| `src/types.go`                                                                                    | Core data structures (`PlayerState`, `BotState`, `MapState`, `ObjectLayerState`, etc.)                  |
| `src/simulation_phases.go`                                                                        | Phase entry points called from the tick loop                                                            |
| `src/phase_input_handlers.go`                                                                     | Typed dispatch per `InputKind`; the only translator from input commands to world state                  |
| `src/input_command.go`                                                                            | `InputCommand` struct, `InputKind` constants, per-player queue helper                                   |
| `src/aoi_binary.go`                                                                               | Binary AOI snapshot encoder; message type constants                                                     |
| `src/object_layer.go`                                                                             | ObjectLayer Go types mirroring MongoDB schema                                                           |
| `src/instance_loader.go`                                                                          | World reconstruction from gRPC payload                                                                  |
| `src/collision.go`                                                                                | Grid collision, portal transitions, death handling                                                      |
| `src/pathfinding.go`                                                                              | A\* pathfinding for bot and player navigation                                                           |
| `src/skill.go`, `src/skill_dispatcher.go`, `src/skill_projectile.go`, `src/skill_doppelganger.go` | Skill registry and per-skill handlers                                                                   |
| `src/economy.go`                                                                                  | Fountain & Sink coin economy                                                                            |
| `src/life_regen.go`                                                                               | HP regeneration                                                                                         |
| `src/ai.go`                                                                                       | Bot AI                                                                                                  |
| `src/stats.go`                                                                                    | Active stat aggregation, sum-stats limit enforcement                                                    |
| `src/entity_status.go`                                                                            | Entity Status Indicator (ESI) numeric IDs                                                               |
| `src/frozen_state.go`                                                                             | FrozenInteractionState                                                                                  |
| `src/handlers.go`                                                                                 | WebSocket lifecycle, binary uplink decoder, JSON-uplink back-compat adapter                             |
| `src/sim_palette.go`                                                                              | Internal RGBA fill for AOI wire bytes (not a contract)                                                  |
| `src/grpcclient/`                                                                                 | gRPC client + world builder for engine-cyberia                                                          |
| `api/router.go`, `api/metrics.go`                                                                 | chi router; `/api/v1/*` endpoints                                                                       |
| `proto/cyberia.proto`                                                                             | gRPC service contract shared with engine-cyberia                                                        |

---

## REST surface

`/api/v1/*` is the operational surface; it is independent of the WebSocket gameplay protocol.

| Endpoint                    | Method | Description                               |
| --------------------------- | ------ | ----------------------------------------- |
| `/api/v1/health`            | GET    | Simple health check                       |
| `/api/v1/metrics`           | GET    | Complete server metrics snapshot          |
| `/api/v1/metrics/health`    | GET    | Detailed health with entity/player counts |
| `/api/v1/metrics/entities`  | GET    | Entity-type breakdown                     |
| `/api/v1/metrics/websocket` | GET    | Active connections, message rates         |
| `/api/v1/metrics/workload`  | GET    | Per-map entity workload                   |

All content data (ObjectLayer metadata, asset blobs, optional client hints) is served directly by engine-cyberia REST. `cyberia-server` does not proxy content.

---

## Environment

| Variable                          | Default           | Description                                        |
| --------------------------------- | ----------------- | -------------------------------------------------- |
| `ENGINE_GRPC_ADDRESS`             | `localhost:50051` | engine-cyberia gRPC address (**required**)         |
| `INSTANCE_CODE`                   | `default`         | Instance code to load on startup                   |
| `ENGINE_API_BASE_URL`             | _(empty)_         | engine-cyberia REST base URL; forwarded to clients |
| `ENGINE_GRPC_RELOAD_INTERVAL_SEC` | _(disabled)_      | ObjectLayer hot-reload polling interval            |
| `SERVER_PORT`                     | `8081`            | WebSocket + HTTP listen port                       |
| `STATIC_DIR`                      | `./public`        | Directory for static WASM client files             |

---

## Build and run

```bash
cd cyberia-server

# Development
go run main.go

# Production binary
go build -o cyberia-server .
./cyberia-server
```

### Test logx

```bash
go test ./logx/ -run TestResolveLevel
```
