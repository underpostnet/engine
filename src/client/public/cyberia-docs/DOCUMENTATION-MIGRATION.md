# Documentation Migration Notes

This file is an archival maintenance note. It is not the canonical product narrative.

The active source of truth is:

- [UNDERPOST-PLATFORM.md](UNDERPOST-PLATFORM.md)
- [ARCHITECTURE.md](ARCHITECTURE.md)
- [CYBERIA-SERVER.md](CYBERIA-SERVER.md)
- [CYBERIA-CLIENT.md](CYBERIA-CLIENT.md)
- [CYBERIA-CLI.md](CYBERIA-CLI.md)
- `src/client/public/nexodev/docs/references/PWA and SSR Views.md`

---

## Current model

Use this model in every future rewrite:

| Layer              | Responsibility                                                            |
| ------------------ | ------------------------------------------------------------------------- |
| Underpost Platform | toolchain, deploy, PWA delivery, base infrastructure                      |
| `engine-cyberia`   | content, validation, persistence, gRPC/REST data services, asset metadata |
| `cyberia-server`   | authoritative simulation and tick processing                              |
| `cyberia-client`   | rendering, input, prediction, presentation                                |

The runtime model is parallel health, not a strict sequential startup story.

- The game is playable only when all three Cyberia services are healthy at the same time.
- Each service owns its own monitor and reconnector.
- If one service fails, the game goes to standby until all three recover.

---

## Editing guardrails

- Do not move authoritative logic into the client.
- Do not move content-authority logic into the Go runtime.
- Prefer one source of truth for config, deploy IDs, runtime selection, and generated assets.
- Reuse existing helpers and conventions instead of creating parallel implementations.
- Do not duplicate parsing, env resolution, or path normalization logic across modules.
- Treat generated artifacts as outputs only; never hand-edit them.
- `engine-private/` is private. Reference it only as an external/private dependency.

---

## Historical reminders

- Remove any prose that teaches sequential startup as the operating model.
- Remove refactor labels such as `v4`, `legacy bridge`, or similar migration-era language from user-facing docs.
- Keep presentation metadata out of authoritative server contracts.

This note exists only to prevent drift back to obsolete documentation patterns.
