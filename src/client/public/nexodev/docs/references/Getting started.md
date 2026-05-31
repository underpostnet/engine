# Getting started

Start with the smallest possible map of the project:

1. Toolchain and base infrastructure: [UNDERPOST-PLATFORM.md](../../cyberia-docs/UNDERPOST-PLATFORM.md)
2. PWA workflow: [PWA and SSR Views](PWA and SSR Views.md)
3. Cyberia MMO extension: [ARCHITECTURE.md](../../cyberia-docs/ARCHITECTURE.md)

If you are working directly on the MMO stack, continue with:

4. [CYBERIA-CLI.md](../../cyberia-docs/CYBERIA-CLI.md)
5. [CYBERIA-SERVER.md](../../cyberia-docs/CYBERIA-SERVER.md)
6. [CYBERIA-CLIENT.md](../../cyberia-docs/CYBERIA-CLIENT.md)

---

## Minimal local setup

1. Install `nvm`.
2. Install and use Node `24.15.0`.
3. Install `underpost` globally.
4. Create a project with `underpost new app-name`.

The base local app runs on `http://localhost:4001` after bootstrap.

---

## What belongs where

- Use `underpost` for platform, infrastructure, build, deploy, and operational workflows.
- Use `cyberia` for Cyberia-specific content and MMO workflows.
- Use the Cyberia architecture docs for service boundaries and runtime behavior.

---

## Important constraints

- `engine-private/` is private. Treat it as an external/private dependency and never assume its contents exist locally.
- Generated assets and build output are outputs only; do not hand-edit them.
- Host-level changes must be explicit, idempotent, reversible, and safe to rerun.

---

## Read for depth

- [Command Line Interface](Command Line Interface.md)
- [PWA and SSR Views](PWA and SSR Views.md)
- [UNDERPOST-PLATFORM.md](../../cyberia-docs/UNDERPOST-PLATFORM.md)
- [ARCHITECTURE.md](../../cyberia-docs/ARCHITECTURE.md)
