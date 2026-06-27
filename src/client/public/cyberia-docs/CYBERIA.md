<div align="center">

  <img src="https://www.cyberiaonline.com/assets/splash/apple-touch-icon-precomposed.png" alt="CYBERIA Network Object Layer Engine"/>

<h1>CYBERIA</h1>

**Network Object Layers**

_Stackable Rendering Layers as a Unified Tokenized Reality_

[![Version](https://img.shields.io/npm/v/cyberia.svg)](https://www.npmjs.org/package/cyberia)

</div>
Cyberia is an MMORPG extension built on the Underpost Platform. The platform owns the
toolchain, deployment surface, PWA delivery, and base infrastructure. Cyberia adds a three-service MMO
runtime: `engine-cyberia`, `cyberia-server`, and `cyberia-client`.

`engine-cyberia` is the **sidecar-backed data layer**: a Node.js sidecar that owns content,
validation, persistence, the gRPC/REST data services, and asset metadata. It backs the authoritative
Go server and the WASM client with data — it does not run the simulation or the presentation.

---

## Ecosystem at a glance

```text
                         ┌───────────────────────────────────────────────┐
                         │              UNDERPOST PLATFORM                 │
                         │  toolchain · deploy · PWA build · static        │
                         │  delivery · cluster/image/db · monitoring       │
                         │                                                 │
                         │   underpost CLI  ──▶  builds & deploys all      │
                         └───────────────────────────────────────────────┘
                                            │  hosts / delivers
                                            ▼
   ╔═══════════════════════════════ CYBERIA MMO ══════════════════════════════════╗
   ║                                                                               ║
   ║   ┌──────────────────┐   gRPC    ┌──────────────────┐   WebSocket            ║
   ║   │  engine-cyberia  │ ────────▶ │  cyberia-server  │ ───────────┐           ║
   ║   │     (Node.js)    │           │       (Go)       │            │           ║
   ║   │                  │           │                  │            ▼           ║
   ║   │ content          │           │ authoritative    │   ┌──────────────────┐ ║
   ║   │ validation       │           │ simulation       │   │  cyberia-client  │ ║
   ║   │ persistence      │           │ world tick       │   │    (C / WASM)    │ ║
   ║   │ gRPC/REST data   │           │ AOI replication  │   │                  │ ║
   ║   │ asset metadata   │           │                  │   │ rendering        │ ║
   ║   └──────────────────┘           └──────────────────┘   │ input            │ ║
   ║            │                                             │ prediction       │ ║
   ║            └──────────────── REST (content/assets) ─────▶│ presentation     │ ║
   ║                                                          └──────────────────┘ ║
   ╚═══════════════════════════════════════════════════════════════════════════════╝

   One source of truth per concern:
     content & world config ── engine-cyberia
     real-time world state  ── cyberia-server
     presentation & input   ── cyberia-client
```

---

## 1. Toolchain and base infrastructure

Underpost Platform is the operational backbone and the source of truth for deploy IDs, runtime
selection, host/path layout, generated client assets, and environment resolution.

| Area            | What it owns                                                                         |
| --------------- | ------------------------------------------------------------------------------------ |
| Toolchain       | `underpost` CLI, build, deploy, release, metadata, secrets, environment selection    |
| Infrastructure  | bare metal, LXD, Kubernetes, K3s, kubeadm, images, SSH, runners                      |
| Data operations | MongoDB, MariaDB where needed, backups, cron, monitoring                             |
| Delivery        | static build, SSR views, PWA packaging, service worker generation, host/path routing |

`underpost` is the shared control surface for everything infrastructural. Cyberia-specific work belongs
in the `cyberia` CLI, never in parallel platform commands. When a concern already exists in `underpost`,
reuse it instead of forking a Cyberia variant.

---

## 2. PWA workflow

Every deployed client ships as a static application shell with PWA support. The pipeline has exactly two
inputs:

- the deploy `ssr` configuration in `conf.dd-*.js` (or `conf.ssr.json`)
- the service worker source in `src/client/sw/core.sw.js`

Everything else — `index.html` pages, `sw.js`, the precache list — is **generated** during the client
build. Treat them as outputs only; never hand-edit them.

Runtime service-worker behavior:

| Request       | Strategy                         |
| ------------- | -------------------------------- |
| static assets | stale-while-revalidate           |
| API `GET`     | network-first + short cache      |
| API mutations | network-only + background replay |
| navigation    | network-first + fallback shells  |

Fallback selection: offline network → offline fallback view; origin/server failure → maintenance
fallback view. Only fallback-marked views are guaranteed precached.

---

## 3. Cyberia MMO extension

### Responsibility split

| Service          | Owns                                                                      | Must not own                                  |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `engine-cyberia` | content, validation, persistence, gRPC/REST data services, asset metadata | authoritative simulation, render policy       |
| `cyberia-server` | authoritative simulation, world tick, gameplay mutation, AOI replication  | content authority, presentation metadata      |
| `cyberia-client` | rendering, input, prediction, interpolation, presentation                 | authoritative world state, gameplay authority |

Two boundaries are non-negotiable:

- Do not move authoritative logic into the client.
- Do not move content-authority logic into the Go runtime.

### Data flow

```text
engine-cyberia ──gRPC──▶ cyberia-server ──WebSocket──▶ cyberia-client
engine-cyberia ──REST──────────────────────────────▶ cyberia-client
```

### `engine-cyberia` as the sidecar-backed data layer

`engine-cyberia` is the only Cyberia service that owns content-backed data and asset metadata.

- Boot-time world configuration flows from `engine-cyberia` to `cyberia-server` over gRPC `GetFullInstance`.
- Client-facing assets, object layers, dialogues, and presentation hints flow from `engine-cyberia` to `cyberia-client` over REST.
- Simulation never migrates into the sidecar, and presentation policy never migrates out of the client.

### Runtime / health model

Three supervised processes run in parallel, each with its own monitor and reconnect loop. Gameplay is live only when all three are healthy at once.

```text
        ┌──────────────────────────────────────────────────────────────┐
        │                    SUPERVISION (parallel)                      │
        │                                                                │
        │   engine-cyberia        cyberia-server        cyberia-client   │
        │   ┌────────────┐        ┌────────────┐        ┌────────────┐   │
        │   │  monitor   │        │  monitor   │        │  monitor   │   │
        │   │ +reconnect │        │ +reconnect │        │ +reconnect │   │
        │   └─────┬──────┘        └─────┬──────┘        └─────┬──────┘   │
        │         │                     │                     │          │
        │         └──────────┬──────────┴──────────┬──────────┘          │
        │                    ▼                     ▼                     │
        │            all three up & connected?                          │
        └────────────────────────────┬─────────────────────────────────┘
                                      │
                ┌─────────────────────┼─────────────────────┐
                ▼                     ▼                     ▼
          ┌───────────┐        ┌───────────┐         ┌───────────┐
          │  HEALTHY  │        │ DEGRADED  │         │  STANDBY  │
          │ all 3 up  │        │ ≥1 service│         │ gameplay  │
          │ gameplay  │        │ reconnect-│         │ paused    │
          │ live      │        │ ing / down│         │ until all │
          │           │        │           │         │ 3 healthy │
          └───────────┘        └───────────┘         └───────────┘
```

| State      | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `healthy`  | all three Cyberia services are up and connected                      |
| `degraded` | at least one service is reconnecting or unavailable                  |
| `standby`  | gameplay is paused because the full three-service set is not healthy |

---

## User commands

Use `underpost` for platform, infrastructure, build, and deploy. Use `cyberia` for MMO content and
extension workflows. Both share the same helpers — never duplicate config, env, or path logic.

### Platform (underpost)

```bash
# Bootstrap a new app (local app serves on http://localhost:4001)
underpost new app-name

# Build the client bundle / static + PWA output
underpost client
npm run build            # node bin client

# Deploy and operate
underpost deploy <deploy-id>
underpost monitor
```

### Cyberia (cyberia) — `bin/cyberia.js`

| Group          | Command                                | Purpose                                                  |
| -------------- | -------------------------------------- | -------------------------------------------------------- |
| `ol`           | `cyberia ol [item-id]`                 | ObjectLayer import, procedural generation, atlas/sprite  |
| `instance`     | `cyberia instance [instance-code]`     | export / import / drop a Cyberia instance and its data   |
| `client-hints` | `cyberia client-hints [instance-code]` | per-instance presentation hints (palette, camera, icons) |
| `chain`        | `cyberia chain <sub>`                  | Hyperledger Besu + ERC-1155 ObjectLayerToken lifecycle   |
| `run-workflow` | `cyberia run-workflow <name>`          | named maintenance/build scripts from `scripts/`          |

Common examples:

```bash
# Object layer content
cyberia ol hatchet,sword --import                 # import specific items
cyberia ol --import-types skin,floors             # batch import by type (or: all)
cyberia ol floor-desert --generate --seed fx-42   # procedural generation
cyberia ol hatchet --to-atlas-sprite-sheet        # build atlas sprite sheet
cyberia ol --drop --client-public                 # drop data + static asset folders

# Instance data
cyberia instance FOREST --export ./backup
cyberia instance FOREST --import ./backup
cyberia instance FOREST --drop

# Presentation hints
cyberia client-hints cyberia-main --seed-defaults

# Chain / token lifecycle
cyberia chain deploy --chain-id 777771
cyberia chain status
cyberia chain register / mint / transfer / burn / pause / unpause

# Named workflows
cyberia run-workflow import-default-items
cyberia run-workflow seed-skills
cyberia run-workflow seed-dialogues
cyberia run-workflow build-manifest
cyberia run-workflow build-server-dashboard
```

### Run the MMO services

```bash
# engine-cyberia (Node.js data/content services)
npm start                                          # node src/server

# cyberia-server (Go authoritative simulation)
cd cyberia-server && go run main.go                # dev
cd cyberia-server && go build -o cyberia-server . && ./cyberia-server

# cyberia-client (C / WASM presentation)
cd cyberia-client && make -f Web.mk clean && make -f Web.mk web
cd cyberia-client && make -f Web.mk serve-development     # serves on :8082
```

---

## Operational guardrails

- Prefer one source of truth for config, deploy IDs, runtime selection, startup behavior, and generated assets.
- Reuse existing helpers and conventions instead of creating parallel implementations.
- Do not duplicate parsing, env resolution, or path normalization logic across modules.
- Treat generated artifacts (`sw.js`, static pages, atlases, README, manifests) as outputs only.
- Host-level changes must be idempotent, reversible, and explicit; validate before mutating; keep
  orchestration scripts safe to rerun.
- `engine-private/` is a private external dependency. Reference it only as private input; never assume
  its contents exist locally.
