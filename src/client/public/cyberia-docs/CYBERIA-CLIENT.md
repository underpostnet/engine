<p align="center">
  <img src="https://www.cyberiaonline.com/assets/splash/apple-touch-icon-precomposed.png" alt="CYBERIA online"/>
</p>

<div align="center">

<h1>cyberia client</h1>

</div>

**Path:** `cyberia-client/` · **Language:** C11/GNU11 → WebAssembly (Emscripten) · **Role:** presentation runtime for Cyberia

`cyberia-client` is the rendering and interactive runtime for the Cyberia MMO extension on Underpost Platform. It captures input, predicts the local player, reconciles against authoritative snapshots, interpolates remote entities, and renders the world. It owns the render policy locally.

It is **not** a world-simulation authority. The authoritative simulation runs on `cyberia-server`. Persistent content and asset metadata come from `engine-cyberia` via REST.

---

## Operating model

Three independent processes, non-overlapping roles. The ecosystem is playable only when all three are running and healthy at the same time.

```text
engine-cyberia          cyberia-server          cyberia-client
content authority       simulation authority    presentation runtime
  ^ REST                  | WebSocket binary
  | atlases, asset        | snapshots  (server -> client)
  | metadata, optional    | input cmds (client -> server)
  | client hints          v
  `---------------- Browser tab: prediction, reconciliation, interpolation, render
```

- Each service owns its own monitor and reconnector.
- The client reconnects to `cyberia-server` over WebSocket and fetches content from `engine-cyberia` over REST.
- If any of the three services is unhealthy, the game moves to standby until all three recover.

The client speaks two transports:

- **WebSocket binary** to `cyberia-server` for snapshots and input commands
- **REST** to `engine-cyberia` for atlas frames, asset blobs, and optional client-hints overrides

Asset distribution flows through Underpost Platform's static and PWA pipeline.

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

| Owner                         | Owns                                                                                                                                                              | Reads                                          | Writes                                                                                          |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `domain/presentation_runtime` | the entire presentation surface (palette, entity colour keys, status icons, camera, cell, interpolation). Inline bootstrap fallback while the fetch is in flight. | JSON response from `/api/cyberia-client-hints` | own table + one-shot hydration of `g_game_state.cell_size`, `.interpolation_ms`, `.camera.zoom` |
| `input/input_command`         | typed InputCommand factory                                                                                                                                        | session for tick + sequence                    | —                                                                                               |
| `prediction/`                 | predicted self position, input replay buffer                                                                                                                      | snapshot self + session ack                    | predicted self                                                                                  |
| `interpolation/`              | remote entity `interp_pos`                                                                                                                                        | snapshot history                               | remote `interp_pos` only                                                                        |
| `network/session`             | last server tick, last acked sequence                                                                                                                             | snapshot header                                | session singletons                                                                              |
| `binary_aoi_decoder`          | wire parser                                                                                                                                                       | binary frames                                  | `game_state` + session + prediction (via callback)                                              |
| `game_state`                  | gameplay world mirror                                                                                                                                             | —                                              | —                                                                                               |
| `render/`, `ui/`              | rendering                                                                                                                                                         | view models                                    | screen                                                                                          |

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
| `GET /api/cyberia-instance/instance-map/:instanceCode/static`  | Instance Map graph (nodes, edges, POIs)   |
| `GET /api/cyberia-instance/instance-map/:instanceCode/dynamic` | Instance Map provider activity (~1/s poll) |

All requests are CORS-simple GETs (no preflight) and cacheable. None require credentials.

---

## Instance Map

The Instance Map is a strategic overlay, not a minimap. It visualises the instance as a stylised pseudo-3D graph — maps are glowing hex nodes on a tilted plane, portals are animated edges — for navigation and planning. It never reproduces the gameplay viewport.

One integrated widget with two modes, split across two modules:

- **Container** (`ui/modal_map`) — compact mode is the always-on top-right HUD readout (map code, position, fps); a **Map** toggle button (ui-icon `map`, styled like the neighbouring fullscreen toggle) morphs the container to the full screen with an eased transition, and retracts it the same way on close.
- **Content** (`ui/modal_instance_map`) — renders the Instance Map inside the container: a non-blocking translucent full-screen panel (the world keeps rendering behind it). While expanded, the Map button swaps to a close icon in the same slot; clicking it retracts the container.

Strict independence from the gameplay renderer:

| Concern | Owner |
| ------- | ----- |
| Graph data | `ui/instance_map_data` — engine-cyberia REST only, never the AOI stream |
| Camera | own pan/zoom with smooth exponential interpolation (drag pan, wheel zoom, pinch zoom) |
| Layout | deterministic force-directed relaxation over the portal graph, computed client-side |
| Selection | tap a node → contextual panel (name, quest/action provider counts, portal links) |

Data lifecycle:

1. Opening the overlay fetches the **static** payload once: graph nodes (maps), edges (portals), and strategic POIs (quest providers, action providers). The instance code arrives in the simulation server's `metadata` message.
2. While open, the client polls the **dynamic** endpoint (~1/s, `?playerId=`) for per-player provider activity: `acceptable` / `active` quest providers and active action providers.
3. Closing the overlay stops polling immediately; late responses are discarded.

Live player position never travels through this API — engine-cyberia holds no simulation state. The overlay marks the player's node (and cell fraction within it) from the client's own predicted position, refreshed every frame.

Only strategic POIs are displayed (player, quest providers, action providers, portals) — never ordinary NPCs or the full entity set.

---

## Build and run

```bash
cd cyberia-client

# Development build (defaults: BUILD_MODE=DEBUG, localhost URLs)
make -f Web.mk clean && make -f Web.mk all

# Release build — pass the production URLs explicitly (see note below)
make -f Web.mk clean && make -f Web.mk all BUILD_MODE=RELEASE \
    WS_URL=wss://server.cyberiaonline.com/ws \
    API_BASE=https://www.cyberiaonline.com

# Build + serve locally on dev port :8082 (DEBUG, localhost)
./dev-server.sh            # or: ./dev-server.sh <port>
```

`WS_URL` and `API_BASE` are passed straight through to the compiler — see
[Compile-time configuration](#compile-time-configuration). When omitted they
default to `localhost`, so **production build pipelines must pass real URLs**.

The build is part of the Underpost Platform static + PWA pipeline; production deploys go through `underpost client` and `underpost deploy`.

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

### Server URLs (build arguments)

`WS_URL` and `API_BASE` are `make` arguments baked into the WASM as
`-DWS_URL_OVERRIDE` / `-DAPI_BASE_URL_OVERRIDE`. There is **no** RELEASE/DEBUG URL
switch — both default to `localhost` regardless of `BUILD_MODE`:

| make argument | Default                  | Baked macro             |
| ------------- | ------------------------ | ----------------------- |
| `WS_URL`      | `ws://localhost:8081/ws` | `WS_URL_OVERRIDE`       |
| `API_BASE`    | `http://localhost:4005`  | `API_BASE_URL_OVERRIDE` |

> **Production pipelines must pass the URLs.** `BUILD_MODE=RELEASE` alone still
> yields `localhost`. Any release build — the Docker image build, CI, manual
> release — must pass `WS_URL=wss://… API_BASE=https://…` as make arguments
> (or Docker build-args wired through to `make`), or the client ships pointing
> at localhost. If unset, `src/config.h` falls back to bare `"ws://"` /
> `"https://"` stubs.

### Constants (`src/config.h`)

| Constant                    | Default        | Description                                                                                                      |
| --------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| `CYBERIA_CLIENT_HINTS_CODE` | `cyberia-main` | Lookup key for the optional client-hints fetch (presentation override key — never an instance/server identifier) |
| `MAX_TEXTURE_CACHE_SIZE`    | `512`          | Atlas texture LRU cap                                                                                            |
| `MAX_LAYER_CACHE_SIZE`      | `256`          | ObjectLayer metadata LRU cap                                                                                     |
| `MAX_ATLAS_CACHE_SIZE`      | `256`          | Atlas metadata LRU cap                                                                                           |
| `DEFAULT_FRAME_DURATION_MS` | `100`          | Default animation frame duration                                                                                 |

---

## Persistent storage

`serial.c` uses Emscripten's IDBFS (IndexedDB File System) at `/persistent/` for:

- Player authentication token (EIP-712 signature).
- Local game settings (audio volume, key bindings).
- Cached ObjectLayer metadata (session warm-up cache).

No game state is persisted client-side; the authoritative server is the source of truth.
