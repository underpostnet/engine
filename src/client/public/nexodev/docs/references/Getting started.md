# Getting started

Start with the smallest possible mental model of the project:

1. Underpost Platform owns the toolchain, deploy surface, and operational infrastructure.
2. The PWA layer owns SSR views, fallback shells, and service-worker generation.
3. Cyberia adds a three-service MMO runtime on top: `engine-cyberia`, `cyberia-server`, and `cyberia-client`.

If you are working directly on the MMO stack, keep the command split clear:

- use `underpost` for platform, build, deploy, and operations
- use `cyberia` for content, instance, chain, and presentation-hint workflows

---

## Minimal local setup

1. Install `nvm`.
2. Install and use Node `24.15.0`.
3. Install `underpost` globally.
4. Create a project with `underpost new app-name`.

The base local app runs on `http://localhost:4001` after bootstrap.

Split local development is also available through `npm run dev:api ...` and `npm run dev:client ...`
when you want the API and client in separate processes.

---

## What belongs where

- Use `underpost` for platform, infrastructure, build, deploy, and operational workflows.
- Use `cyberia` for Cyberia-specific content and MMO workflows.
- Keep service ownership strict: `engine-cyberia` for content/data, `cyberia-server` for authoritative simulation, `cyberia-client` for presentation.

---

## Important constraints

- `engine-private/` is private. Treat it as an external/private dependency and never assume its contents exist locally.
- Generated assets and build output are outputs only; do not hand-edit them.
- Host-level changes must be explicit, idempotent, reversible, and safe to rerun.
