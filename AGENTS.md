## Use ASD-STE100 Simplified Technical English
Write comments in simplified technical English.

Key rules:
- Use the approved words of ASD-STE100 when possible.
- Use one word for one idea. Do not use two words for the same thing.
- Write short sentences. Use 20 words or less for instructions.
- Use active voice. Write "Turn the switch", not "The switch must be turned"
- Write short paragraphs. Keep one topic in each paragraph.
- No filler.

The goal is easy reading.

Report back to the user following the same rules.

## Brief comments — no archaeology

Comments state the live invariant in ≤1 line. The reader needs current behavior, nothing more.

- Banned content: bug postmortems, "we tried X but Y broke", "previously", "used to", "added because of", historical justification, restoration sagas.
- Test: "If I delete this comment, will a reader misunderstand the code?" No → delete. Yes → minimum text, present tense.
- Decision rationale and bug-fix narration go in the commit message that introduced the change — there it's dated and attributable; on the line it's stale weight forever.
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

## Cyberia

Cyberia is one product on this platform. Everything in this section applies to
Cyberia only, not to the rest of the repo.

### Architecture boundaries

Three processes:

| process | role | talks to |
|---|---|---|
| **cyberia-client** | game client, game canvas | game server (WebSocket), engine (REST) |
| **cyberia-server** | authoritative simulation | client (WebSocket), engine (gRPC + REST) |
| **engine-cyberia** | external content authority (assets, config data, asset data) | serves both; triggers server hot-reload (gRPC control, REST fallback) |

- Keep authoritative simulation out of the cyberia-client.
- Keep content-authority and persistence concerns out of cyberia-server.
- Preserve these boundaries when introducing new flows, APIs, or shared helpers.

### This repo owns the Cyberia manifests

`manifests/` in cyberia-client and cyberia-server is generated here. Their
AGENTS.md says an external system writes it. That system is this repo.

- `src/cli/run.js` → the `instance-build-manifest` runner reads
  `conf.instances.json` from cyberia-instances and writes
  `<project>/manifests/deployments/<id>-<env>/`.
- Change the generator or its input. Never the generated file.
- A manifest bug is a generator bug. Fix it here, then rerun the runner.

### Documentation

- `src/client/public/cyberia-docs/` — Cyberia architecture, server, client, CLI, action, quest, economy, whitepaper, and roadmap documentation.

## Documentation hot paths

- `src/client/public/nexodev/docs/references/` — Underpost CLI, cluster, baremetal, DB, cron, image, LXD, SSH, and static-generator references.
- `engine-private/` is private. Do not assume it exists locally; treat references to it as external/private context.

## One theme per commit
One commit = one logical theme. No bundling unrelated changes.

- Before `git commit`: scan staged diff. ≥2 themes → unstage, commit each theme separately.
- Each commit stages the minimum file set needed for that theme. No drive-by edits, no "while I'm here" cleanups.
- Themes that touch a shared file (`src/api.js`, `src/db/mongo/MongooseDB.js`, `src/projects/cyberia/instance-data.js`): land the feature commits first, then one final "wire X through the runtime" glue commit. Don't merge themes just to avoid the glue commit.
- Commit subject names ONE concern. If you need "and" or "+" to describe it, it's two commits.

