# Cyberia Architecture

Cyberia is the MMO extension that runs on top of Underpost Platform. Keep the model simple:

- Underpost Platform provides the toolchain, deployment surface, PWA delivery, and base infrastructure.
- `engine-cyberia` is the content authority.
- `cyberia-server` is the authoritative simulation.
- `cyberia-client` is the presentation runtime.

---

## System map

```text
Underpost Platform
  -> toolchain, deploy, PWA build, static delivery, monitoring

engine-cyberia (Node.js)
  -> content, validation, persistence, gRPC/REST data services, asset metadata
  -> feeds cyberia-server and cyberia-client

cyberia-server (Go)
  -> authoritative simulation and tick processing
  -> feeds cyberia-client over WebSocket

cyberia-client (C/WASM)
  -> rendering, input, prediction, presentation
```

---

## Responsibility split

| Service          | Owns                                                                      | Must not own                                  |
| ---------------- | ------------------------------------------------------------------------- | --------------------------------------------- |
| `engine-cyberia` | content, validation, persistence, gRPC/REST data services, asset metadata | authoritative simulation, render policy       |
| `cyberia-server` | authoritative simulation, world tick, gameplay mutation, AOI replication  | content authority, presentation metadata      |
| `cyberia-client` | rendering, input, prediction, interpolation, presentation                 | authoritative world state, gameplay authority |

Two boundaries are non-negotiable:

- Do not move authoritative logic into the client.
- Do not move content-authority logic into the Go runtime.

---

## Data flow

```text
engine-cyberia --gRPC--> cyberia-server --WebSocket--> cyberia-client
engine-cyberia --REST-------------------------------> cyberia-client
```

- `engine-cyberia` publishes world content, validation rules, persistence-backed data, and asset metadata.
- `cyberia-server` loads authoritative world data, advances the simulation tick, and emits per-player AOI snapshots.
- `cyberia-client` sends typed input commands upstream and renders the result locally with prediction and interpolation.

There is one source of truth per concern:

- Content and world configuration: `engine-cyberia`
- Real-time authoritative state: `cyberia-server`
- Presentation and local interaction: `cyberia-client`

---

## Operational guardrails

- Prefer one source of truth for config, deploy IDs, runtime selection, startup behavior, and generated assets.
- Reuse existing helpers and conventions instead of creating parallel implementations.
- Do not duplicate parsing, env resolution, or path normalization logic across modules.
- Treat generated artifacts as outputs only; never hand-edit them.

---

## Health states

| State      | Meaning                                                              |
| ---------- | -------------------------------------------------------------------- |
| `healthy`  | all three Cyberia services are up and connected                      |
| `degraded` | at least one service is reconnecting or unavailable                  |
| `standby`  | gameplay is paused because the full three-service set is not healthy |

This is the model to document, operate, and monitor against.
