# Underpost Platform

**The umbrella product.** Underpost Platform is an end-to-end CI/CD, deployment, and application platform that runs everything from bare metal up through container orchestration, content authoring, and real-time runtime extensions. Cyberia — the MMO — is one extension that runs on top of Underpost Platform; it is not the platform.

---

## Product map

```
┌────────────────────────────────────────────────────────────────────────┐
│  UNDERPOST PLATFORM                                                    │
│  Infra · Toolchain · Application platform                              │
│                                                                        │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  ┌───────────┐ │
│  │ bare metal   │  │ Kubernetes / │  │  CI / CD      │  │ Static +  │ │
│  │ provisioning │  │ K3s / kubeadm│  │  + release    │  │ PWA       │ │
│  │ + LXD        │  │              │  │  orchestration│  │ + Workbox │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬────────┘  └─────┬─────┘ │
│         │                 │                 │                 │       │
│  ┌──────┴─────────────────┴─────────────────┴─────────────────┴─────┐ │
│  │              Underpost CLI — toolchain backbone           │ │
│  │  init · build · deploy · cluster · cron · db · image · secret ·  │ │
│  │  metadata · monitor · ssh · runner · lxd · baremetal · release   │ │
│  └────────────────────────────────────────────────────────────────┬─┘ │
│                                                                   │   │
│  ┌──────────────────────┐                ┌──────────────────────┐ │   │
│  │  ERP / CRM-style     │                │  Cyberia (MMO ext.)  │ │   │
│  │  PWA base apps       │                │  ────────────────    │ │   │
│  │  (default workload)  │                │  engine-cyberia      │ │   │
│  │                      │                │  cyberia-server      │ │   │
│  │                      │                │  cyberia-client      │ │   │
│  └──────────────────────┘                └──────────────────────┘ │   │
└───────────────────────────────────────────────────────────────────┴───┘
```

Underpost Platform manages base ERP/CRM-style PWA applications by default. Cyberia is the specialized, real-time MMO extension layered on top: it reuses the platform's deployment, toolchain, persistence, asset distribution, and CI/CD pipeline, and adds a tick-based simulation server plus a WASM presentation runtime.

---

## What Underpost Platform covers

### Infrastructure

- **Bare metal provisioning** for Rocky Linux 9 hosts: prepare a fresh machine and bring it into the platform.
- **LXD** containers for lightweight isolated workloads alongside or in place of Kubernetes.
- **Kubernetes** workflows for production clusters, **K3s** for single-node and edge, **kubeadm** for self-managed control planes.
- **Image management** for OCI/container artifacts produced by the platform.

### Toolchain

- **Underpost CLI** — the toolchain backbone. Every other workflow in this document goes through it.
- **GitHub OSS repository workflow** — clone, pull, push, commit, release, and CI integrations are first-class CLI subcommands.
- **CI/CD orchestration** — GitHub Actions integrations, container builds, multi-environment deployments.
- **Cron jobs** — scheduled platform-managed jobs (backups, reload loops, periodic content tasks).

### Application delivery

- **Static builds** — per-deploy client bundles produced by the platform build pipeline.
- **PWA delivery** — every deploy ships as an installable Progressive Web App.
- **Workbox-based offline support** — service worker generation is part of the build pipeline.
- **Cloudinary-backed static asset flow** — used for image/asset delivery where applicable.
- **Per-deploy host/path runtime** — multiple applications, multiple hosts, multiple paths from one config.

### Operational surface

- **Secrets** — `env:VAR`-style resolution at config-load time; no plaintext in committed configs.
- **Databases** — MongoDB (default), MariaDB (where required); managed with platform CLI.
- **Backups** — DB and content backups orchestrated as cron jobs.
- **Monitoring** — cluster, runner, and per-deploy health surfaces.
- **SSH / runners** — managed remote-host configuration for CI runners and operational access.
- **Release orchestration** — version, tag, and publish flows for the `underpost` npm package and platform-managed apps.

---

## Underpost CLI — command surface

`underpost` (installed via `npm install -g underpost`) is the single entry point for every platform operation. The CLI covers the following concerns; each is a top-level subcommand or subcommand group:

| Concern                             | Coverage                                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| **Project initialization**          | `underpost new <app-name>` — scaffolds a deploy with config, conf, build, and dev wiring.                                          |
| **Client builds**                   | `underpost client` — produces a static SPA + PWA + service worker bundle.                                                          |
| **Start / deploy orchestration**    | `underpost start`, `underpost deploy` — local dev runs and per-target deployments.                                                 |
| **GitHub OSS flows**                | `underpost clone`, `underpost pull`, `underpost push`, `underpost commit`, `underpost pr` — repository workflows for OSS projects. |
| **Environment configuration**       | `underpost env <deploy-id> <env>` — populates `.env.*` and the npm start script for the targeted deploy.                           |
| **Static builds**                   | static-generator workflows for per-deploy host/path slices.                                                                        |
| **Kubernetes / cluster operations** | `underpost cluster` — apply manifests, manage namespaces, drive K3s/kubeadm.                                                       |
| **Secrets**                         | `underpost secret` — manage the resolved-at-runtime secret pipeline.                                                               |
| **Images**                          | `underpost image` — container image build/tag/push.                                                                                |
| **Databases**                       | `underpost db` — backup, restore, schema operations.                                                                               |
| **Metadata**                        | `underpost metadata` — bundle/version/asset metadata flows.                                                                        |
| **Cron jobs**                       | `underpost cron` — schedule, list, and run platform-managed cron entries.                                                          |
| **File storage**                    | static + object storage workflows including the Cloudinary path.                                                                   |
| **Tests**                           | `underpost test` — integration test runs against a live deploy.                                                                    |
| **Monitoring**                      | `underpost monitor` — cluster + runner monitoring.                                                                                 |
| **SSH**                             | `underpost ssh` — managed remote-host operations.                                                                                  |
| **Runners**                         | `underpost runner` — CI runner registration and lifecycle.                                                                         |
| **LXD**                             | `underpost lxd` — LXD container workflows.                                                                                         |
| **Bare metal**                      | `underpost baremetal` — host provisioning.                                                                                         |
| **Release orchestration**           | `underpost release` — version, tag, and publish.                                                                                   |

Full command listings are in `CLI-HELP.md` (autogenerated from `underpost --help`) and in the reference docs under `nexodev/docs/references/`.

---

## Architectural roles

Three runtime processes participate in a Cyberia deployment. Their ownership boundaries are strict and non-overlapping.

### engine-cyberia (Node.js)

**Content authority. Authoring backend.** Not a real-time gameplay runtime.

Owns:

- Content generation, persistence, validation.
- Map and level generation; portal topology.
- Object-layer editing; atlas and asset metadata.
- Instance/world configuration (gameplay parameters: AOI radius, economy rules, skill rules, equipment rules, entity defaults).
- Persisted character/quest/dialogue/action data.
- gRPC data services (consumed by `cyberia-server` at boot).
- REST APIs for the content pipeline.
- CLI integration for content workflows.
- Web UI tools for content creation.
- Asset distribution endpoints.
- Static content backend.
- Optional client-hints REST endpoint for per-instance presentation overrides.

Does NOT own:

- The authoritative real-time simulation server.
- The client presentation layer.
- Client-only render metadata as authoritative state.
- The runtime game loop.

### cyberia-server (Go)

**Authoritative simulation. Tick-based runtime.**

Owns:

- World simulation: every authoritative state mutation runs through one of its simulation phases.
- Tick advancement at a fixed, server-side `tickRate`.
- AOI replication: per-player interest filtering and snapshot emission.
- Input command processing: typed input commands drained per tick.
- Snapshot generation: AOI-scoped world view per player, with `tick` + `lastAckedSequence` headers.
- Gameplay authority: combat, movement, skills, collision, lifecycle, economy.

Does NOT own:

- Persistence (content is loaded once at boot from engine-cyberia via gRPC).
- Client presentation policy.
- Render metadata.

### cyberia-client (C / WebAssembly)

**Presentation runtime. Prediction client.**

Owns:

- Rendering and UI.
- Input capture (mouse/touch/keyboard → typed input command).
- Client-side prediction of the local player.
- Reconciliation against authoritative snapshots.
- Interpolation of remote entities.
- Local presentation defaults (palette, status-icon visuals, camera knobs, interpolation window, dev overlay).
- Optional client-hints fetch from engine-cyberia for per-instance overrides.

Does NOT own:

- World simulation.
- Economy, combat, or skill outcomes.
- Any state that other clients depend on for correctness.

---

## Startup order — strictly sequential

The three processes start in a fixed order. Do not describe this as parallel.

```
1. Persistent backend / sidecar data layer
   ├─ databases (MongoDB, optional MariaDB)
   ├─ content backend (engine-cyberia REST + gRPC)
   ├─ static asset backend (engine-cyberia + Cloudinary path)
   └─ config and data services

2. cyberia-server
   ├─ dials engine-cyberia gRPC → loads world, instance configuration,
   │  economy rules, skill rules, equipment rules, entity gameplay defaults
   ├─ initializes simulation tick + snapshot replication
   └─ exposes WebSocket + REST health/metrics

3. cyberia-client
   ├─ load tiny inline bootstrap (neutral grey only — splash render)
   ├─ fetch engine-cyberia /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE
   │   — the sole source of palette / status-icon visuals / camera / cell tunings
   ├─ connects to cyberia-server via WebSocket
   └─ enters render frame + prediction loop
```

Why sequential:

- `cyberia-server` cannot run without an InstanceConfig from engine-cyberia. It exits on gRPC dial failure rather than guess.
- `cyberia-client` cannot do useful work until `cyberia-server` is accepting WebSocket connections.

Failure of any earlier step prevents the next from starting cleanly. The platform's deploy orchestration enforces this ordering; ad-hoc parallel launches are not supported.

---

## Canonical vocabulary

Every Underpost Platform document uses these exact terms. Aliases are not permitted.

| Term                      | Definition                                                                                                                                                                       |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **tick**                  | Monotonic simulation step counter, advanced by `cyberia-server` once per simulation step.                                                                                        |
| **tick rate**             | Simulation Hz on `cyberia-server`. The string `fps` does not describe the server.                                                                                                |
| **snapshot**              | An AOI-filtered world view at a given tick for one player. Includes `tick` and `lastAckedSequence`.                                                                              |
| **input command**         | Typed client→server frame: `{kind, clientTick, sequence, payload}`. The unit of client input.                                                                                    |
| **prediction**            | Optimistic local apply of input commands to the predicted self entity on the client.                                                                                             |
| **reconciliation**        | On snapshot arrival, the client drops acknowledged input commands and replays unacked ones.                                                                                      |
| **display smoothing**     | Per-render-frame exponential lerp from the discrete predicted self position to a continuous on-screen position. Hides reconcile snaps and per-tick stepping for the main player. |
| **interpolation**         | Render-time smoothing of remote entities, sampled from snapshot history.                                                                                                         |
| **AOI**                   | Area-of-interest: the spatial filter that defines which entities a given player receives.                                                                                        |
| **replication**           | Production and delivery of snapshots from `cyberia-server` to each client.                                                                                                       |
| **simulation phase**      | A named step inside one simulation tick. Phases are the only mutators of authoritative state.                                                                                    |
| **authoritative server**  | `cyberia-server`. Sole authority on world state.                                                                                                                                 |
| **content authority**     | `engine-cyberia`. Sole authority on persisted content and world configuration.                                                                                                   |
| **client hints**          | Optional presentation overrides served by engine-cyberia. The simulation never reads them.                                                                                       |
| **world configuration**   | Gameplay parameters loaded once at server boot from engine-cyberia via gRPC.                                                                                                     |
| **presentation metadata** | Render-only data (palette, status-icon visuals, camera defaults, dev overlay flag, interpolation window). Client-owned.                                                          |

Forbidden usages:

- "fps" on `cyberia-server` when the meaning is **tick rate**.
- "frame-based" simulation language anywhere on the server.
- "game_state" as a god object on the client.
- "render metadata" as part of server config or persisted instance configuration.
- "presentation fields" stored on authoritative runtime objects.
- "parallel startup" — startup is sequential.
- "engine" without qualification when the project name is meant; use **engine-cyberia** for the Cyberia content backend, **Underpost Platform** for the umbrella product, and **simulation engine** if and only if referring to the gameplay runtime concept.

---

## Presentation metadata ownership

Presentation metadata is client-owned. The authoritative simulation must function with no presentation data of any kind.

| Class                                            | Owner                 | Where it lives                                                                                  |
| ------------------------------------------------ | --------------------- | ----------------------------------------------------------------------------------------------- |
| Palette (named ColorRGBA entries)                | engine-cyberia (REST) | served by `GET /api/cyberia-client-hints/:CYBERIA_CLIENT_HINTS_CODE`. Schema: `SharedDefaultsCyberia.js`. |
| Status-icon visuals (icon stems + border colors) | engine-cyberia (REST) | same                                                                                            |
| Per-entity-type fallback color keys              | engine-cyberia (REST) | same                                                                                            |
| Camera smoothing / zoom defaults                 | engine-cyberia (REST) | same                                                                                            |
| Cell-pixel size, default object dims              | engine-cyberia (REST) | same                                                                                            |
| Interpolation window                             | engine-cyberia (REST) | same                                                                                            |
| Dev-overlay flag                                 | engine-cyberia (REST) | same                                                                                            |

The `cyberia-client` carries **no** compile-time palette. The single tiny exception is an inline neutral-grey bootstrap in `presentation_runtime.c` used for the few frames between window-up and fetch-complete. Every real presentation value comes from the REST hints fetch.

The `cyberia-server` process does not store any of the above. It does not load palette or icon configuration from `engine-cyberia` over gRPC. It does not forward presentation data on the WebSocket. The only "representational" element on the simulation wire is the **active item IDs** carried inside each AOI snapshot.

`engine-cyberia` is the content authority. It exposes presentation as a read-only REST endpoint backed by `CyberiaClientHints` Mongo documents (per-deployment overrides) merged on top of the canonical `SharedDefaultsCyberia.js` schema.

---

## Cyberia as an MMO extension

Cyberia uses Underpost Platform as its host. Specifically:

- **engine-cyberia** is a deploy ID (`dd-cyberia`) inside the Underpost Platform deploy model. Its routes, builds, secrets, manifests, and cron jobs go through the platform's standard surface.
- **cyberia-server** runs as a Kubernetes/LXD workload provisioned by the platform.
- **cyberia-client** ships as a static WASM bundle delivered through the platform's PWA + Workbox pipeline.

Cyberia adds three things on top of the base platform:

1. A tick-based authoritative simulation (`cyberia-server`).
2. A WASM presentation runtime with prediction/reconciliation/interpolation (`cyberia-client`).
3. Real-time WebSocket protocol scaffolding (binary AOI, typed input commands).

Everything else — persistence, content APIs, static delivery, deployment, CI/CD — is Underpost Platform.
