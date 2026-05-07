# Cyberia Client

**Path:** `cyberia-client/` | **Language:** C (C11/GNU11) → WebAssembly via Emscripten

---

## Overview

`cyberia-client` is the real-time game client for Cyberia Online. It is written in C, compiled to WebAssembly via Emscripten, and rendered in a `<canvas>` element inside a browser. It uses **Raylib** for rendering (OpenGL ES2 under WASM) and connects to the Go game server via a persistent binary WebSocket.

---

## Architecture

```
┌────────────────────────────────────────────────────────────┐
│  Browser                                                   │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  index.html + shell.html                            │  │
│  │  JS glue (Emscripten + services.js + interact_overlay.js + notify_badge.js)  │
│  │                                                      │  │
│  │  ┌────────────────────────────────────────────────┐ │  │
│  │  │  index.wasm (main.c → game loop)               │ │  │
│  │  │                                                │ │  │
│  │  │  Raylib (OpenGL ES2)  ←  game_render.c         │ │  │
│  │  │  Input system         ←  input.c               │ │  │
│  │  │  AOI decoder          ←  binary_aoi_decoder.c  │ │  │
│  │  │  ObjectLayer cache    ←  object_layer.c        │ │  │
│  │  │  Texture manager      ←  texture_manager.c     │ │  │
│  │  │  Game state           ←  game_state.c          │ │  │
│  │  │  Network I/O          ←  network.c             │ │  │
│  │  │  UI components        ←  modal.c, inventory_*.c│ │  │
│  │  └────────────────────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────┘  │
│       │ WebSocket binary                ↑ HTTP JSON         │
└───────┼─────────────────────────────────┼──────────────────┘
        │                                 │
        ▼                                 ▼
  Go Game Server :8081              Engine REST API :4005
  (AOI binary protocol)             (atlas, file/blob, object-layer)
```

---

## Source Files

| File                                                      | Responsibility                                           |
| --------------------------------------------------------- | -------------------------------------------------------- |
| `main.c`                                                  | Entry point, Raylib init, main game loop, event dispatch |
| `client.c / client.h`                                     | Client session state (player UUID, position, coins)      |
| `game_state.c / game_state.h`                             | World state: entity registry, map grid, frame tick       |
| `game_render.c / game_render.h`                           | Top-level render pipeline (map tiles → entities → UI)    |
| `entity_render.c / entity_render.h`                       | Per-entity composited layer stack rendering              |
| `binary_aoi_decoder.c / binary_aoi_decoder.h`             | Binary AOI message parser (0x01–0x05 messages)           |
| `message_parser.c / message_parser.h`                     | JSON message parser for `init_data` (0x02)               |
| `network.c / network.h`                                   | WebSocket connect, send, receive wrappers                |
| `object_layer.c / object_layer.h`                         | ObjectLayer metadata struct + LRU cache                  |
| `object_layers_management.c / object_layers_management.h` | ObjectLayer fetch pipeline (API → cache → render)        |
| `texture_manager.c / texture_manager.h`                   | Atlas texture LRU cache keyed by IPFS CID                |
| `layer_z_order.c / layer_z_order.h`                       | Z-order comparator for entity layer stack rendering      |
| `serial.c / serial.h`                                     | IDBFS-based persistent local storage                     |
| `input.c / input.h`                                       | Mouse/touch event → game action translation              |
| `tap_effect.c / tap_effect.h`                             | Visual tap ripple animation                              |
| `floating_combat_text.c / floating_combat_text.h`         | FCT pop-up renderer (damage, regen, coin, item)          |
| `interaction_bubble.c / interaction_bubble.h`             | NPC interaction indicator bubble above entity            |
| `entity_overhead_ui.c / entity_overhead_ui.h`             | Name plates, HP bars above entities                      |
| `nameplate.c / nameplate.h`                               | Entity nameplate rendering                               |
| `inventory_bar.c / inventory_bar.h`                       | Equipped items bar (bottom of screen)                    |
| `inventory_modal.c / inventory_modal.h`                   | Full inventory grid modal                                |
| `modal.c / modal.h`                                       | Base modal container (backdrop, open/close animation)    |
| `modal_dialogue.c / modal_dialogue.h`                     | Dialogue modal — renders NPC conversation + choices      |
| `modal_player.c / modal_player.h`                         | Player profile modal (stats, wallet, equipment)          |
| `dialogue_data.c / dialogue_data.h`                       | Dialogue tree data structure                             |
| `ol_as_animated_ico.c / ol_as_animated_ico.h`             | Render ObjectLayer as animated icon (inventory cells)    |
| `ol_stack_ico.c / ol_stack_ico.h`                         | Render ObjectLayer stack as composite icon               |
| `ui_icon.c / ui_icon.h`                                   | Generic icon primitives                                  |
| `dev_ui.c / dev_ui.h`                                     | Development overlay (coords, FPS, entity count)          |
| `helper.h`                                                | Common macros and utility definitions                    |
| `config.h`                                                | Compile-time configuration constants                     |
| `shell.html`                                              | Emscripten HTML shell template                           |
| `js/services.js`                                          | JS↔WASM bridge: fetch atlas, file blob, object-layer     |
| `js/interact_overlay.js`                                  | JS overlay for tap-to-interact element                   |
| `js/notify_badge.js`                                      | Browser notification badge helper                        |

---

## Rendering Pipeline

Each frame:

```
BeginDrawing()
  └─ game_render_frame()
       ├─ RenderMapLayer(ground tiles)        ← atlas-clipped tile sprites
       ├─ RenderMapLayer(object tiles)        ← decorative overlay tiles
       ├─ for each entity in z-sorted list:
       │    entity_render_entity()
       │      ├─ for each ObjectLayer in entity stack (bottom → top z-order):
       │      │    texture_manager_get_texture(layer.cid)
       │      │    DrawTextureRec(atlas, frame_rect, position)
       │      ├─ entity_overhead_ui (nameplate + HP bar)
       │      └─ interaction_bubble (if NPC with action)
       ├─ floating_combat_text_tick()         ← animated pop-ups
       ├─ tap_effect_tick()                   ← tap ripple animations
       ├─ inventory_bar_render()              ← equipped items (bottom HUD)
       └─ dev_ui_render()                     ← debug overlay (if ENABLE_DEV_UI)
EndDrawing()
```

**Atlas clipping:** Every sprite is a rectangular clip from a texture atlas. The atlas CID (IPFS) is fetched from the Engine API at `/api/atlas-sprite-sheet/{cid}`. The engine returns frame metadata JSON; the client clips `DrawTextureRec(atlas, {x,y,w,h}, screenPos)`.

---

## Binary AOI Protocol (Decoder)

`binary_aoi_decoder.c` parses all server → client messages:

| Message Type | Byte   | Decoder Function    | Description                               |
| ------------ | ------ | ------------------- | ----------------------------------------- |
| `aoi_update` | `0x01` | `decode_aoi_update` | Delta AOI — entities entered/left view    |
| `init_data`  | `0x02` | `decode_init_data`  | Full config on connect (JSON sub-payload) |
| `full_aoi`   | `0x03` | `decode_full_aoi`   | Full AOI snapshot                         |
| `FCT`        | `0x04` | `decode_fct`        | Floating Combat Text (14-byte fixed)      |
| `ItemFCT`    | `0x05` | `decode_item_fct`   | Item FCT with string item ID (variable)   |

**All multi-byte integers: little-endian.**

**FCT type → visual:**

| FCT Type | Byte   | Color  |
| -------- | ------ | ------ |
| Damage   | `0x00` | Red    |
| Regen    | `0x01` | Green  |
| CoinGain | `0x02` | Yellow |
| CoinLoss | `0x03` | Yellow |
| ItemGain | `0x04` | Cyan   |
| ItemLoss | `0x05` | Purple |

---

## ObjectLayer Cache

`object_layer.c` maintains an LRU cache (`MAX_LAYER_CACHE_SIZE = 256`) of parsed `ObjectLayerMetadata` structs:

```
Fetch pipeline per item ID:
  1. Check LRU cache → hit? return immediately
  2. Call JS bridge: services.fetchObjectLayer(itemId)
     → GET {API_BASE_URL}/api/object-layer/{itemId}
  3. Parse JSON response → populate ObjectLayerMetadata
  4. Evict LRU entry if cache full → insert new entry
  5. Trigger texture fetch for each layer CID
```

---

## Texture Manager

`texture_manager.c` maintains an LRU cache (`MAX_TEXTURE_CACHE_SIZE = 512`) of Raylib `Texture2D` objects:

```
Fetch pipeline per CID:
  1. Check cache by CID → hit? return Texture2D*
  2. Call JS bridge: services.fetchFileBlob(cid)
     → GET {API_BASE_URL}/api/file/blob/{cid}
  3. Decode PNG blob → Raylib Image → Texture2D (GPU upload)
  4. Evict LRU on full cache → insert new entry
```

---

## Input System (Tap-Based)

The client uses a **tap-first** interaction model:

| Input                           | Action                                                       |
| ------------------------------- | ------------------------------------------------------------ |
| Tap empty tile                  | Send `tap_move` WS message → player moves to cell            |
| Tap entity (NPC/resource)       | Send `tap_entity` WS message → server dispatches interaction |
| Tap inventory item              | Toggle equip/unequip → send `item_activation`                |
| Tap interact overlay (JS layer) | Opens action modal via `_c_open_dialogue_from_js`            |

`input.c` translates raw Raylib mouse/touch events into game-world cell coordinates using the current camera offset, then dispatches the appropriate WS message via `network_send_message`.

---

## JS↔WASM Bridge

Emscripten exported C functions (callable from JavaScript):

| C Function                        | Description                                   |
| --------------------------------- | --------------------------------------------- |
| `_c_send_ws_message(ptr, len)`    | Send raw bytes over the WebSocket             |
| `_c_open_dialogue_from_js(ptr)`   | Open dialogue modal with serialized JSON      |
| `_c_interact_overlay_did_close()` | Notify WASM that the JS overlay was dismissed |

JavaScript library functions (callable from C via `EM_ASM` / `--js-library`):

| JS Function                               | Source                   | Description                            |
| ----------------------------------------- | ------------------------ | -------------------------------------- |
| `services.fetchObjectLayer(itemId, cb)`   | `js/services.js`         | Fetch ObjectLayer JSON from Engine API |
| `services.fetchAtlasSpriteSheet(cid, cb)` | `js/services.js`         | Fetch atlas frame metadata             |
| `services.fetchFileBlob(cid, cb)`         | `js/services.js`         | Fetch raw IPFS-addressed blob          |
| `interact_overlay.show(entityId)`         | `js/interact_overlay.js` | Show tap-to-interact HTML overlay      |
| `notify_badge.set(count)`                 | `js/notify_badge.js`     | Update browser notification badge      |

---

## Compile-Time Configuration (`config.h`)

| Constant                    | Default                             | Description                                    |
| --------------------------- | ----------------------------------- | ---------------------------------------------- |
| `WS_URL`                    | `wss://server.cyberiaonline.com/ws` | WebSocket endpoint                             |
| `API_BASE_URL`              | `https://www.cyberiaonline.com`     | Engine REST API base URL                       |
| `HTTP_TIMEOUT_SECONDS`      | `10`                                | HTTP request timeout (asset fetching)          |
| `MAX_TEXTURE_CACHE_SIZE`    | `512`                               | Max atlas textures in VRAM cache               |
| `MAX_LAYER_CACHE_SIZE`      | `256`                               | Max ObjectLayer metadata entries in cache      |
| `MAX_ATLAS_CACHE_SIZE`      | `256`                               | Max atlas sprite sheet metadata entries        |
| `DEFAULT_FRAME_DURATION_MS` | `100`                               | Default animation frame rate                   |
| `ENABLE_DEV_UI`             | `false`                             | Force dev overlay on (override server setting) |
| `APP_VERSION`               | `"1.0.0"`                           | Application version string                     |

For local development, change `WS_URL` and `API_BASE_URL` to `localhost` variants before rebuilding.

---

## Build System

### Dependencies

| Library    | Version | Usage                               |
| ---------- | ------- | ----------------------------------- |
| Emscripten | ≥ 3.1   | C → WASM compiler + JS runtime      |
| Raylib     | ≥ 5.0   | Rendering (OpenGL ES2 via WebGL)    |
| cJSON      | 1.7.x   | JSON parsing (ObjectLayer metadata) |

Raylib and cJSON are vendored under `libs/`.

### Build Modes

| Mode              | Flags                | Use                                             |
| ----------------- | -------------------- | ----------------------------------------------- |
| `DEBUG` (default) | `-O0 -g --profiling` | Development — includes symbols, no optimization |
| `RELEASE`         | `-O3 -DNDEBUG`       | Production — fully optimized                    |

### Build Commands

```bash
cd cyberia-client

# Debug build (default)
make -f Web.mk

# Release build
make -f Web.mk BUILD_MODE=RELEASE

# Build + serve on dev port :8082
make -f Web.mk serve-development

# Build release + serve on production port :8081
make -f Web.mk serve-production

# Clean build artifacts
make -f Web.mk clean
```

### Output

```
bin/
  index.html    — Emscripten HTML container (from shell.html template)
  index.wasm    — Compiled WebAssembly module
  index.js      — Emscripten JS glue
  index.data    — Preloaded data bundle (assets)
```

---

## Persistent Storage

`serial.c` uses Emscripten's **IDBFS** (IndexedDB File System) to persist:

- Player authentication token (EIP-712 signature)
- Local game settings (audio volume, key bindings)
- Cached ObjectLayer metadata (session cache warm-up)

Data is stored at `/persistent/` in the virtual IDBFS mount.

---

## Environment: Local Development

Change these two constants in `src/config.h` and rebuild:

```c
static const char* WS_URL = "ws://localhost:8081/ws";
static const char* API_BASE_URL = "http://localhost:4005";
```

Then:

```bash
# Terminal 1 — Engine (Node.js)
cd /path/to/engine && node src/index.js

# Terminal 2 — Go game server
cd cyberia-server && go run main.go

# Terminal 3 — Client build + serve
cd cyberia-client && make -f Web.mk serve-development
```

Open `http://localhost:8082` in a browser.
