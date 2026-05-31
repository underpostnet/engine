# Underpost Platform

Underpost Platform is the base product. It owns the toolchain, deployment surface, PWA delivery, and operational infrastructure. Cyberia is an MMO extension that runs on top of it; Cyberia is not the platform.

Use the documentation in three layers:

1. Toolchain and base infrastructure: this document
2. PWA workflow: [PWA and SSR Views](../nexodev/docs/references/PWA and SSR Views.md)
3. Cyberia MMO extension: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## Toolchain and base infrastructure

Underpost Platform covers the shared delivery surface for applications and extensions:

| Area            | What it owns                                                                         |
| --------------- | ------------------------------------------------------------------------------------ |
| Toolchain       | `underpost` CLI, build, deploy, release, metadata, secrets, environment selection    |
| Infrastructure  | bare metal, LXD, Kubernetes, K3s, kubeadm, images, SSH, runners                      |
| Data operations | MongoDB, MariaDB where needed, backups, cron, monitoring                             |
| Delivery        | static build, SSR views, PWA packaging, service worker generation, host/path routing |

The platform is the operational backbone. It should stay the source of truth for deploy IDs, runtime selection, host/path layout, generated client assets, and environment resolution.

---

## Underpost CLI

`underpost` is the shared control surface for platform operations:

- project bootstrap
- client builds
- deploy orchestration
- cluster and image workflows
- secret and env resolution
- database and backup flows
- cron and monitoring
- SSH and runner management
- release automation

Cyberia-specific operations belong in `cyberia`, not in parallel platform commands. Use the base CLI for infrastructure and delivery, then layer Cyberia workflows on top.

---

## PWA delivery model

Every deployed client is delivered as a static application shell with PWA support.

- SSR views declare which pages exist and which fallbacks are precached.
- The service worker is generated from the configured view set.
- Offline and maintenance fallbacks are part of the build output, not hand-maintained runtime artifacts.
- Generated outputs such as `sw.js`, static pages, and compiled bundles are outputs only; never edit them by hand.

The detailed workflow lives in [PWA and SSR Views](../nexodev/docs/references/PWA and SSR Views.md).

---

## Cyberia on top of the platform

Cyberia adds a three-service MMO runtime on top of the base platform:

| Service          | Responsibility                                                            |
| ---------------- | ------------------------------------------------------------------------- |
| `engine-cyberia` | content, validation, persistence, gRPC/REST data services, asset metadata |
| `cyberia-server` | authoritative simulation and tick processing                              |
| `cyberia-client` | rendering, input, prediction, presentation                                |

The runtime target is not a strict sequential chain. The ecosystem is usable only when all three Cyberia services are healthy in parallel.

- Each service owns its own monitor and reconnector.
- If one service drops, the game moves to standby.
- When all three recover, gameplay resumes.

Keep the boundaries strict:

- Do not move authoritative logic into the client.
- Do not move content-authority logic into the Go runtime.

---

## Operational rules

- Prefer one source of truth for config, deploy IDs, runtime selection, startup behavior, and generated assets.
- Reuse existing helpers and conventions instead of creating parallel implementations.
- Do not duplicate parsing, env resolution, or path normalization logic across modules.
- Treat generated artifacts as outputs only; never hand-edit them.
- `engine-private/` is a private external dependency. Reference it as private input only and never assume its contents exist locally.

---

## Safety and orchestration

- Any host-level change must be idempotent, reversible, and explicit.
- Never assume mounts, users, groups, namespaces, or volumes already exist.
- Validate before mutating: check paths, permissions, ownership, and target state first.
- Keep orchestration scripts resilient to interruption and safe to rerun.

---

## Related docs

- [ARCHITECTURE.md](ARCHITECTURE.md)
- [CYBERIA-CLI.md](CYBERIA-CLI.md)
- [Command Line Interface](../nexodev/docs/references/Command Line Interface.md)
- [PWA and SSR Views](../nexodev/docs/references/PWA and SSR Views.md)
