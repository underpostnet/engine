# cyberia-client

**Path:** `cyberia-client/` · **Language:** C11/GNU11 → WebAssembly (Emscripten) · **Role:** presentation runtime for Cyberia

`cyberia-client` is the rendering and interactive runtime for the Cyberia MMO extension on [Underpost Platform](UNDERPOST-PLATFORM.md). It captures input, predicts the local player, reconciles against authoritative snapshots, interpolates remote entities, and renders the world. It owns the entire render policy locally and runs with no required input from the authoritative server beyond the per-tick snapshot stream.

It is **not** a world-simulation authority. The authoritative simulation runs on [cyberia-server](CYBERIA-SERVER.md). Persistent content (maps, atlases, object layers) comes from [engine-cyberia](UNDERPOST-PLATFORM.md#engine-cyberia-nodejs--content-authority) via REST.

---

## Process model

```
engine-cyberia          cyberia-server          cyberia-client
─────────────           ──────────────          ──────────────
content authority       simulation authority    presentation runtime

      ▲                       │
      │ REST                  │ WebSocket binary
      │ atlases               │ snapshots (server → client)
      │ asset metadata        │ input commands (client → server)
      │ optional              ▼
      │ client hints      ┌──────────────────────────────────────┐
      └───────────────────┤  Browser tab                         │
                          │  ┌────────────────────────────────┐ │
                          │  │  cyberia-client (WASM)         │ │
                          │  │  ──────────────────────────    │ │
                          │  │  Raylib (OpenGL ES2)           │ │
                          │  │  prediction · reconciliation   │ │
                          │  │  interpolation · render        │ │
                          │  │  presentation_runtime          │ │
                          │  │  (palette/icons/camera fetched │ │
                          │  │   from cyberia-client-hints)   │ │
                          │  └────────────────────────────────┘ │
                          └──────────────────────────────────────┘
```

The client speaks two transports:

- **WebSocket binary** to `cyberia-server` for snapshots and input commands.
- **REST** to engine-cyberia for atlas frames, asset blobs, and optional client-hints overrides.

Asset distribution flows through Underpost Platform's [static + PWA pipeline](UNDERPOST-PLATFORM.md#what-underpost-platform-covers); large media may be delivered via the Cloudinary-backed static asset flow where applicable.

---

## Startup order

The client is the last process in the sequential startup order. It cannot do useful work until both [the content backend](UNDERPOST-PLATFORM.md#engine-cyberia-nodejs--content-authority) and [the authoritative server](CYBERIA-SERVER.md) are accepting requests.

```
1. Persistent backend                (engine-cyberia + DB + asset backend)
2. cyberia-server                    (authoritative simulation, WS open)
3. cyberia-client                    ← this process
   ├─ initWindow, render init
   ├─ load tiny inline bootstrap (neutral grey only)
   ├─ (optional) GET /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE
   ├─ initialize prediction
   ├─ open WebSocket to cyberia-server
   └─ enter render loop
```

Underpost Platform deploy orchestration enforces this ordering. The client never runs in parallel with the server.

---

## Render loop

The render loop runs at vsync. Tick simulation is decoupled from render frames via a fixed-timestep accumulator. Step ordering inside one render frame:

1. **Optional client hints poll** — advance the asynchronous hints fetch state machine.
2. **Input capture** — drain raw OS events.
3. **Input dispatch** — UI hit-test → build typed input command (`kind`, `clientTick`, `sequence`, payload) → apply to prediction → send on the wire.
4. **Reconciliation** — apply latest snapshot's `lastAcked`: drop acknowledged input commands from the replay buffer; rewind predicted self to authoritative position; replay unacked input commands.
5. **Fixed-timestep prediction** — while accumulator ≥ `tickDuration`, advance prediction one tick.
6. **Interpolation** — compute remote-entity view positions at `renderTick = serverTickEstimate − INTERP_TICKS`.
7. **Render** — read view models; never mutate world state.

Render frame rate is independent of simulation tick rate. The fixed-timestep accumulator ensures the predicted simulation advances at the authoritative `tickRate` regardless of FPS.

---

## Module map

Directional dependency: from outermost (UI / render) inward toward `domain/`. Nothing in `domain/` imports outward.

```
src/
  domain/
    tick.h                          tick rate constants, monotonic types
    presentation_runtime.{c,h}      sole owner of presentation: async fetch of
                                    /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE,
                                    palette/status-icon/camera accessors, tiny
                                    inline bootstrap fallback
  input/
    input_command.{c,h}             typed InputCommand factory; sequence allocation
  prediction/
    prediction.{c,h}                predicted self position; replay buffer; reconcile
  interpolation/
    interpolation.{c,h}             remote entity view positions at renderTick
  network/
    session.{c,h}                   last server tick, last acked sequence, tick estimate
    client.{c,h}                    WebSocket lifecycle + binary I/O
    socket.{c,h}                    Emscripten WebSocket bridge
  ui/                               modals, HUD, inventory bar, FCT, nameplates
  game_state.{c,h}                  world state mirror (gameplay subset only)
  binary_aoi_decoder.{c,h}          server snapshot parser
  game_render.{c,h}, render.{c,h}   render pipeline
  main.c                            entry point + render loop
  js/services.{js,c,h}              REST fetch bridge (atlas, ui-icons, client-hints)
```

| Owner                          | Owns                                                                   | Reads                       | Writes                                             |
| ------------------------------ | ---------------------------------------------------------------------- | --------------------------- | -------------------------------------------------- |
| `domain/presentation_runtime`  | the entire presentation surface (palette, entity colour keys, status icons, camera, cell, interpolation). Inline bootstrap fallback while the fetch is in flight. | JSON response from `/api/cyberia-client-hints` | own table + one-shot hydration of `g_game_state.cell_size`, `.interpolation_ms`, `.camera.zoom` |
| `input/input_command`          | typed InputCommand factory                                             | session for tick + sequence | —                                                  |
| `prediction/`                  | predicted self position, input replay buffer                           | snapshot self + session ack | predicted self                                     |
| `interpolation/`               | remote entity `interp_pos`                                             | snapshot history            | remote `interp_pos` only                           |
| `network/session`              | last server tick, last acked sequence                                  | snapshot header             | session singletons                                 |
| `binary_aoi_decoder`           | wire parser                                                            | binary frames               | `game_state` + session + prediction (via callback) |
| `game_state`                   | gameplay world mirror                                                  | —                           | —                                                  |
| `render/`, `ui/`               | rendering                                                              | view models                 | screen                                             |

`game_state` holds only the gameplay subset of world state (entities, positions, life, AOI, equipment, frozen flag, coins). It does not carry palette state, status-icon visuals, or any other presentation field.

---

## Presentation ownership

The client owns its render policy. The authoritative server holds no presentation state.

Three layers, strictly inward-dependent:

1. **`domain/presentation_runtime.{c,h}`** — sole owner of every presentation value. Fires a single asynchronous GET against `/api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE` at startup, polled once per render frame. When the response settles, parses palette, entity colour keys, status-icon visuals, and camera/cell tunings into a process-local table and writes a one-shot hydration into `g_game_state` (cell_size, interpolation_ms, camera.zoom). The C client carries NO compile-time palette or status table — only a tiny inline neutral-grey bootstrap so the splash screen has something to draw while the fetch is in flight. The canonical schema for the response lives at engine-cyberia's `src/client/components/cyberia/SharedDefaultsCyberia.js`.
2. **Renderers** — call `presentation_runtime_palette("KEY")`, `presentation_runtime_status_icon(u8)`, `presentation_runtime_status_border(u8)`, `presentation_runtime_entity_fallback_color(entity_type)` at each use site.

What lives in this layer:

- Named palette (colors).
- Per-entity-type fallback color keys.
- Status-icon visual table (icon stem + border color per numeric ID).
- Camera smoothing / zoom defaults.
- Interpolation window.
- Dev-overlay flag.
- Viewport screen factors.

What does **not** travel on the WebSocket init or AOI streams:

- Palette.
- Camera knobs.
- Dev-overlay flag.
- Interpolation window.
- Status-icon visuals.
- Per-entity-type color keys.

The numeric status-icon u8 still rides on the AOI wire — that is the protocol-level half. The icon stem and border color are presentation and are resolved entirely on the client.

### Optional client hints

`GET /api/cyberia-client-hints/:instanceCode` (engine-cyberia REST, **not** cyberia-server) returns a JSON document mirroring the structure of the compile-time defaults. The client is required to function with no successful call to this endpoint:

- 200 with `{ palette, entityColorKeys, statusIcons, cameraSmoothing, cameraZoom, defaultWidthScreenFactor, defaultHeightScreenFactor, interpolationMs, devUi }` — overrides applied on top of defaults.
- 404 if the instance has no overrides — defaults are used.
- Network error — defaults are used.

No authentication; presentation hints are not secret. The Go authoritative server never calls this endpoint.

---

## Tick-aware components

### Session

`network/session.{c,h}` tracks per-connection tick state:

- `last_server_tick` — highest snapshot tick observed.
- `last_acked_input_sequence` — highest sequence the server has applied for this client; echoed in every snapshot header.
- `next_input_sequence` — monotonic counter for outgoing input commands.
- `server_tick_estimate` — extrapolation of last server tick by elapsed wall time, used to stamp outgoing input commands and to compute `renderTick`.

### Prediction

`prediction/prediction.{c,h}` owns the predicted self position. It is the only writer of the predicted state. Internally it tracks **two** positions: the discrete per-tick `predicted_pos` (where the simulation says the player is) and the continuous render-frame `display_pos` (what the renderer reads). The renderer never sees the discrete value.

- `prediction_apply(cmd)` — optimistic local apply of an input command + push onto replay buffer.
- `prediction_step(dt)` — fixed-timestep advance, called by the accumulator. Mutates `predicted_pos` only.
- `prediction_reconcile()` — on snapshot arrival: drop acknowledged inputs, rewind self to authoritative position, replay unacked inputs. Mutates `predicted_pos` only.
- `prediction_display_step(frame_dt)` — per-render-frame exponential lerp of `display_pos` toward `predicted_pos`. This is the layer that absorbs reconcile snaps and sim-tick stepping so the visible main player moves continuously.
- `prediction_self_position()` — render-time accessor; returns the smoothed `display_pos`.

### Interpolation

`interpolation/interpolation.{c,h}` owns remote-entity render-time positions. It is the only writer of remote `interp_pos`. It never touches the local player (prediction owns that). Sampling happens at `renderTick = serverTickEstimate − INTERP_TICKS`.

### Input command pipeline

```
mouse / touch / keyboard
        │
        ▼
input/input_capture
        │
        ▼
UI hit-test cascade  ──► modal/inventory/HUD consumed?
        │  no
        ▼
input_command_build_*   stamps client_tick + sequence
        │
        ▼
prediction_apply        optimistic local apply
        │
        ▼
uplink send             WebSocket binary frame
```

`InputCommand.Sequence` is allocated by `session_next_input_sequence`. Monotonic, never reused. The server echoes the highest applied sequence in every snapshot header; the prediction module drops acked commands from its replay buffer on reconciliation.

---

## Binary AOI snapshot format

The client decodes server-pushed AOI frames. Header (little-endian, 11 bytes for `0x01`/`0x03`):

```
[0]      u8   msgType     0x01 aoi_update | 0x03 full_aoi
[1..4]   u32  tick        simulation tick at which the snapshot was produced
[5..8]   u32  lastAcked   highest InputCommand.Sequence applied for this client
[9..10]  u16  entityCount entity blocks that follow
```

After parsing the header, the decoder invokes `session_on_snapshot(tick, lastAcked)` and then `prediction_reconcile()` so the predicted self stays consistent with the just-arrived authoritative state.

Other message types — init data (0x02), FCT (0x04), ItemFCT (0x05) — carry their own headers and are not part of the per-tick replication stream.

---

## REST fetches (engine-cyberia)

The client speaks REST directly to engine-cyberia for content. None of these calls go through cyberia-server.

| Endpoint                                         | Purpose                              |
| ------------------------------------------------ | ------------------------------------ |
| `GET /api/atlas-sprite-sheet/metadata/:itemKey`  | Frame layout JSON for a sprite atlas |
| `GET /api/atlas-sprite-sheet/blob/:itemKey`      | Atlas PNG                            |
| `GET /api/object-layer/:itemId`                  | ObjectLayer JSON metadata            |
| `GET /api/cyberia-dialogue/code/default-:itemId` | Dialogue lines for an NPC            |
| `GET /assets/ui-icons/:iconId.png`               | Status-bar icons                     |
| `GET /api/cyberia-client-hints/:instanceCode`    | Optional presentation overrides      |

All requests are CORS-simple GETs (no preflight) and cacheable. None require credentials.

---

## Build and run

```bash
cd cyberia-client

# Development build
make -f Web.mk clean && make -f Web.mk web

# Release build
make -f Web.mk clean && make -f Web.mk web BUILD_MODE=RELEASE

# Build + serve on dev port :8082
make -f Web.mk serve-development
```

The build is part of the Underpost Platform [static + PWA pipeline](UNDERPOST-PLATFORM.md#what-underpost-platform-covers); production deploys go through `underpost client` and `underpost deploy`.

### Output

```
bin/
  index.html    — Emscripten HTML container (from shell.html template)
  index.wasm    — Compiled WebAssembly module
  index.js      — Emscripten JS glue
  index.data    — Preloaded data bundle
```

---

## Compile-time configuration

`src/config.h`:

| Constant                    | Default                             | Description                                        |
| --------------------------- | ----------------------------------- | -------------------------------------------------- |
| `WS_URL`                    | `wss://server.cyberiaonline.com/ws` | WebSocket endpoint of cyberia-server               |
| `API_BASE_URL`              | `https://www.cyberiaonline.com`     | engine-cyberia REST base URL                       |
| `CYBERIA_CLIENT_HINTS_CODE` | `cyberia-main`                      | Lookup key for the optional client-hints fetch (presentation override key — never an instance/server identifier) |
| `HTTP_TIMEOUT_SECONDS`      | `10`                                | HTTP request timeout                               |
| `MAX_TEXTURE_CACHE_SIZE`    | `512`                               | Atlas texture LRU cap                              |
| `MAX_LAYER_CACHE_SIZE`      | `256`                               | ObjectLayer metadata LRU cap                       |
| `MAX_ATLAS_CACHE_SIZE`      | `256`                               | Atlas metadata LRU cap                             |
| `DEFAULT_FRAME_DURATION_MS` | `100`                               | Default animation frame duration                   |
| `ENABLE_DEV_UI`             | `false`                             | Force dev overlay regardless of presentation hints |
| `APP_VERSION`               | `"1.0.0"`                           | Application version string                         |

For local development, point `WS_URL` and `API_BASE_URL` at `localhost` before rebuilding.

---

## Persistent storage

`serial.c` uses Emscripten's IDBFS (IndexedDB File System) at `/persistent/` for:

- Player authentication token (EIP-712 signature).
- Local game settings (audio volume, key bindings).
- Cached ObjectLayer metadata (session warm-up cache).

No game state is persisted client-side; the authoritative server is the source of truth.

---

## Cross-references

- [Underpost Platform](UNDERPOST-PLATFORM.md) — umbrella product, static + PWA + Workbox + Cloudinary delivery.
- [Architecture](ARCHITECTURE.md) — three-process model, canonical vocabulary.
- [Cyberia Server](CYBERIA-SERVER.md) — authoritative simulation runtime.
- [Cyberia CLI](CYBERIA-CLI.md) — Cyberia-specific CLI extensions to Underpost CLI.
