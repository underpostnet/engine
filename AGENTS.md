## Commenting policy

- Keep code comments minimal, no redundant or lengthy comment.
- Prefer clear names, small functions, and extracted helpers over explanatory comments.
- Comment only non-obvious intent: invariants, protocol boundaries, security constraints, cross-process contracts, or temporary workarounds.
- Remove stale, redundant, or narrative comments during refactors.
- Use `TODO:` only for concrete, actionable follow-ups.

## Consistency guardrails

- Keep one source of truth for config, deploy IDs, runtime selection, startup order, and generated assets.
- Reuse existing helpers, conventions, and resolution logic instead of introducing parallel implementations.
- Do not duplicate parsing, environment resolution, or path normalization.
- Keep generated artifacts read-only outputs; never hand-edit them.
- No dead code, no legacy code, and no legacy concepts.
- Keep responsibilities explicit and avoid introducing abstractions without a concrete ownership boundary.

## Host, LXD, and orchestration safety

- Treat every host-level change as idempotent, reversible, and explicit.
- Validate target paths, permissions, ownership, mounts, users, groups, namespaces, and volumes before mutating.
- Never assume host resources already exist.
- Prefer dry-run, guarded cleanup, and rollback paths over destructive operations.
- Protect host-mounted volumes and VM bootstrap flows from partial configuration.
- Make orchestration safe to interrupt and safe to rerun.

## Testing and verification

- When changing orchestration, bootstrap, config loading, or runtime startup order, add or update focused tests for parsing, validation, and selection logic.
- For live-service tests, document the required runtime environment and keep execution deterministic.
- Prefer small, targeted verification over broad manual validation.
- Verify changed behavior at the closest layer that owns it.

## Cyberia architecture boundaries

- `engine-cyberia` owns content, validation, persistence, gRPC/REST data services, and asset metadata.
- `cyberia-server` owns authoritative real-time simulation and tick processing.
- `cyberia-client` owns rendering, input, prediction, reconciliation, and presentation.
- Keep authoritative simulation out of the client.
- Keep content-authority and persistence concerns out of the Go runtime.
- Preserve these boundaries when introducing new flows, APIs, or shared helpers.

## Documentation hot paths

- `src/client/public/nexodev/docs/references/` — Underpost CLI, cluster, baremetal, DB, cron, image, LXD, SSH, and static-generator references.
- `src/client/public/cyberia-docs/` — Cyberia architecture, server, client, CLI, action, quest, economy, whitepaper, and roadmap documentation.
- `engine-private/` is private. Do not assume it exists locally; treat references to it as external/private context.
