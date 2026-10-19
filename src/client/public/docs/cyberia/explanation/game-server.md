<p align="center">
  <img src="https://www.cyberiaonline.com/apple-touch-icon-precomposed.png" alt="CYBERIA online"/>
</p>

<div align="center">

<h1>cyberia server</h1>

</div>

# Cyberia game server

**Path:** `cyberia-server/` · **Language:** Go · **Role:** authoritative simulation runtime for Cyberia

`cyberia-server` is the authoritative simulation runtime for the Cyberia MMO extension on Underpost Platform. It owns world state, advances a fixed-rate tick, drains typed input commands from connected clients, and dispatches one AOI-filtered snapshot per player each tick.

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
- `cyberia-server` dials the Data Server gRPC at boot; on dial or load failure it retries over the REST boot fallback (`--data-server-url`, `/api/v1/cyberia-instance/boot/*`) and exits only when both transports fail rather than fabricate a world.
- On reconnect, world configuration is reloaded via `GetFullInstance(instanceCode)`.
- If any one of the three services is unhealthy, the game moves to standby until all three recover.

The server speaks two protocols:

- **gRPC (or its REST boot fallback), inbound, at boot and hot reload:** consumes world configuration from `engine-cyberia`.
- **WebSocket, ongoing:** delivers AOI snapshots to clients, accepts batches of client events. Every message is a JSON envelope `{ "type", "payload" }` in a binary frame.

There is no per-tick traffic between `cyberia-server` and `engine-cyberia`, and no presentation authority in the Go runtime.

---

## Tick model

The tick is the universal coordinate of the simulation.

| Concept           | Default         | Notes                                                                                                                                                  |
| ----------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **tick**          | `uint32`        | Monotonic, advanced once per simulation step. Resets only on world rebuild.                                                                            |
| **tick rate**     | `30` Hz         | Simulation Hz. `sim.DefaultTickRate`, fixed at compile time; equals the client `TICK_RATE_HZ`. **The string `fps` is not used to describe this rate.** |
| **tick duration** | `1 / tick_rate` | The dt used by every simulation phase.                                                                                                                 |
| **current tick**  | `uint32`        | The simulation step about to run (or just produced).                                                                                                   |

One ticker at `tickRate` Hz. Each tick advances the world by exactly one step, runs the phases in fixed order, then sends one AOI snapshot per player.

Movement integration is `dt`-based: `step = speed * tickDuration.Seconds()`. Frame-count integration is not used anywhere on the server.

---

## Simulation phases

Inside one simulation tick, the phases run in a fixed order. Phases are the **only** functions allowed to mutate world state.

1. **`PhaseInput`** — drain each player's `InputQueue`; dispatch typed input commands to gameplay handlers.
2. **`PhaseLifecycle`** — respawn timers, despawn expirations.
3. **`PhaseSkills`** — skill projectile collisions.
4. **`PhaseAI`** — bot behaviour decisions.
5. **`PhaseMovement`** — integrate positions using `tickDuration`.
6. **`PhaseLoot`** — drop token collection.
7. **`PhasePortals`** — portal entry and teleport.
8. **`phaseReplication`** — after every map has stepped, per player: compute AOI rectangle, build snapshot, dispatch via the player's WebSocket write channel.

Phases never read presentation data. Phases consume world configuration (gameplay rules) and the per-player input queue.

---

## Input command pipeline

The client sends one `events` message per frame with new events. The simulation tick is the only consumer of input commands.

```
"events" message  →  receiveMessage  →  one typed InputCommand{kind, frame, sequence, payload} per event
                                              │
                                              ▼
                                              Session.InputQueue (per-player, bounded by MaxInputQueue)
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

| Property                          | Detail                                                                                                                                                                                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| One queue per player              | drained exactly once per simulation tick                                                                                                                                                                                                                          |
| One typed handler per `InputKind` | each handler runs under the world mutex held by `phaseInput`                                                                                                                                                                                                      |
| One source of truth               | `phase_input_handlers.go` is the only file that translates an input command into world state                                                                                                                                                                      |
| Sequence numbering                | `InputCommand.Sequence` is monotonic per client; the server tracks the highest applied sequence per player in `Session.InputConsumedThrough` and echoes it in every snapshot. A command at or below that cursor is dropped, so a resent event never applies twice |

The batch is validated and enqueued whole. An event that fails validation becomes `InputKindUnknown`: consumed, never applied. No synchronous game-state mutation runs on the WebSocket read goroutine.

### Input kinds

| Kind             | Wire type        | Effect                                                                         |
| ---------------- | ---------------- | ------------------------------------------------------------------------------ |
| `PlayerAction`   | `player_action`  | TAP — movement intent + skill trigger                                          |
| `ItemActivation` | `item_active`    | Equip/unequip the stack in a bag slot; validated against equipment rules       |
| `PlayerStasis`   | `player_stasis`  | Client modal count > 0 freezes the player (FrozenInteractionState), else thaws |
| `Chat`           | `chat`           | One line to the world, the party or one player ([chat and parties](social.md)) |
| `TalkDone`       | `talk_done`      | Dialogue read to the end; advances talk objectives                             |
| `QuestAccept`    | `quest_accept`   | Accept the quest an NPC offers                                                 |
| `QuestAbandon`   | `quest_abandon`  | Drop an active quest                                                           |
| `ShopBuy`        | `shop_buy`       | Buy one catalog item from a vendor action                                      |
| `CraftItem`      | `craft_item`     | Assemble one recipe at an assembler action                                     |
| `CraftCancel`    | `craft_cancel`   | Abort the running assembly and refund it                                       |
| `ItemMove`       | `item_move`      | Move units of one stack to a slot of the bag, the storage or a vault           |
| `PartyInvite`    | `party_invite`   | Invite a player in view, or a friend on any map of this server, to the party   |
| `PartyReply`     | `party_reply`    | Accept or decline a pending invite                                             |
| `PartyLeave`     | `party_leave`    | Leave the party                                                                |
| `PartyKick`      | `party_kick`     | The leader removes a member                                                    |
| `PartyDisband`   | `party_disband`  | The leader ends the party                                                      |
| `FriendList`     | `friends_list`   | Ask for the friend list                                                        |
| `FriendRequest`  | `friend_request` | Ask an account player in view to be friends                                    |
| `FriendReply`    | `friend_reply`   | Accept, decline or withdraw a friend request                                   |
| `FriendRemove`   | `friend_remove`  | End a friendship                                                               |

`auth` is the one message outside the batch. It is the first message of every connection, and the
server reads no input before it admits the player
([accounts and persistent players](accounts-and-persistence.md#launch-flow)). `session_leave` travels
in the batch, but `game/net` takes it before the simulation: it ends the session with its final
commit ([leaving](accounts-and-persistence.md#leaving)).

## Content a player brings

At boot and at each world rebuild the server warms the content its world names: the
`object_layers` of `GetFullInstance` and the skills of the items the world owns
(`config.skill_config`). That warm set is the baseline of the world; the server never preloads the
catalog of the release or the content of another world.

An account can arrive from another world of its universe with stacks this world does not name.
Before placement, outside the world lock, the server asks `GetItemContent` for each saved label it
does not hold. The engine answers from the release it serves: the definition the catalog binds to
the label, the skill document of the label, and the definitions that skill summons, transitively.
The engine reads each label once, so a summon cycle ends, and it carries at most 3 summon levels,
16 labels and 512 KiB for one label; a label past a bound is listed as unavailable with the reason.

The world runs that content whole, or holds the stacks of the label:

| Item content                                                     | Result                                                                                       |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Runnable, and its definition is the one of the stack             | Cached with its skill and summons, and the stack loads                                       |
| Runnable, with another definition of the label                   | Cached, and the stack stays held (`rebound`)                                                 |
| The label has no binding                                         | The stack stays held (`unknown`)                                                             |
| A summon the engine cannot carry, or a defective skill           | Nothing is cached; the stack stays held (`unknown`)                                          |
| A definition for another label, with no CID, or bad stats        | Nothing is cached; the stack stays held (`unknown`)                                          |
| A skill handler this server binary does not run                  | Nothing is cached; the stack stays held (`unsupported`)                                      |
| Content of another release than the release of the world         | Nothing is cached; the stack stays held (`incompatible`)                                     |
| No answer within 5 seconds after one retry, or a transport error | The placement fails with `unavailable`; the lease is released and the profile stays as saved |

A held stack is never replaced by a same-named definition: it stays in the profile and loads in a
world that runs its content. The self snapshot sends each held stack to its owner (`itemId`, `cid`,
`quantity`, `reason`), and the client draws it by its own `cid`. One fetch per label runs at a
time; every placement that needs the label waits on it. The resolved content joins the world under
the world lock, with the placement.

A skill document is metadata: its `logicEventId` only selects a handler this binary implements
(`game/sim/skill_dispatcher.go`). The warm skill of a label wins over a resolved one, so a world
keeps the skills it names. The destination keeps its own rules: its equipment rules decide which
item types a player can activate, and its skill rules tune each handler.

Every client holds the definitions of the cache and their skills. The join sends the definitions in
`metadata` and the skills in `init_data.skillMap`. Each change of a definition or of its skills (a
definition resolved for a traveler, a label a reload binds anew) counts a revision, and before a
snapshot the server sends a client the definitions changed since the revision it holds, in a
`metadata` message with `objectLayers` and the `skillMap` of those labels. So a player already in
the world draws the stacks a traveler brings and sees their skills.

A reload compares the cached labels with the engine catalog: a rebound label is fetched again and an
unbound one leaves the cache; a label the world does not hold is never fetched. Then the server asks
the content of every resolved label again, from the release the world serves now: content of
another release, or content that no longer runs here, loses its skill, so no skill of an earlier
release stays. Every 30 seconds and after each reload the server evicts every resolved definition
outside the warm set that no entity, personal storage or vault holds, nor the skill of a held label
summons, with its skill. The sweep marks what the world holds now, so content another player still
holds never leaves, and nothing counts references that could leak.
`GET /api/v1/metrics/runtime` reports the residency under `content`: the saved labels by outcome
(`resident`, `resolved`, `unbound`, `mismatch`, `unavailable`, `unsupported`, `incompatible`,
`error`, and `refreshed` or `dropped` after a reload), the resolved definitions cached now, and the
definitions shared with clients and evicted.

| Reload        | Does                                                                         | Triggered by                                                    |
| ------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------- |
| `full`        | Refreshes the cached labels, and rebuilds the world when its version changed | A promotion, Studio, the `ENGINE_GRPC_RELOAD_INTERVAL_SEC` loop |
| `incremental` | Refreshes the cached labels only                                             | A catalog bind, a procedural promotion, Studio                  |

---

## Player persistence

In account mode the server loads each account player from its profile and commits its durable state
back through `CyberiaPlayerService`; a guest stays in memory. The engine keeps one profile per
[universe](universe.md); the server sends and receives the state of its own world. `game/persist` owns the pipeline: the tick captures the state of
each account player every 6 ticks under the world lock, and a background loop sends at most one
commit per player, with retries, checkpoints and the final commit at session end. `game/net`
owns admission, takeover, the resume tickets and session end. See
[accounts and persistent players](accounts-and-persistence.md#write-guarantees).

---

## AOI replication

The AOI system filters world state per-player so each client receives only what its character can perceive.

Per player:

- AOI is a rectangle centered on the player position with size determined by `aoiRadius` from world configuration.
- On each tick, the server iterates the player's map, includes any entity whose bounding rectangle overlaps the AOI, and emits a snapshot.

### Snapshot

The `snapshot` payload carries `frame` (the client frame the state stands for), `inputConsumedThrough` (the highest client event sequence a tick has applied), the AOI `entities` and the `self` block. The client replaces its own state, drops the consumed events and replays the rest. See [the input command pipeline](architecture.md#input-command-pipeline).

A player entity carries its display `name`. The `self` block adds what only the owner may read:
the inventory, the NPC `vaults`, the personal `storage`, the `party`, the `partyInvites` and the
`partyInvitesSent`, the `held` stack count, the `unsaved` flag, and one
`interaction` row per bot or player in view that offers something
([player identity](player-identity-and-profile.md#public-and-private-data)).

The other message types (`init_data`, `session_end`, `resume`, `combat_text`, `audio_event`, `drop_spawn`, `chat`, `chat_ack`, `party_ack`, `friends`, `friend_ack`, ...) are not part of the per-tick replication stream.

---

## World configuration

World configuration is loaded once at boot from engine-cyberia via gRPC `GetFullInstance(instanceCode)`. The simulation consumes the following from it:

| Field                                                                | Used for                                                                          |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `cellSize`                                                           | grid math                                                                         |
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

These live in the client runtime's compile-time defaults. Per-instance presentation overrides are served by engine-cyberia at `GET /api/v1/cyberia-client-hints/:instanceCode` and consumed directly by the client. The Go process never calls that endpoint. The snapshot carries no colour; the client resolves the fallback colour from its own palette by entity type.

---

## Source layout

Paths are relative to `cyberia-server/`. Gameplay logic lives under `game/`, in six packages. The dependency points one way: `net` → `sim` → `social` → `content` → `world` → `persist`.

| Path                      | Responsibility                                                                                                                                                                                                                              |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cmd/cyberia-server/`     | Entry point — loads `.env`, dials engine-cyberia gRPC, mounts WS and `/api` router, starts listener                                                                                                                                         |
| `game/world/`             | Entity table and component arrays (`types.go`, `entity_table.go`), `Session`, `InputCommand` and `InputKind`, A\* pathfinding                                                                                                               |
| `game/content/`           | Rules loaded from the instance config: stats, progression, economy, loot, quests, shop, craft, entity defaults, ESI status IDs; the container capacity and the player containers (`capacity.go`, `storage.go`); the generated stat contract |
| `game/persist/`           | The durable player state and the commit pipeline: capture, retries, checkpoints, fencing and the final commit                                                                                                                               |
| `game/social/`            | Chat channels, parties and the friend cache of the players on this server                                                                                                                                                                   |
| `game/sim/`               | Tick phases (`simulation_phases.go`), typed input dispatch (`phase_input_handlers.go`), movement, AI, tap and held skills, collision and death, world reconstruction (`instance_loader.go`)                                                 |
| `game/net/`               | `GameServer`: the tick loop, WebSocket lifecycle and the `events` uplink (`handlers.go`), admission and session end (`sessions.go`), the friend broker (`friends.go`), snapshot build (`snapshot.go`), metrics                              |
| `engine_client/`          | engine-cyberia transport clients (gRPC, REST fallback, dispatcher), the player service client (`player_client.go`) + world builder                                                                                                          |
| `api/`                    | chi router; `/api/v1/*` endpoints                                                                                                                                                                                                           |
| `gen/proto/cyberia.proto` | gRPC service contract, generated from engine-cyberia (do not edit)                                                                                                                                                                          |

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
| `/api/v1/metrics/workload`  | GET    | Measured tick workload                   |

Workload measures tick processing time, including simulation, replication, and lock waits.
It averages the latest 30 ticks, one second at the configured 30 Hz rate.
Load is that average divided by the tick budget: moderate at 40%, high at 70%, critical at 90%.
Entity and object-layer counts describe content; they do not determine health or player capacity.

The portal reads player population from `websocket.active_connections`.
`websocket.max_connections` is the configured `CYBERIA_MAX_CONNECTIONS` admission limit; zero disables that limit.
The world selector shows Full only when connections reach that limit.
Tick pressure remains operational information and does not prevent a player from selecting a world.

All content data (ObjectLayer metadata, asset blobs, optional client hints, the Instance Map graph) is served directly by engine-cyberia REST. `cyberia-server` does not proxy content; it only forwards `instanceCode` (alongside `apiBaseUrl`) in the WebSocket `metadata` message so the client can key its engine-cyberia fetches.

---

## Environment

Two endpoints are command-line flags, not variables. Both are required, and
each is const for the life of the process.

| Flag                 | Example                         | Description               |
| -------------------- | ------------------------------- | ------------------------- |
| `--data-server-url`  | `https://www.cyberiaonline.com` | Data Server REST origin   |
| `--data-server-grpc` | `localhost:50051`               | Data Server gRPC endpoint |

| Variable                          | Default      | Description                                                                                                                        |
| --------------------------------- | ------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `INSTANCE_CODE`                   | _(required)_ | Instance code to load on startup                                                                                                   |
| `CYBERIA_PUBLIC_URL`              | _(none)_     | Public origin and base path players dial; reported to the [registry](server-registry.md). Unset keeps the process off the registry |
| `CYBERIA_SERVER_API_KEY`          | _(none)_     | Server key of the player service, the registry and the hot-reload trigger                                                          |
| `ENGINE_GRPC_RELOAD_INTERVAL_SEC` | _(disabled)_ | ObjectLayer hot-reload polling interval                                                                                            |
| `SERVER_PORT`                     | `8081`       | WebSocket + HTTP listen port                                                                                                       |
| `STATIC_DIR`                      | `./public`   | Directory for static WASM client files                                                                                             |

`instance-build-manifest` writes `INSTANCE_CODE`, `CYBERIA_BASE_PATH`, `CYBERIA_DATA_SERVER_URL`,
`CYBERIA_CORS_ALLOWED_ORIGINS` and `CYBERIA_PUBLIC_URL` to the env file of each world from the deploy
conf. Each process reports to the registry every 20 seconds, and reports `draining` on SIGTERM
before its players leave.

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
