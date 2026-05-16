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

Paths are relative to `cyberia-client/`. C/H translation units live under `src/`; JS bridges live under `src/js/`. The Emscripten HTML shell template is `src/shell.html`. `Web.mk` writes intermediate object files to `build/web/<MODE>/` and the final web bundle (`index.html`, `index.wasm`, `index.js`, `index.data`) to `bin/`.

| File                                                              | Responsibility                                           |
| ----------------------------------------------------------------- | -------------------------------------------------------- |
| `src/main.c`                                                      | Entry point, Raylib init, main game loop, event dispatch |
| `src/client.c / src/client.h`                                     | Client session state (player UUID, position, coins)      |
| `src/game_state.c / src/game_state.h`                             | World state: entity registry, map grid, frame tick       |
| `src/game_render.c / src/game_render.h`                           | Top-level render pipeline (map tiles → entities → UI)    |
| `src/render.c / src/render.h`                                     | Low-level draw helpers shared by the render pipeline     |
| `src/entity_render.c / src/entity_render.h`                       | Per-entity composited layer stack rendering              |
| `src/binary_aoi_decoder.c / src/binary_aoi_decoder.h`             | Binary AOI message parser (0x01–0x05 messages)           |
| `src/message_parser.c / src/message_parser.h`                     | JSON message parser for `init_data` (0x02)               |
| `src/network.c / src/network.h`                                   | WebSocket connect, send, receive wrappers                |
| `src/object_layer.c / src/object_layer.h`                         | ObjectLayer metadata struct + LRU cache                  |
| `src/object_layers_management.c / src/object_layers_management.h` | ObjectLayer fetch pipeline (API → cache → render)        |
| `src/texture_manager.c / src/texture_manager.h`                   | Atlas texture LRU cache keyed by IPFS CID                |
| `src/layer_z_order.c / src/layer_z_order.h`                       | Z-order comparator for entity layer stack rendering      |
| `src/serial.c / src/serial.h`                                     | IDBFS-based persistent local storage                     |
| `src/input.c / src/input.h`                                       | Mouse/touch event → game action translation              |
| `src/tap_effect.c / src/tap_effect.h`                             | Visual tap ripple animation                              |
| `src/floating_combat_text.c / src/floating_combat_text.h`         | FCT pop-up renderer (damage, regen, coin, item)          |
| `src/interaction_bubble.c / src/interaction_bubble.h`             | NPC interaction indicator bubble above entity            |
| `src/entity_overhead_ui.c / src/entity_overhead_ui.h`             | Name plates, HP bars above entities                      |
| `src/nameplate.c / src/nameplate.h`                               | Entity nameplate rendering                               |
| `src/inventory_bar.c / src/inventory_bar.h`                       | Equipped items bar (bottom of screen)                    |
| `src/inventory_modal.c / src/inventory_modal.h`                   | Full inventory grid modal                                |
| `src/modal.c / src/modal.h`                                       | Base modal container (backdrop, open/close animation)    |
| `src/modal_dialogue.c / src/modal_dialogue.h`                     | Dialogue modal — renders NPC conversation + choices      |
| `src/modal_player.c / src/modal_player.h`                         | Player profile modal (stats, wallet, equipment)          |
| `src/dialogue_data.c / src/dialogue_data.h`                       | Dialogue tree data structure                             |
| `src/ol_as_animated_ico.c / src/ol_as_animated_ico.h`             | Render ObjectLayer as animated icon (inventory cells)    |
| `src/ol_stack_ico.c / src/ol_stack_ico.h`                         | Render ObjectLayer stack as composite icon               |
| `src/ui_icon.c / src/ui_icon.h`                                   | Generic icon primitives                                  |
| `src/dev_ui.c / src/dev_ui.h`                                     | Development overlay (coords, FPS, entity count)          |
| `src/helper.h`                                                    | Common macros and utility definitions                    |
| `src/config.h`                                                    | Compile-time configuration constants                     |
| `src/js/interact_bridge.c / src/js/interact_bridge.h`             | C side of JS interaction-overlay bridge                  |
| `src/js/services.js / src/js/services.h`                          | JS↔WASM bridge: fetch atlas, file blob, object-layer     |
| `src/js/interact_overlay.js`                                      | JS overlay for tap-to-interact element                   |
| `src/js/notify_badge.js / src/js/notify_badge.h`                  | Browser notification badge helper                        |
| `src/shell.html`                                                  | Emscripten HTML shell template                           |

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
