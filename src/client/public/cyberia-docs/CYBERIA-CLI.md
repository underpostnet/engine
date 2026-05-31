# Cyberia CLI

`cyberia` is the Cyberia-specific extension layer on top of the `underpost` CLI. Use it for MMO content and extension workflows. Use `underpost` for the shared platform, deployment, and infrastructure surface.

Path: `bin/cyberia.js`

---

## What it owns

| Area           | Purpose                                                               |
| -------------- | --------------------------------------------------------------------- |
| `ol`           | object-layer content import, generation, atlas/sprite-sheet workflows |
| `instance`     | import, export, seed, and manage Cyberia instance data                |
| `chain`        | Hyperledger Besu and ObjectLayerToken lifecycle                       |
| `run-workflow` | named operational workflows that bundle existing project helpers      |

This CLI exists to extend the platform for Cyberia. It is not a second infrastructure CLI.

---

## Relationship to Underpost Platform

- `underpost` remains the source of truth for build, deploy, cluster, image, secret, env, db, cron, monitoring, and release operations.
- `cyberia` adds the MMO-specific content and extension workflows that do not belong in the base platform.
- When a concern already exists in `underpost`, reuse it instead of creating a parallel Cyberia implementation.

---

## Operational rules

- Preserve public CLI entrypoints and command names unless a change is intentionally breaking.
- Reuse the existing helpers for config loading, env resolution, path normalization, and deploy selection.
- Prefer one source of truth for generated manifests, deploy IDs, runtime choice, and asset metadata.
- Treat generated artifacts as outputs only; never hand-edit them.
- Reference `engine-private/` only as a private external dependency.

---

## Typical usage

Use `cyberia` when you are doing one of these tasks:

- importing or generating ObjectLayer assets
- exporting or restoring a Cyberia instance
- managing Besu-based chain assets for the Cyberia ecosystem
- running named Cyberia maintenance or build workflows

Use `underpost` when you are doing one of these tasks:

- creating or deploying applications
- choosing environment or deploy targets
- building client bundles or static output
- managing cluster, image, db, secret, cron, runner, or release workflows

---

## Related docs

- [UNDERPOST-PLATFORM.md](UNDERPOST-PLATFORM.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [CYBERIA-SERVER.md](CYBERIA-SERVER.md)
- [CYBERIA-CLIENT.md](CYBERIA-CLIENT.md)
