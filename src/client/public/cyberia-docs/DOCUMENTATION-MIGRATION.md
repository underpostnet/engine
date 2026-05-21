# Documentation Migration Plan

This document records the canonical vocabulary, the ownership boundaries between Underpost Platform, engine-cyberia, cyberia-server, and cyberia-client, and the per-document rewrites required to bring the whole documentation set into one coherent narrative.

This is operational, not historical. Anything labelled "deprecation" below is for tracking outgoing terms, not for narrating past refactors.

---

## 1. Target narrative

The documentation must present the system at three levels, in this order:

| Level                 | Identifier                                             | Role                                                                                                                                                                                                                                                         |
| --------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Umbrella product**  | **Underpost Platform**                                 | Infra · toolchain · application platform. Manages base ERP/CRM-style PWA applications and the Cyberia MMO extension. Spans bare metal, K8s/LXD/K3s/kubeadm, CI/CD, GitHub OSS flow, static + PWA + Workbox delivery, Cloudinary-backed assets, Underpost CLI |
| **MMO extension**     | **Cyberia**                                            | The MMO that runs on top of Underpost Platform. Three runtime processes participate.                                                                                                                                                                         |
| **Cyberia processes** | `engine-cyberia` · `cyberia-server` · `cyberia-client` | Content authority · authoritative simulation · presentation runtime. Strictly non-overlapping responsibilities.                                                                                                                                              |

Documentation must not present any of these as overlapping. In particular:

- `engine-cyberia` is **not** the gameplay runtime.
- `cyberia-server` is **not** the content authority.
- `cyberia-client` is **not** authoritative for world state.

---

## 2. Role definitions (authoritative)

### engine-cyberia

The content-authoring backend and data backbone for the Cyberia MMO extension. Owns persisted content and exposes it through gRPC (consumed by `cyberia-server` at boot) and REST (consumed by `cyberia-client` for assets and optional presentation overrides).

Owns:

- Content generation, persistence, validation.
- Maps, portal topology, object layers.
- Atlas / sprite-sheet metadata.
- Instance / world configuration (gameplay rules).
- Persisted character, quest, dialogue, and action data.
- gRPC `CyberiaDataService` and REST API.
- CLI and toolchain integration for content workflows.
- Web UI tools for content authoring.
- Asset distribution endpoints.
- Static content backend.
- The `/api/cyberia-client-hints/:code` REST endpoint: the **canonical** source of every presentation value the cyberia-client renders with (palette, entity colour keys, status-icon visuals, camera tunings, cell-pixel size, default object dims, interpolation window, dev-overlay flag).

Does **not** own:

- The authoritative real-time simulation server.
- The client presentation layer.
- Client-only render metadata as authoritative state.
- The runtime game loop.

### cyberia-server

The authoritative simulation runtime. Owns world state and the gameplay rules that mutate it.

Owns:

- Authoritative world state.
- The tick: a `uint32` advanced once per simulation step at a fixed `tickRate`.
- Simulation phases — the only allowed mutators of world state.
- AOI replication: per-player interest filtering and snapshot emission at `snapshotRate`.
- Input command processing: typed input commands drained from per-player queues each tick.
- Snapshot generation: AOI-scoped world view per player, with `tick` + `lastAckedSequence` headers.
- Gameplay authority: combat, movement, skills, collision, lifecycle, economy.

Does **not** own:

- Persistence.
- Client presentation policy.
- Render metadata.

### cyberia-client

The presentation runtime. Compiled to WebAssembly, served as a PWA, owns its own render policy.

Owns:

- Rendering and UI.
- Input capture (mouse/touch/keyboard → typed input command with monotonic sequence).
- Client-side prediction of the local player.
- Reconciliation against authoritative snapshots.
- Interpolation of remote entities.
- Presentation runtime that fetches palette, entity colour keys, status-icon visuals, camera tunings, cell-pixel size, default object dims, interpolation window, and dev-overlay flag from `GET /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE` — the **sole** source of presentation values. A tiny inline neutral-grey bootstrap in `presentation_runtime.c` covers the few frames between window-up and fetch-complete; nothing else is compiled in.

Does **not** own:

- World simulation.
- Economy outcomes, combat resolution, skill dispatch decisions.
- Any state another client depends on for correctness.

---

## 3. Startup order

Startup is strictly sequential. Documentation must reflect this verbatim — do not use "parallel" or "concurrent" language anywhere.

```
1. Persistent backend / sidecar data layer
   ├─ databases (MongoDB; optional MariaDB)
   ├─ content backend (engine-cyberia REST + gRPC)
   ├─ static asset backend (Cloudinary + IPFS where applicable)
   └─ config and data services
2. cyberia-server
   ├─ dials engine-cyberia gRPC
   ├─ loads world configuration
   └─ opens WebSocket + REST health/metrics
3. cyberia-client
   ├─ load tiny inline bootstrap (neutral grey only — splash render)
   ├─ fetch /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE  (sole presentation source)
   ├─ connects to cyberia-server WebSocket
   └─ enters render frame + prediction loop
```

Rationale: `cyberia-server` exits on gRPC dial failure (it never fabricates a world). `cyberia-client` has no useful work until the server is accepting WebSocket connections.

---

## 4. Canonical vocabulary

These are the only allowed terms for each concept. Substitute any synonym with the canonical form during rewrites.

| Canonical                 | Definition                                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **tick**                  | Monotonic `uint32` simulation step counter on `cyberia-server`.                                                     |
| **tick rate**             | Simulation Hz on `cyberia-server`. **Never** "fps" on the server.                                                   |
| **snapshot rate**         | AOI replication Hz. Decoupled from tick rate.                                                                       |
| **snapshot**              | AOI-filtered world view at one tick for one player.                                                                 |
| **input command**         | Typed client→server frame `{kind, clientTick, sequence, payload}`.                                                  |
| **prediction**            | Optimistic local apply of input commands to the predicted self entity.                                              |
| **reconciliation**        | Drop acknowledged inputs, rewind self to authoritative position, replay unacked inputs.                             |
| **interpolation**         | Render-time smoothing of remote entities, sampled from snapshot history.                                            |
| **AOI**                   | Area of interest: the spatial filter that defines which entities a given player receives.                           |
| **replication**           | Production and delivery of snapshots from server to clients.                                                        |
| **simulation phase**      | A named step inside one simulation tick. The only mutators of authoritative state.                                  |
| **authoritative server**  | `cyberia-server`. Sole authority on world state.                                                                    |
| **content authority**     | `engine-cyberia`. Sole authority on persisted content and world configuration.                                      |
| **client hints**          | Optional presentation overrides served by engine-cyberia REST.                                                      |
| **world configuration**   | Gameplay parameters loaded once at server boot from engine-cyberia.                                                 |
| **presentation metadata** | Render-only data: palette, status-icon visuals, camera knobs, dev-overlay flag, interpolation window. Client-owned. |
| **engine-cyberia**        | The Cyberia content backend. Always qualify as `engine-cyberia` — never just "the engine".                          |
| **Underpost Platform**    | The umbrella product. Use this for the platform; never overload "engine" with this meaning.                         |

---

## 5. Terminology normalization list

Replace these on sight in every document.

| Outgoing                                                | Replace with                                                                                                             | Notes                                                                                                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| "fps" (on the server)                                   | **tick rate**                                                                                                            | The proto field `fps` is a legacy alias; do not propagate the name in prose.                                                                 |
| "frame", "per-frame" (on the server)                    | **per tick**                                                                                                             | Server has no frame concept.                                                                                                                 |
| "frame-based movement", "1/fps step"                    | **dt-based integration**, **`step = speed × tickDuration`**                                                              |                                                                                                                                              |
| "game_state" used as a god object                       | Split per concern: simulation reads `WorldState`, client uses `prediction_runtime` / `interpolation` / explicit modules. |
| "game state" generically                                | **world state** when authoritative; **view models** when render-only.                                                    |
| "the engine" (ambiguous)                                | **engine-cyberia** when meaning the Cyberia content backend; **Underpost Platform** when meaning the umbrella product.   |
| "Node.js Engine", "Engine (Node.js)"                    | **engine-cyberia (Node.js)**                                                                                             |                                                                                                                                              |
| "render config", "client config"                        | **presentation defaults** (compile-time) or **client hints** (per-instance overrides).                                   |
| "init payload includes palette / statusIcons / camera"  | Replace with: presentation lives on the client; init payload is simulation-only.                                         |
| "parallel startup" / "start all three in parallel"      | **sequential startup**, **strict order**                                                                                 | The platform enforces sequential startup.                                                                                                    |
| "binary→JSON→handler ping-pong"                         | Use **typed input command pipeline**; the JSON intermediate is gone on the binary path.                                  |
| "v4", "v4.x", "v4.0.0", "v4.1.0", "v4.2.0"              | Remove entirely                                                                                                          | Internal refactor labels do not belong in user-facing docs. Acceptable only inside a deprecation-history section if one is explicitly added. |
| "transitional path", "legacy bridge", "legacy shim"     | Remove from current-system docs                                                                                          | Keep only in deprecation history where required.                                                                                             |
| "GameColors", "g_game_state.colors", "StatusIconConfig" | Remove from current-system narrative                                                                                     | These were intermediate state; the current client uses `presentation_defaults` + `presentation_runtime`.                                     |

---

## 6. Presentation metadata cleanup

Presentation metadata must not appear in any authoritative runtime contract. Audit the following classes and route each one to the right home.

| Class                                  | Correct home                                                 | Current location anti-patterns to remove                              |
| -------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------------------------- |
| Palette (named ColorRGBA entries)      | client compile-time defaults; optional engine REST overrides | server WS init payload; server in-memory state; gRPC `InstanceConfig` |
| Status-icon stem (icon filename)       | client compile-time defaults; optional engine REST overrides | server in-memory state; gRPC `InstanceConfig.statusIcons`             |
| Status-icon border color               | client compile-time defaults; optional engine REST overrides | server in-memory state; gRPC `InstanceConfig`                         |
| Per-entity-type fallback color keys    | client compile-time defaults; optional engine REST overrides | gRPC `EntityTypeDefault.colorKey`                                     |
| Camera smoothing / zoom                | client compile-time defaults; optional engine REST overrides | gRPC `InstanceConfig`; server in-memory state                         |
| Default screen factors                 | client compile-time defaults; optional engine REST overrides | gRPC `InstanceConfig`; server in-memory state                         |
| Interpolation window                   | client compile-time defaults; optional engine REST overrides | gRPC `InstanceConfig`; server in-memory state                         |
| Dev-overlay flag                       | client compile-time defaults; optional engine REST overrides | gRPC `InstanceConfig`; server in-memory state                         |
| Any non-essential cosmetic render hint | client compile-time defaults; optional engine REST overrides | anywhere on the server                                                |

The simulation contract (`gRPC InstanceConfig` on the wire from engine-cyberia to cyberia-server; WS init payload from cyberia-server to cyberia-client) carries only fields that influence simulation behaviour: AOI radius, tick rate, economy rules, skill rules, equipment rules, entity gameplay defaults.

---

## 7. Documents to update

### Documents in `src/client/public/cyberia-docs/`

| Document                                                 | Status             | Action                                                                                                                                     |
| -------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| [UNDERPOST-PLATFORM.md](UNDERPOST-PLATFORM.md)           | **Done**           | Umbrella product doc; canonical introduction to platform scope and CLI surface.                                                            |
| [ARCHITECTURE.md](ARCHITECTURE.md)                       | **Done**           | Three-process model; canonical vocabulary; sequential startup; tick model; phase order; wire protocol; presentation ownership.             |
| [CYBERIA-SERVER.md](CYBERIA-SERVER.md)                   | **Done**           | Authoritative simulation runtime; tick + phases; AOI snapshots; input command pipeline; no presentation.                                   |
| [CYBERIA-CLIENT.md](CYBERIA-CLIENT.md)                   | **Done**           | Presentation runtime; render loop; prediction/reconciliation/interpolation; client-owned presentation; optional client hints.              |
| [DOCUMENTATION-MIGRATION.md](DOCUMENTATION-MIGRATION.md) | **This document**  | Operational migration record.                                                                                                              |
| [CYBERIA-CLI.md](CYBERIA-CLI.md)                         | **Pending review** | Frame as Cyberia-specific extensions to Underpost CLI; remove duplicated coverage; cross-link to `UNDERPOST-PLATFORM.md`.                  |
| [ACTION-SYSTEM.md](ACTION-SYSTEM.md)                     | **Pending review** | Replace "the engine" with `engine-cyberia` where it refers to the Node.js backend. Keep gameplay semantics.                                |
| [QUEST-SYSTEM.md](QUEST-SYSTEM.md)                       | **Pending review** | Same normalization.                                                                                                                        |
| [ENTITY-PROFILE.md](ENTITY-PROFILE.md)                   | **Pending review** | Same normalization; ensure presentation metadata references point to client.                                                               |
| [OFF-CHAIN-ECONOMY.md](OFF-CHAIN-ECONOMY.md)             | **Pending review** | Reframe ownership: economy rules are world configuration (engine-cyberia → cyberia-server); economy outcomes are authoritative simulation. |
| [HARDHAT-MODULE.md](HARDHAT-MODULE.md)                   | **Pending review** | Position Hardhat/Besu as a content-side adjunct, not a runtime authority.                                                                  |
| [WHITE-PAPER.md](WHITE-PAPER.md)                         | **Pending review** | Bring product framing in line with Underpost Platform / Cyberia distinction.                                                               |
| [ROADMAP.md](ROADMAP.md)                                 | **Pending review** | Sequence items under the canonical product hierarchy.                                                                                      |

### Documents in `src/client/public/nexodev/docs/references/`

These are platform-level reference docs. They already cover Underpost CLI capabilities and are good as a foundation. Action items:

| Document                                                                                                                                                                                                                                                                                                                                                      | Action                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `Getting started.md`                                                                                                                                                                                                                                                                                                                                          | Lead with **Underpost Platform** framing; note that Cyberia is an MMO extension on top.                                                                                                                      |
| `Command Line Interface.md`                                                                                                                                                                                                                                                                                                                                   | Confirm CLI coverage list matches `UNDERPOST-PLATFORM.md` § "Underpost CLI — command surface".                                                                                                               |
| `Baremetal Management.md`, `LXD Management.md`, `Deploy to K8S.md`, `Deploy custom instance to K8S.md`, `Main cluster lifecycle commands.md`, `Monitor cluster.md`, `Cron Jobs Management.md`, `DB and Backup Management.md`, `Image Management.md`, `SSH Management.md`, `Static Generator.md`, `Running Separate Client and API Servers for Development.md` | Keep content; ensure each cross-links to `UNDERPOST-PLATFORM.md` at the top so readers understand the platform context. Normalize any stray "engine" references that mean `engine-cyberia` vs. the platform. |

### Repository READMEs

| Document                   | Status                                                                                                                           |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Root `README.md`           | **Done** — leads with Underpost Platform section, then the existing CLI surface.                                                 |
| `cyberia-server/README.md` | **Done** — header and architecture diagram now use canonical vocabulary and present three-process model with sequential startup. |
| `cyberia-client/README.md` | **Done** — opens with role + process map; sequential startup made explicit.                                                      |

---

## 8. Section-by-section rewrite checklist

For documents marked **Pending review** above, apply the following passes in order:

1. **Title and lead paragraph** — replace "the engine" with the right qualifier; identify which of the three Cyberia processes the document concerns; link to `UNDERPOST-PLATFORM.md` at the top.
2. **Architecture diagrams** — boxes should read `engine-cyberia (Node.js)`, `cyberia-server (Go)`, `cyberia-client (C/WASM)`. Three-process flow only; no merged boxes.
3. **Vocabulary pass** — apply the [Terminology normalization list](#5-terminology-normalization-list).
4. **Startup order** — wherever startup or deployment is described, make sure it is sequential (1 → 2 → 3) and explicitly says so. Remove any "parallel" or "concurrent" language.
5. **Ownership pass** — for every field, behavior, or capability mentioned: which process owns it? If the document attributes a presentation concern to the server, fix it.
6. **Presentation pass** — apply [Presentation metadata cleanup](#6-presentation-metadata-cleanup). No palette/camera/devUi/interpolation references inside server contracts.
7. **Cross-reference pass** — add or fix links to `UNDERPOST-PLATFORM.md`, `ARCHITECTURE.md`, `CYBERIA-SERVER.md`, `CYBERIA-CLIENT.md` at the bottom of every Cyberia-area doc.
8. **Refactor-label pass** — strip every occurrence of `v4`, `v4.x`, "transitional path", "legacy bridge", etc. unless it appears inside an explicitly-labelled deprecation-history block.

---

## 9. Acceptance criteria

A document is considered migrated when **all** of the following are true:

- It begins with the correct framing (Underpost Platform / Cyberia / specific process).
- Every term it uses appears in [§4 Canonical vocabulary](#4-canonical-vocabulary) or is a domain-specific term (e.g. AtlasSpriteSheet, ObjectLayer).
- Architecture diagrams use the three canonical process names.
- Startup is described as sequential.
- No presentation metadata appears inside any authoritative contract.
- No `v4*` refactor labels appear except inside a labelled deprecation-history section.
- The footer cross-links to at least `UNDERPOST-PLATFORM.md` and `ARCHITECTURE.md`.

---

## 10. Deprecation history

This document is the **only** place that records migration history, removed fields, and outgoing terminology. No other document — process docs, platform doc, READMEs, reference docs, or source comments inside `src/` — may carry refactor-version labels or describe behavior that no longer exists.

### Completed removals

| Removed / Renamed                                                                                                                                                                                                                                                                           | Mechanism                                                                                                                                                | Current home                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `InstanceConfig.fps` (proto field 2)                                                                                                                                                                                                                                                        | Field `reserved` in `cyberia.proto`; `cyberia.pb.go` regenerated; Go server reads `tick_rate` (field 65).                                                | `InstanceConfig.tick_rate` (proto field 65)                          |
| `InstanceConfig.interpolation_ms / camera_smoothing / camera_zoom / default_width_screen_factor / default_height_screen_factor / dev_ui / colors` (proto fields 3, 6, 7, 8, 9, 10, 11)                                                                                                      | Fields `reserved` in `cyberia.proto`.                                                                                                                    | `ClientHints` REST contract + client `presentation_defaults`         |
| `InstanceConfig.status_icons` (proto field 64)                                                                                                                                                                                                                                              | Field `reserved` in `cyberia.proto`. Numeric `id` u8 still ships on the AOI wire; icon stem + border colour are client-resolved.                         | `ClientHints` REST contract + client `presentation_defaults`         |
| `InstanceConfig.client_hints` (proto field 67)                                                                                                                                                                                                                                              | Field `reserved` in `cyberia.proto`.                                                                                                                     | `ClientHints` REST contract                                          |
| `EntityTypeDefault.color_key` (proto field 4)                                                                                                                                                                                                                                               | Field `reserved` in `cyberia.proto`.                                                                                                                     | Client `presentation_entity_fallback_color(entity_type)`             |
| `InitPayload.Fps`, `InitPayload.Colors`, `InitPayload.StatusIcons`, `InitPayload.ClientHints`, `InitPayload.InterpolationMs`, `InitPayload.CameraSmoothing`, `InitPayload.CameraZoom`, `InitPayload.DevUi`, `InitPayload.DefaultWidthScreenFactor`, `InitPayload.DefaultHeightScreenFactor` | Removed from Go `InitPayload` struct in `cyberia-server/src/types.go`.                                                                                   | The init payload is now strictly simulation/protocol.                |
| `PresentationHints` Go struct                                                                                                                                                                                                                                                               | Deleted from `cyberia-server`. Replaced by a single internal `sim_palette` lookup used only for AOI-wire colour fill at world-build and one-shot spawns. | `cyberia-server/src/sim_palette.go` (internal, not on any contract)  |
| `legacyApplyInputCommand` (Go bridge)                                                                                                                                                                                                                                                       | Deleted.                                                                                                                                                 | `phase_input_handlers.go`                                            |
| Monolithic JSON dispatcher inside `handleJSONUplink`                                                                                                                                                                                                                                        | Deleted.                                                                                                                                                 | `phase_input_handlers.go` (typed dispatch per `InputKind`)           |
| `GameColors` struct + `GameState.colors` field (C)                                                                                                                                                                                                                                          | Deleted.                                                                                                                                                 | `cyberia-client/src/domain/presentation_defaults`                    |
| `StatusIconConfig` struct + `GameState.status_icons[]` field (C)                                                                                                                                                                                                                            | Deleted.                                                                                                                                                 | `cyberia-client/src/domain/presentation_defaults`                    |
| `EntityTypeDefault.color_key` (C struct field)                                                                                                                                                                                                                                              | Deleted.                                                                                                                                                 | `cyberia-client/src/domain/presentation_defaults`                    |
| `message_parser_parse_colors` (C function)                                                                                                                                                                                                                                                  | Deleted.                                                                                                                                                 | n/a — palette is client-owned                                        |
| `game_state_init_presentation_from_defaults` (C function)                                                                                                                                                                                                                                   | Deleted; presentation runtime is responsible.                                                                                                            | `cyberia-client/src/domain/presentation_runtime`                     |
| `game_state_get_color_by_key`, `game_state_get_status_border_color` (C inline shims)                                                                                                                                                                                                        | Deleted.                                                                                                                                                 | `presentation_runtime_palette`, `presentation_runtime_status_border` |

### Documentation policy

If a future contract or field is removed, document it in this table — never in the running text of a current-system document.

---

## 11. Pending-review items

Items listed here require a coordinated protocol change or explicit design decision before they can be fully resolved. Each is tracked here until resolved or deferred permanently.

### 11.1 AOI wire-side RGBA removal (`resolved`)

**Status:** Done. Per-entity RGBA bytes have been removed from the AOI wire. `sim_palette.go` was deleted, the `Color` field was dropped from every server-side entity state struct, and the bit-7 flag is now unused (reserved). The C client resolves every entity colour locally through `presentation_runtime_palette` / `presentation_entity_fallback_color`.

---

### 11.2 `CyberiaInstanceConf` legacy presentation fields (`resolved`)

**Status:** All presentation fields removed from `CyberiaInstanceConfSchema`. Simulation contract is now strictly gameplay.

**Removed fields:**

```
cellSize, fps, interpolationMs, defaultObjWidth, defaultObjHeight,
cameraSmoothing, cameraZoom, defaultWidthScreenFactor,
defaultHeightScreenFactor, devUi, colors
```

Also removed: `StatusIconEntrySchema.iconId`, `.bounce`, `.borderColor` (kept only `id`, `name`, `description`); `EntityDefaultSchema.colorKey`.

**Resolution chain:** the three-step lookup collapsed to two:

1. `CyberiaClientHints` collection — `src/api/cyberia-client-hints/` (per-deployment override)
2. Canonical defaults from `src/client/components/cyberia/SharedDefaultsCyberia.js`

The intermediate `CyberiaInstanceConf` step is gone. Deployments that previously stored presentation overrides on `CyberiaInstanceConf` must migrate to `CyberiaClientHints` documents (see `cyberia run-workflow seed-client-hints` in the CLI).

---

### 11.3 `ClientHints` / `ColorEntry` / `StatusIconEntry` / `EntityColorKey` proto messages (`resolved`)

**Status:** Removed from the proto. The presentation REST endpoint emits JSON; there is no protobuf message in that path. `cyberia.pb.go` regenerated; zero consumers across the three repos.

---

### 11.4 `presentation_defaults.{h,c}` in cyberia-client (`resolved`)

**Status:** Deleted. The C/WASM client no longer carries a compile-time palette, status-icon table, or render-tuning constants.

**Why:** the architecture rule is "client = presentation runtime, engine = content authority". Baking presentation defaults into the C client made the client a co-authority on its own render policy, which violated the rule and forced every palette change to ship as a binary rebuild.

**After:**

- `domain/presentation_runtime.{c,h}` is the sole owner of presentation state. It fires a single GET to `/api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE` on startup, parses palette + entity colour keys + status-icon visuals + camera/cell tunings into a process-local table, and writes a one-shot hydration into `g_game_state.cell_size`, `.interpolation_ms`, `.camera.zoom`.
- A tiny inline neutral-grey bootstrap inside `presentation_runtime.c` covers the few frames between window-up and fetch-complete. Splash screen renders; nothing breaks if the fetch fails (gameplay is unaffected — every accessor returns the bootstrap value).
- All call sites that used `presentation_palette_lookup`, `presentation_entity_fallback_color`, `presentation_status_icon_id`, `presentation_status_icon_border`, or any `PRESENTATION_*_DEFAULT` macro now use the runtime accessors.

### 11.5 Proto: `cell_size`, `default_obj_width`, `default_obj_height` reserved (`resolved`)

**Status:** Fields 1, 4, 5 reserved in `InstanceConfig`. `cyberia.pb.go` regenerated. Go server's `GameServer` struct dropped `cellSize`, `defaultObjWidth`, `defaultObjHeight`. `InitPayload` JSON no longer carries them.

**Rationale:** cell-pixel size and object dimensions are presentation, not simulation. They reach the client through `/api/cyberia-client-hints`, not gRPC and not the WebSocket init payload. The simulation operates in cell units; pixel mapping is the renderer's concern.

### 11.6 `CYBERIA_CLIENT_HINTS_CODE` rename (`resolved`)

**Status:** The C client's `config.h` constant renamed from `INSTANCE_CODE` to `CYBERIA_CLIENT_HINTS_CODE`. The old name implied the C client knew about server instances; in fact it only carries a key for looking up its own presentation overrides at the engine REST endpoint. The Go server's separate `INSTANCE_CODE` env var (which scopes the gRPC instance load) is unrelated and kept.
